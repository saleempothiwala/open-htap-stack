from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import numpy as np
import asyncio

from app.db.cassandra_client import cassandra_client
from app.config import settings

router = APIRouter(prefix="/api/vector", tags=["vector"])

class VectorSearchRequest(BaseModel):
    query: str
    limit: int = 5

class VectorSearchResponse(BaseModel):
    results: List[Dict[str, Any]]
    query_time_ms: float

async def get_embedding(text: str) -> List[float]:
    """Get embedding from OpenAI or OpenRouter (or mock if no key)."""
    api_key = settings.openai_api_key or settings.openrouter_api_key
    
    # Use OpenAI directly if key is available, else fallback to OpenRouter
    if settings.openai_api_key:
        print("[DEBUG] Embedding engine: OpenAI")
        url = "https://api.openai.com/v1/embeddings"
        model = "text-embedding-3-small"
    elif settings.openrouter_api_key:
        print(f"[DEBUG] Embedding engine: OpenRouter ({settings.openrouter_api_key[:8]}...)")
        url = "https://openrouter.ai/api/v1/embeddings"
        model = "openai/text-embedding-3-small"
    else:
        print("[DEBUG] Embedding engine: Mock (No API key found)")
        # Mock: Deterministic random vector based on hash of text
        np.random.seed(hash(text) % (2**32))
        return np.random.uniform(-1, 1, 1536).tolist()
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "input": text
                },
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
    except Exception as e:
        print(f"Error fetching embedding: {e}")
        # Fallback to mock
        np.random.seed(hash(text) % (2**32))
        return np.random.uniform(-1, 1, 1536).tolist()

@router.post("/search", response_model=VectorSearchResponse)
async def vector_search(req: VectorSearchRequest):
    import time
    start_time = time.time()
    
    if not cassandra_client.connected:
        cassandra_client.connect()
    
    # 1. Embed query
    query_vector = await get_embedding(req.query)
    
    # 2. Search Cassandra
    # CQL: SELECT * FROM drone_latest_status ORDER BY payload_vector ANN OF ? LIMIT ?
    try:
        # Scylla/Cassandra ANN syntax
        query = "SELECT entity_id, observer_id, latitude, longitude, altitude_m, temp_external_c, is_flying, text_payload FROM demo.drone_latest_status ORDER BY payload_vector ANN OF %s LIMIT %s"
        rows = cassandra_client.execute_query(query, (query_vector, req.limit))
        
        return VectorSearchResponse(
            results=rows,
            query_time_ms=(time.time() - start_time) * 1000
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector search failed: {str(e)}")


@router.post("/index-all")
async def index_all(background_tasks: BackgroundTasks):
    """Background task to index all existing drones with concurrency."""
    background_tasks.add_task(_run_indexing)
    return {"status": "started", "message": "Indexing process started in background."}


def _ensure_vector_schema() -> bool:
    """
    Ensure text_payload and payload_vector columns exist, and the SAI index is in place.
    Uses ADD IF NOT EXISTS so it is safe to call on every indexer run — completely idempotent.
    Returns True when the schema is ready, False if a hard error occurred.
    """
    session = cassandra_client._session

    # Column migrations — order matters: text_payload first
    migrations = [
        "ALTER TABLE demo.drone_latest_status ADD IF NOT EXISTS text_payload text",
        "ALTER TABLE demo.drone_latest_status ADD IF NOT EXISTS payload_vector vector<float, 1536>",
    ]

    for cql in migrations:
        try:
            session.execute(cql)
        except Exception as e:
            err = str(e).lower()
            # "already exists" and "duplicate" variants across Cassandra / DSE versions are fine
            if any(kw in err for kw in ("already exists", "duplicate", "invalid query")):
                pass  # column already present — not an error
            else:
                print(f"[INDEXER] Schema migration warning: {e}")
                return False

    # SAI index — must follow column creation
    try:
        session.execute(
            "CREATE CUSTOM INDEX IF NOT EXISTS payload_vector_idx "
            "ON demo.drone_latest_status (payload_vector) "
            "USING 'org.apache.cassandra.index.sai.StorageAttachedIndex'"
        )
    except Exception as e:
        err = str(e).lower()
        if "already exists" not in err and "duplicate" not in err:
            print(f"[INDEXER] SAI index warning (non-fatal): {e}")

    return True


async def _run_indexing():
    if not cassandra_client.connected:
        cassandra_client.connect()

    # ── Step 1: Self-heal schema before any vector writes ────────────────────
    print("[INDEXER] Verifying vector schema (applying migrations if needed)...")
    loop = asyncio.get_event_loop()
    schema_ok = await loop.run_in_executor(None, _ensure_vector_schema)
    if not schema_ok:
        print("[INDEXER] Aborting — could not apply required vector schema migrations.")
        return
    print("[INDEXER] Schema verified.")

    try:
        # Fetch all drones — text_payload column now guaranteed to exist
        rows = cassandra_client.execute_query(
            "SELECT entity_id, text_payload FROM demo.drone_latest_status"
        )
        total_rows = len(rows)
        if total_rows == 0:
            print("[INDEXER] No drone rows found — nothing to index.")
            return
        print(f"[INDEXER] Starting indexing for {total_rows} drones...")

        sem = asyncio.Semaphore(10)
        indexed_count = 0
        skipped_count = 0

        async def index_one(row):
            nonlocal indexed_count, skipped_count
            async with sem:
                entity_id = row["entity_id"]
                text = row.get("text_payload") or ""
                if not text.strip():
                    skipped_count += 1
                    return False
                try:
                    vector = await get_embedding(text)
                    cassandra_client.execute_query(
                        "UPDATE demo.drone_latest_status SET payload_vector = %s WHERE entity_id = %s",
                        (vector, entity_id),
                    )
                    indexed_count += 1
                    if indexed_count % 50 == 0:
                        print(f"[INDEXER] Progress: {indexed_count}/{total_rows} (skipped {skipped_count} — no text)")
                    return True
                except Exception as e:
                    print(f"[INDEXER] Error indexing {entity_id}: {e}")
                    return False

        tasks = [index_one(row) for row in rows]
        await asyncio.gather(*tasks)
        print(
            f"[INDEXER] Done. Indexed: {indexed_count} | "
            f"Skipped (no text): {skipped_count} | Total: {total_rows}"
        )

    except Exception as e:
        print(f"[INDEXER] Fatal error during indexing: {e}")
