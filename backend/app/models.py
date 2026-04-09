"""Pydantic models for API request/response contracts."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime


# ──────────────────────── Overview / KPIs ────────────────────────

class OverviewKPIs(BaseModel):
    active_flying_drones: int = 0
    max_speed_mps: float = 0.0
    min_speed_mps: float = 0.0
    avg_speed_mps: float = 0.0
    max_altitude_m: float = 0.0
    min_altitude_m: float = 0.0
    avg_altitude_m: float = 0.0
    near_zone_count: int = 0
    predicted_breach_count: int = 0
    platform_health_score: float = 1.0
    total_drones: int = 0
    grounded_drones: int = 0
    total_events: int = 0
    ingestion_rate_per_sec: float = 0.0
    latest_alerts: List["AlertSummary"] = []


class TrendPoint(BaseModel):
    timestamp: str
    value: float


class OverviewTrends(BaseModel):
    ingestion_per_minute: List[TrendPoint] = []
    error_count_5m: List[TrendPoint] = []
    active_drones_history: List[TrendPoint] = []


class IngestionBucket(BaseModel):
    time: str        # Display time like "06:00"
    timestamp: str   # Full bucket key like "2026-04-08T06:00"
    count: int = 0   # Records ingested in this 30-min window


# ──────────────────────── Map / Drones ────────────────────────

class DronePosition(BaseModel):
    entity_id: str
    event_time: str
    latitude: float
    longitude: float
    altitude_m: float
    speed_mps: float
    heading_deg: float
    is_flying: bool
    temp_internal_c: float
    temp_external_c: float
    near_restricted_zone: bool = False
    predicted_zone_breach: bool = False
    risk_score: float = 0.0


class MapLiveResponse(BaseModel):
    drones: List[DronePosition]
    zones: List["RestrictedZone"]
    timestamp: str


class PolygonStatsRequest(BaseModel):
    polygon_wkt: str


class PolygonStatsResponse(BaseModel):
    drone_count: int = 0
    avg_speed_mps: float = 0.0
    max_speed_mps: float = 0.0
    avg_altitude_m: float = 0.0
    max_altitude_m: float = 0.0
    avg_temp_internal_c: float = 0.0


class DroneDetail(BaseModel):
    entity_id: str
    event_time: str
    latitude: float
    longitude: float
    altitude_m: float
    speed_mps: float
    heading_deg: float
    is_flying: bool
    temp_internal_c: float
    temp_external_c: float
    event_type: str
    observer_id: str
    telemetry_age_s: int = 0
    near_restricted_zone: bool = False
    predicted_zone_breach: bool = False
    risk_score: float = 0.0


class NearbyDroneResult(BaseModel):
    entity_id: str
    event_time: str
    latitude: float
    longitude: float
    altitude_m: float
    distance_m: float


# ──────────────────────── Alerts ────────────────────────

class AlertSummary(BaseModel):
    alert_id: str
    alert_time: str
    entity_id: str
    alert_type: str
    severity: str
    message: str
    risk_score: float


class AlertRecord(BaseModel):
    alert_id: str
    alert_time: str
    entity_id: str
    alert_type: str
    severity: str
    zone_id: Optional[str] = None
    latitude: float
    longitude: float
    altitude_m: float
    message: str
    risk_score: float


class AlertsResponse(BaseModel):
    alerts: List[AlertRecord]
    total_count: int = 0


# ──────────────────────── Zones ────────────────────────

class RestrictedZone(BaseModel):
    zone_id: str
    zone_name: str
    polygon_wkt: str
    severity: str
    enabled: bool = True


class WhatIfZoneRequest(BaseModel):
    polygon_wkt: str
    zone_name: str = "Temporary Zone"
    severity: str = "warning"


class WhatIfZoneResponse(BaseModel):
    zone: RestrictedZone
    drones_inside: int = 0
    drones_nearby: int = 0
    affected_drone_ids: List[str] = []


# ──────────────────────── Query ────────────────────────

class SQLQueryRequest(BaseModel):
    sql: str
    limit: int = 10
    engine: str = "cassandra"


class SQLQueryResult(BaseModel):
    columns: List[str] = []
    rows: List[List[Any]] = []
    row_count: int = 0
    query_time_ms: float = 0.0


class NLQueryRequest(BaseModel):
    prompt: str
    polygon_wkt: Optional[str] = None


class NLQueryResponse(BaseModel):
    sql: Optional[str] = None
    result: Optional[SQLQueryResult] = None
    error: Optional[str] = None
    render_hint: str = "table"  # table, map, chart, kpi
    generated_sql: Optional[str] = None


# ──────────────────────── Platform Health ────────────────────────

class ServiceHealth(BaseModel):
    name: str
    status: str = "unknown"  # up, down, degraded, unknown
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    uptime_seconds: float = 0.0
    last_heartbeat: Optional[str] = None
    restarts: int = 0
    details: Dict[str, Any] = {}


class PlatformHealthResponse(BaseModel):
    services: List[ServiceHealth] = []
    ingestion_throughput: float = 0.0
    trino_queries_active: int = 0
    kafka_consumer_lag: int = 0
    last_data_timestamp: Optional[str] = None
    overall_health_score: float = 1.0
    total_drones: int = 0


# ──────────────────────── Update forward refs ────────────────────────

OverviewKPIs.model_rebuild()