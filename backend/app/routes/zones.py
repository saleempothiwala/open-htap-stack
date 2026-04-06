"""Zones routes - restricted zones and what-if simulation."""
from fastapi import APIRouter

from app.models import RestrictedZone, WhatIfZoneRequest, WhatIfZoneResponse
from app.db.cassandra_client import cassandra_client
from app.utils.geometry import parse_wkt_polygon, point_in_polygon, distance_to_polygon_m

router = APIRouter(prefix="/api/zones", tags=["zones"])


@router.get("")
async def get_zones():
    """Get all enabled restricted zones."""
    if not cassandra_client.connected:
        return {"zones": []}
    zones_raw = cassandra_client.get_zones()
    zones = [
        RestrictedZone(
            zone_id=str(r.get("zone_id", "")),
            zone_name=str(r.get("zone_name", "")),
            polygon_wkt=str(r.get("polygon_wkt", "")),
            severity=str(r.get("severity", "warning")),
            enabled=bool(r.get("enabled", True)),
        )
        for r in zones_raw
    ]
    return {"zones": [z.model_dump() for z in zones]}


@router.post("/what-if", response_model=WhatIfZoneResponse)
async def what_if_zone(req: WhatIfZoneRequest):
    """Simulate a temporary restricted zone."""
    zone = RestrictedZone(
        zone_id="temp-zone-" + str(hash(req.polygon_wkt) % 100000),
        zone_name=req.zone_name,
        polygon_wkt=req.polygon_wkt,
        severity=req.severity,
        enabled=True,
    )
    if not cassandra_client.connected:
        return WhatIfZoneResponse(zone=zone)
    try:
        drones_raw = cassandra_client.get_all_drones()
        polygon = parse_wkt_polygon(req.polygon_wkt)
        inside_ids, nearby_ids = [], []
        for d in drones_raw:
            lat, lon = d.get("latitude"), d.get("longitude")
            if lat is None or lon is None:
                continue
            eid = str(d.get("entity_id", ""))
            if point_in_polygon(float(lat), float(lon), polygon):
                inside_ids.append(eid)
            elif distance_to_polygon_m(float(lat), float(lon), polygon) < 500:
                nearby_ids.append(eid)
        return WhatIfZoneResponse(
            zone=zone,
            drones_inside=len(inside_ids),
            drones_nearby=len(nearby_ids),
            affected_drone_ids=inside_ids + nearby_ids,
        )
    except Exception:
        return WhatIfZoneResponse(zone=zone)