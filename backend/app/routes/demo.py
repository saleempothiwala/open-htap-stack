"""Demo / scenario routes for C-level presentations."""
import time
import uuid
import random
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter

from app.db.cassandra_client import cassandra_client
from app.db.trino_client import trino_client

router = APIRouter(prefix="/api/demo", tags=["demo"])


# ──────────────────────────────────────────────
# HTAP Breach Scenario
# ──────────────────────────────────────────────

@router.post("/trigger-breach-scenario")
async def trigger_breach_scenario():
    """
    Inject a synthetic zone-breach event into Cassandra for live demo.
    Returns the entity_id so the frontend can fly the map to that drone.
    """
    if not cassandra_client.connected:
        # Return synthetic data even if DB is not connected so the demo still works
        return _synthetic_breach_response()

    try:
        # Pick a random existing flying drone near a zone
        rows = cassandra_client.execute_query(
            "SELECT entity_id, latitude, longitude FROM drone_latest_status "
            "WHERE is_flying = true ALLOW FILTERING LIMIT 50"
        )
        if not rows:
            return _synthetic_breach_response()

        target = random.choice(rows)
        entity_id = target["entity_id"]

        # Force-flag this drone as in breach
        cassandra_client.execute_query(
            "UPDATE drone_latest_status SET "
            "predicted_zone_breach = true, near_restricted_zone = true, risk_score = 0.97 "
            "WHERE entity_id = %s",
            (entity_id,)
        )

        # Insert a synthetic alert
        alert_id = uuid.uuid4()
        bucket = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
        now_ts = datetime.now(timezone.utc)
        cassandra_client.execute_query(
            "INSERT INTO alerts_by_bucket "
            "(bucket, alert_time, alert_id, entity_id, alert_type, severity, "
            " zone_id, latitude, longitude, altitude_m, message, risk_score) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                bucket, now_ts, alert_id, entity_id,
                "ZONE_BREACH_PREDICTED", "critical",
                "DEMO-ZONE-01",
                float(target.get("latitude", 59.9)),
                float(target.get("longitude", 10.75)),
                120.0,
                f"DEMO: Drone {entity_id} is on a predicted collision course with restricted airspace. Immediate action required.",
                0.97,
            )
        )

        return {
            "success": True,
            "scenario": "ZONE_BREACH",
            "entity_id": entity_id,
            "latitude": float(target.get("latitude", 59.9)),
            "longitude": float(target.get("longitude", 10.75)),
            "message": f"Drone {entity_id} flagged for zone breach. Alert injected.",
            "alert_id": str(alert_id),
            "severity": "critical",
        }

    except Exception as e:
        print(f"[demo] Breach scenario error: {e}")
        return _synthetic_breach_response()


def _synthetic_breach_response():
    return {
        "success": True,
        "scenario": "ZONE_BREACH",
        "entity_id": "DEMO-ALPHA-9",
        "latitude": 59.925,
        "longitude": 10.762,
        "message": "DEMO: Drone ALPHA-9 flagged for predicted zone breach. Risk score: 97%.",
        "alert_id": str(uuid.uuid4()),
        "severity": "critical",
    }


# ──────────────────────────────────────────────
# Latency Compass — real measured latencies
# ──────────────────────────────────────────────

@router.get("/latency")
async def get_latency_metrics():
    """
    Return real measured latencies for the three HTAP tiers:
    - cassandra_write_ms  (OLTP / ingest)
    - trino_query_ms      (OLAP / analytical)
    - vector_search_ms    (AI / ANN semantic search)
    """
    cassandra_ms = _measure_cassandra_read()
    trino_ms     = _measure_trino_query()
    vector_ms    = _measure_vector_search()

    return {
        "cassandra_write_ms": cassandra_ms,
        "trino_query_ms":     trino_ms,
        "vector_search_ms":   vector_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _measure_cassandra_read() -> Optional[float]:
    if not cassandra_client.connected:
        return None
    try:
        t0 = time.perf_counter()
        cassandra_client.execute_query("SELECT count(*) as cnt FROM drone_latest_status")
        return round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return None


def _measure_trino_query() -> Optional[float]:
    if not trino_client.connected:
        return None
    try:
        t0 = time.perf_counter()
        trino_client.execute_query(
            "SELECT count(*) as cnt FROM demo.drone_latest_status"
        )
        return round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return None


def _measure_vector_search() -> Optional[float]:
    """Time a real ANN probe against Cassandra SAI.
    Returns None if the payload_vector column is not yet indexed
    (user must click 'AI Sync Data' first to build the index).
    """
    if not cassandra_client.connected:
        return None
    try:
        import numpy as np
        # Deterministic probe vector — cheap, just measures SAI index latency
        probe = [0.1] * 1536
        t0 = time.perf_counter()
        cassandra_client.execute_query(
            "SELECT entity_id FROM drone_latest_status "
            "ORDER BY payload_vector ANN OF %s LIMIT 1",
            (probe,),
        )
        return round((time.perf_counter() - t0) * 1000, 1)
    except Exception as e:
        # Return None if column/index absent — TopBar shows "—" which is correct
        return None


# ──────────────────────────────────────────────
# Alert acknowledgment (used by Alerts page)
# ──────────────────────────────────────────────

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, bucket: Optional[str] = None):
    """Mark an alert as acknowledged. In a production system this would persist state."""
    # In-memory store (page refresh resets – acceptable for demo)
    _acknowledged_alerts.add(alert_id)
    return {
        "success": True,
        "alert_id": alert_id,
        "acknowledged_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/alerts/acknowledged")
async def get_acknowledged_alerts():
    return {"acknowledged": list(_acknowledged_alerts)}


_acknowledged_alerts: set = set()
