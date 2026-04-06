"""Query routes - SQL and natural language queries."""
import time
import re
from typing import Optional
from fastapi import APIRouter, HTTPException
import httpx

from app.models import SQLQueryRequest, SQLQueryResult, NLQueryRequest, NLQueryResponse
from app.db.cassandra_client import cassandra_client
from app.config import settings

router = APIRouter(prefix="/api/query", tags=["query"])

FORBIDDEN_KEYWORDS = {"DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "TRUNCATE"}


@router.post("/sql", response_model=SQLQueryResult)
async def execute_sql(req: SQLQueryRequest):
    sql = req.sql.strip()
    if not sql.upper().startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
    for kw in FORBIDDEN_KEYWORDS:
        if kw in sql.upper():
            raise HTTPException(status_code=400, detail=f"Forbidden keyword: {kw}")
    if not cassandra_client.connected:
        raise HTTPException(status_code=503, detail="Database unavailable")

    if "LIMIT" not in sql.upper():
        sql = sql + f" LIMIT {req.limit}"
    try:
        start = time.time()
        rows = cassandra_client.execute_query(sql)
        columns = list(rows[0].keys()) if rows else []
        data = [list(r.values()) for r in rows]
        return SQLQueryResult(
            columns=columns, rows=data,
            row_count=len(rows),
            query_time_ms=round((time.time() - start) * 1000, 1),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nl", response_model=NLQueryResponse)
async def nl_query(req: NLQueryRequest):
    prompt = req.prompt.lower().strip()

    if settings.openrouter_api_key:
        sql = await _openrouter_nl_to_sql(prompt)
    else:
        sql = _pattern_nl_to_sql(prompt)

    if not sql:
        return NLQueryResponse(error="Could not understand query.", render_hint="table")

    render_hint = _render_hint(prompt, sql)

    if not cassandra_client.connected:
        return NLQueryResponse(sql=sql, generated_sql=sql, render_hint=render_hint)

    try:
        start = time.time()
        rows = cassandra_client.execute_query(sql + " LIMIT 100")
        columns = list(rows[0].keys()) if rows else []
        data = [list(r.values()) for r in rows]
        return NLQueryResponse(
            sql=sql, generated_sql=sql,
            result=SQLQueryResult(
                columns=columns, rows=data, row_count=len(rows),
                query_time_ms=round((time.time() - start) * 1000, 1),
            ),
            render_hint=render_hint,
        )
    except Exception as e:
        return NLQueryResponse(sql=sql, generated_sql=sql, error=str(e), render_hint=render_hint)


async def _openrouter_nl_to_sql(prompt: str) -> Optional[str]:
    system = (
        "You are a SQL assistant for a drone telemetry database. "
        "You ONLY output SELECT statements.\n\nAvailable tables:\n"
        "- demo.drone_latest_status: entity_id, event_time, latitude, longitude, "
        "altitude_m, speed_mps, heading_deg, is_flying, temp_external_c, "
        "temp_internal_c, near_restricted_zone, predicted_zone_breach, risk_score\n\n"
        "Rules: Only SELECT queries. Return raw SQL only, no markdown."
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://htap-mission-control.local",
                    "X-Title": "HTAP Mission Control",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 500,
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            sql = resp.json()["choices"][0]["message"]["content"].strip()
            sql = sql.replace("```sql", "").replace("```", "").strip()
            return sql if sql.upper().startswith("SELECT") else None
    except Exception as e:
        print(f"[nl] OpenRouter error: {e}")
        return _pattern_nl_to_sql(prompt)


def _pattern_nl_to_sql(prompt: str) -> Optional[str]:
    base = "SELECT entity_id, event_time, latitude, longitude, altitude_m, speed_mps"

    if any(k in prompt for k in ("temperature", "temp")):
        m = re.search(r'(above|over|greater than|below|less than|under|between)\s+(-?\d+\.?\d*)\s*(?:and\s+(\d+\.?\d*))?', prompt)
        if m:
            op, v1, v2 = m.group(1), m.group(2), m.group(3)
            if op == "between" and v2:
                return f"{base}, temp_internal_c, temp_external_c FROM demo.drone_latest_status WHERE temp_internal_c BETWEEN {v1} AND {v2}"
            elif op in ("above", "over", "greater than", "more than"):
                return f"{base}, temp_internal_c, temp_external_c FROM demo.drone_latest_status WHERE temp_internal_c > {v1}"
            else:
                return f"{base}, temp_internal_c, temp_external_c FROM demo.drone_latest_status WHERE temp_internal_c < {v1}"
        return f"{base}, temp_internal_c, temp_external_c FROM demo.drone_latest_status ORDER BY temp_internal_c DESC"

    if any(k in prompt for k in ("altitude", "height")):
        m = re.search(r'(above|over|greater than|below|less than|under|between)\s+(\d+\.?\d*)\s*(?:and\s+(\d+\.?\d*))?', prompt)
        if m:
            op, v1, v2 = m.group(1), m.group(2), m.group(3)
            if op == "between" and v2:
                return f"{base} FROM demo.drone_latest_status WHERE altitude_m BETWEEN {v1} AND {v2}"
            elif op in ("above", "over", "greater than"):
                return f"{base} FROM demo.drone_latest_status WHERE altitude_m > {v1}"
            else:
                return f"{base} FROM demo.drone_latest_status WHERE altitude_m < {v1}"
        return f"{base} FROM demo.drone_latest_status ORDER BY altitude_m DESC"

    if any(k in prompt for k in ("speed", "fast")):
        return f"{base} FROM demo.drone_latest_status ORDER BY speed_mps DESC"
    if any(k in prompt for k in ("flying", "active")):
        return f"{base} FROM demo.drone_latest_status WHERE is_flying = true"
    if any(k in prompt for k in ("breach", "risk")):
        return f"SELECT entity_id, event_time, latitude, longitude, risk_score FROM demo.drone_latest_status WHERE predicted_zone_breach = true ORDER BY risk_score DESC"
    if "near" in prompt and "zone" in prompt:
        return f"{base} FROM demo.drone_latest_status WHERE near_restricted_zone = true"
    if any(k in prompt for k in ("count", "how many", "stats", "stat")):
        return "SELECT count(*) as total, sum(CASE WHEN is_flying THEN 1 ELSE 0 END) as flying FROM demo.drone_latest_status"

    return f"{base} FROM demo.drone_latest_status LIMIT 50"


def _render_hint(prompt: str, sql: str) -> str:
    p = prompt.lower()
    if "map" in p or "polygon" in p or "location" in p:
        return "map"
    if any(k in p for k in ("count", "how many", "stats")):
        return "kpi"
    if any(k in p for k in ("trend", "history", "over time")):
        return "chart"
    return "table"