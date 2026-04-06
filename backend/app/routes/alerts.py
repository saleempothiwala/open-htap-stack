"""Alerts routes."""
from typing import Optional
from fastapi import APIRouter, Query

from app.models import AlertRecord, AlertsResponse
from app.db.cassandra_client import cassandra_client

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=AlertsResponse)
async def get_alerts(
    severity: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    if not cassandra_client.connected:
        return AlertsResponse(alerts=[], total_count=0)
    try:
        alerts_raw = cassandra_client.get_alerts(limit=limit)
        alerts = []
        for a in alerts_raw:
            if severity and a.get("severity") != severity:
                continue
            alerts.append(AlertRecord(
                alert_id=str(a.get("alert_id", "")),
                alert_time=str(a.get("alert_time", "")),
                entity_id=str(a.get("entity_id", "")),
                alert_type=str(a.get("alert_type", "")),
                severity=str(a.get("severity", "")),
                zone_id=str(a["zone_id"]) if a.get("zone_id") else None,
                latitude=float(a.get("latitude", 0) or 0),
                longitude=float(a.get("longitude", 0) or 0),
                altitude_m=float(a.get("altitude_m", 0) or 0),
                message=str(a.get("message", "")),
                risk_score=float(a.get("risk_score", 0) or 0),
            ))
        return AlertsResponse(alerts=alerts, total_count=len(alerts))
    except Exception:
        return AlertsResponse(alerts=[], total_count=0)