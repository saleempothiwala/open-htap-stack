"""Map routes - live drones, polygon stats, nearby drones."""
from typing import Dict, Any, List
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from app.models import (
    DronePosition, MapLiveResponse, RestrictedZone,
    PolygonStatsRequest, PolygonStatsResponse, NearbyDroneResult,
)
from app.db.cassandra_client import cassandra_client
from app.utils.geometry import parse_wkt_polygon, point_in_polygon, haversine_distance_m, distance_to_polygon_m

router = APIRouter(prefix="/api/map", tags=["map"])


def _row_to_drone(row: Dict[str, Any]) -> DronePosition:
    """Convert database row to DronePosition."""
    event_time = row.get("event_time") or ""
    if isinstance(event_time, datetime):
        event_time = event_time.isoformat()
    return DronePosition(
        entity_id=str(row.get("entity_id", "")),
        event_time=event_time,
        latitude=float(row.get("latitude") or 0.0),
        longitude=float(row.get("longitude") or 0.0),
        altitude_m=float(row.get("altitude_m") or 0.0),
        speed_mps=float(row.get("speed_mps") or 0.0),
        heading_deg=float(row.get("heading_deg") or 0.0),
        is_flying=bool(row.get("is_flying")),
        temp_internal_c=float(row.get("temp_internal_c") or 0.0),
        temp_external_c=float(row.get("temp_external_c") or 0.0),
        near_restricted_zone=bool(row.get("near_restricted_zone")),
        predicted_zone_breach=bool(row.get("predicted_zone_breach")),
        risk_score=float(row.get("risk_score") or 0.0),
    )


def _to_zone(row: Dict[str, Any]) -> RestrictedZone:
    return RestrictedZone(
        zone_id=str(row.get("zone_id", "")),
        zone_name=str(row.get("zone_name", "")),
        polygon_wkt=str(row.get("polygon_wkt", "")),
        severity=str(row.get("severity", "warning")),
        enabled=bool(row.get("enabled", True)),
    )


@router.get("/live")
async def get_map_live(limit: int = 100):
    """Get live map data.
    
    Args:
        limit: Max number of drones to return (default 100 for performance)
    """
    if not cassandra_client.connected:
        return MapLiveResponse(drones=[], zones=[], timestamp=datetime.now(timezone.utc).isoformat())
    try:
        drones_raw = cassandra_client.get_all_drones()
        zones_raw = cassandra_client.get_zones()
        
        # Apply limit - take a sample from the global dataset
        drones_raw = drones_raw[:limit]
        
        return MapLiveResponse(
            drones=[_row_to_drone(r) for r in drones_raw],
            zones=[_to_zone(r) for r in zones_raw],
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as e:
        print(f"[map] Error in /live: {e}")
        import traceback
        traceback.print_exc()
        return MapLiveResponse(drones=[], zones=[], timestamp=datetime.now(timezone.utc).isoformat())


@router.get("/flying")
async def get_flying_drones():
    if not cassandra_client.connected:
        return {"drones": []}
    try:
        drones_raw = cassandra_client.get_flying_drones()
        return {"drones": [_row_to_drone(r).model_dump() for r in drones_raw]}
    except Exception:
        return {"drones": []}


@router.post("/polygon-stats", response_model=PolygonStatsResponse)
async def get_polygon_stats(req: PolygonStatsRequest):
    if not cassandra_client.connected:
        return PolygonStatsResponse()
    try:
        drones_raw = cassandra_client.get_all_drones()
        polygon = parse_wkt_polygon(req.polygon_wkt)
        speeds, alts, temps = [], [], []
        for d in drones_raw:
            lat, lon = d.get("latitude"), d.get("longitude")
            if lat is None or lon is None:
                continue
            if point_in_polygon(float(lat), float(lon), polygon):
                speeds.append(float(d.get("speed_mps", 0) or 0))
                alts.append(float(d.get("altitude_m", 0) or 0))
                temps.append(float(d.get("temp_internal_c", 0) or 0))
        count = len(speeds)
        return PolygonStatsResponse(
            drone_count=count,
            avg_speed_mps=round(sum(speeds) / count, 1) if count else 0.0,
            max_speed_mps=round(max(speeds), 1) if speeds else 0.0,
            avg_altitude_m=round(sum(alts) / count, 1) if count else 0.0,
            max_altitude_m=round(max(alts), 1) if alts else 0.0,
            avg_temp_internal_c=round(sum(temps) / count, 1) if temps else 0.0,
        )
    except Exception:
        return PolygonStatsResponse()


@router.get("/drone/{entity_id}")
async def get_drone_detail(entity_id: str):
    if not cassandra_client.connected:
        raise HTTPException(status_code=503, detail="Database unavailable")
    row = cassandra_client.get_drone_detail(entity_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Drone {entity_id} not found")
    return _row_to_drone(row)


@router.get("/drone/{entity_id}/nearby")
async def get_nearby_drones(entity_id: str, meters: int = 50):
    if not cassandra_client.connected:
        return {"drones": []}
    target = cassandra_client.get_drone_detail(entity_id)
    if not target:
        return {"drones": []}
    tlat, tlon = target.get("latitude", 0.0), target.get("longitude", 0.0)
    nearby = []
    for d in cassandra_client.get_flying_drones():
        if d.get("entity_id") == entity_id:
            continue
        dlat, dlon = d.get("latitude", 0.0), d.get("longitude", 0.0)
        dist = haversine_distance_m(tlat, tlon, dlat, dlon)
        if dist <= meters:
            nearby.append(NearbyDroneResult(
                entity_id=str(d["entity_id"]),
                event_time=str(d.get("event_time", "")),
                latitude=float(dlat),
                longitude=float(dlon),
                altitude_m=float(d.get("altitude_m", 0) or 0),
                distance_m=round(dist, 1),
            ))
    return {"drones": [n.model_dump() for n in nearby]}