"""Geometry utility functions for spatial calculations."""
import math
from typing import List, Tuple, Optional


def parse_wkt_polygon(wkt: str) -> List[Tuple[float, float]]:
    """Parse WKT POLYGON to list of (lon, lat) tuples."""
    wkt = wkt.strip()
    if wkt.upper().startswith("POLYGON(("):
        inner = wkt[9:-2]
    elif wkt.upper().startswith("POLYGON("):
        inner = wkt[8:-1]
    else:
        return []

    coords = []
    for pair in inner.split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            try:
                coords.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return coords


def point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test. polygon is list of (lon, lat)."""
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / max(yj - yi, 0.0001) + xi):
            inside = not inside
        j = i
    return inside


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in meters between two lat/lon points."""
    R = 6_371_000.0
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def distance_to_polygon_m(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> float:
    """Minimum distance from point to any vertex of the polygon, in meters."""
    if not polygon:
        return float("inf")
    min_dist = float("inf")
    for px, py in polygon:
        d = haversine_distance_m(lat, lon, py, px)
        if d < min_dist:
            min_dist = d
    return min_dist


def compute_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2, in degrees 0-360."""
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlon = rlon2 - rlon1
    x = math.sin(dlon) * math.cos(rlat2)
    y = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(dlon)
    bearing = math.atan2(x, y)
    return (math.degrees(bearing) + 360) % 360