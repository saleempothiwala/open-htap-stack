"""Overview dashboard routes - KPIs and trends."""
from typing import Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter

from app.models import OverviewKPIs, OverviewTrends, TrendPoint, AlertSummary, IngestionBucket
from app.db.cassandra_client import cassandra_client

router = APIRouter(prefix="/api/overview", tags=["overview"])


@router.get("/kpis", response_model=OverviewKPIs)
async def get_overview_kpis():
    kpis = _fetch_kpis()
    alerts = _fetch_latest_alerts()
    return OverviewKPIs(**kpis, latest_alerts=alerts)


@router.get("/trends", response_model=OverviewTrends)
async def get_overview_trends():
    if not cassandra_client.connected:
        return OverviewTrends()
    try:
        rows = cassandra_client.execute_query(
            "SELECT entity_id FROM drone_latest_status"
        )
        now = datetime.now(timezone.utc)
        point = TrendPoint(timestamp=now.isoformat(), value=float(len(rows)))
        return OverviewTrends(
            ingestion_per_minute=[point],
            active_drones_history=[point],
        )
    except Exception:
        return OverviewTrends()


@router.get("/ingestion-history")
async def get_ingestion_history(hours: int = 8):
    """Get ingestion volume in 30-min buckets over the last N hours (8 or 24)."""
    hours = max(1, min(hours, 48))  # clamp to safe range
    if not cassandra_client.connected:
        return {"buckets": []}
    try:
        history = cassandra_client.get_ingestion_history(hours=hours)
        return {
            "hours": hours,
            "buckets": [
                IngestionBucket(
                    time=h["time"],
                    timestamp=h["timestamp"],
                    count=h["count"],
                ).model_dump()
                for h in history
            ]
        }
    except Exception as e:
        print(f"[overview] Error in ingestion-history: {e}")
        return {"buckets": []}


@router.get("/ingestion-history/csv")
async def download_ingestion_csv(hours: int = 8):
    """Download ingestion history as CSV for the log export button."""
    from fastapi.responses import Response
    hours = max(1, min(hours, 48))
    if not cassandra_client.connected:
        return Response(content="time,timestamp,count\n", media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=ingestion_log.csv"})
    try:
        history = cassandra_client.get_ingestion_history(hours=hours)
        lines = ["time,timestamp,count"]
        for h in history:
            lines.append(f"{h['time']},{h['timestamp']},{h['count']}")
        csv_content = "\n".join(lines)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=ingestion_log_{hours}h.csv"},
        )
    except Exception as e:
        return Response(content="time,timestamp,count\n", media_type="text/csv")


@router.post("/resync")
async def trigger_resync():
    """Re-sync: refresh Cassandra connection state and return current KPIs."""
    try:
        if not cassandra_client.connected:
            cassandra_client.connect()
        kpis = _fetch_kpis()
        alerts = _fetch_latest_alerts()
        return {"success": True, "message": "Re-sync complete", "kpis": kpis, "alert_count": len(alerts)}
    except Exception as e:
        return {"success": False, "message": str(e)}

def _fetch_kpis() -> Dict[str, Any]:
    if not cassandra_client.connected:
        return _empty_kpis()
    try:
        kpis = cassandra_client.get_overview_kpis()
        try:
            kpis["ingestion_rate_per_sec"] = cassandra_client.get_ingestion_rate()
        except Exception:
            kpis["ingestion_rate_per_sec"] = 0.0
        return _normalize_kpis(kpis)
    except Exception:
        return _empty_kpis()


def _fetch_latest_alerts(limit: int = 5) -> list:
    if not cassandra_client.connected:
        return []
    try:
        alerts_raw = cassandra_client.get_alerts(limit=limit)
        return [
            AlertSummary(
                alert_id=str(a.get("alert_id", "")),
                alert_time=str(a.get("alert_time", "")),
                entity_id=str(a.get("entity_id", "")),
                alert_type=str(a.get("alert_type", "")),
                severity=str(a.get("severity", "")),
                message=str(a.get("message", "")),
                risk_score=float(a.get("risk_score", 0.0) or 0.0),
            )
            for a in alerts_raw
        ]
    except Exception:
        return []


def _normalize_kpis(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "active_flying_drones": int(raw.get("active_flying_drones", 0)),
        "max_speed_mps": float(raw.get("max_speed_mps", 0.0)),
        "min_speed_mps": float(raw.get("min_speed_mps", 0.0)),
        "avg_speed_mps": float(raw.get("avg_speed_mps", 0.0)),
        "max_altitude_m": float(raw.get("max_altitude_m", 0.0)),
        "min_altitude_m": float(raw.get("min_altitude_m", 0.0)),
        "avg_altitude_m": float(raw.get("avg_altitude_m", 0.0)),
        "near_zone_count": int(raw.get("near_zone_count", 0)),
        "predicted_breach_count": int(raw.get("predicted_breach_count", 0)),
        "total_drones": int(raw.get("total_drones", 0)),
        "grounded_drones": int(raw.get("grounded_drones", 0)),
        "total_events": int(raw.get("total_events", 0)),
        "platform_health_score": 1.0,
        "ingestion_rate_per_sec": float(raw.get("ingestion_rate_per_sec", 0.0)),
    }


def _empty_kpis() -> Dict[str, Any]:
    return _normalize_kpis({})