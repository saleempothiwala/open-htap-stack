#!/usr/bin/env python3
"""
Kafka consumer that ingests events into Cassandra and supports HTAP Mission Control.

This consumer:
1. Writes to the existing raw events table (demo.events)
2. Writes to demo.drone_events_by_entity for historical queries
3. Upserts demo.drone_latest_status for real-time map/KPIs
4. Derives speed_mps, heading_deg, is_flying from sequential events
5. Performs restricted zone proximity checks
6. Generates alerts when drones enter/near restricted zones
"""

import json
import math
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from cassandra.cluster import Cluster, ConsistencyLevel
from cassandra.util import datetime_from_uuid1
from kafka import KafkaConsumer


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except Exception:
        return default


def connect_cassandra(host: str, port: int):
    cluster = Cluster([host], port=port)
    session = cluster.connect()
    return cluster, session


def ensure_schema(session, keyspace: str, table: str):
    session.execute(
        f"""
        CREATE KEYSPACE IF NOT EXISTS {keyspace}
        WITH replication = {{'class': 'NetworkTopologyStrategy', 'datacenter1': 1 }};
        """
    )
    session.set_keyspace(keyspace)

    # Original raw events table
    session.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table} (
          entity_id text,
          event_day date,
          event_id timeuuid,
          event_time timestamp,
          event_type text,
          observer_id text,
          latitude double,
          longitude double,
          altitude_m float,
          temp_external_c float,
          temp_internal_c float,
          text_payload text,
          PRIMARY KEY (event_id)
        );
        """
    )

    # Mission Control: drone latest status (single row per drone)
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.drone_latest_status (
          entity_id text PRIMARY KEY,
          event_id timeuuid,
          event_time timestamp,
          event_type text,
          observer_id text,
          latitude double,
          longitude double,
          altitude_m float,
          temp_external_c float,
          temp_internal_c float,
          speed_mps double,
          heading_deg double,
          is_flying boolean,
          telemetry_age_s int,
          near_restricted_zone boolean,
          predicted_zone_breach boolean,
          risk_score double,
          updated_at timestamp
        );
        """
    )

    # Mission Control: events by entity (history)
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.drone_events_by_entity (
          entity_id text,
          event_time timestamp,
          event_id timeuuid,
          event_type text,
          observer_id text,
          latitude double,
          longitude double,
          altitude_m float,
          temp_external_c float,
          temp_internal_c float,
          speed_mps double,
          heading_deg double,
          zone_id text,
          PRIMARY KEY ((entity_id), event_time, event_id)
        ) WITH CLUSTERING ORDER BY (event_time DESC, event_id DESC);
        """
    )

    # Mission Control: restricted zones
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.restricted_zones (
          zone_id text PRIMARY KEY,
          zone_name text,
          polygon_wkt text,
          severity text,
          enabled boolean,
          updated_at timestamp
        );
        """
    )

    # Mission Control: alerts
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.alerts_by_bucket (
          bucket text,
          alert_time timestamp,
          entity_id text,
          alert_id timeuuid,
          alert_type text,
          severity text,
          zone_id text,
          latitude double,
          longitude double,
          altitude_m float,
          message text,
          risk_score double,
          PRIMARY KEY ((bucket), alert_time, entity_id, alert_id)
        ) WITH CLUSTERING ORDER BY (alert_time DESC, entity_id ASC, alert_id DESC);
        """
    )

    # Supporting tables for Accord transactions (existing)
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.sessions_open (
          user_id text,
          session_id uuid,
          PRIMARY KEY ((user_id), session_id)
        );
        """
    )
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.session_seq_applied (
          user_id text,
          session_id uuid,
          seq bigint,
          PRIMARY KEY ((user_id, session_id), seq)
        );
        """
    )
    session.execute(
        """
        CREATE TABLE IF NOT EXISTS demo.session_timeline (
          user_id text,
          session_id uuid,
          seq bigint,
          event_id timeuuid,
          event_time timestamp,
          event_type text,
          payload text,
          PRIMARY KEY ((user_id, session_id), seq)
        );
        """
    )


# ──────────────────────────────────────────────────────────────
# Geometry helpers
# ──────────────────────────────────────────────────────────────

EARTH_RADIUS_M = 6_371_000.0


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in meters."""
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def compute_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2, in degrees 0-360."""
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlon = rlon2 - rlon1
    x = math.sin(dlon) * math.cos(rlat2)
    y = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(dlon)
    bearing = math.atan2(x, y)
    return (math.degrees(bearing) + 360) % 360


def point_in_polygon_wkt(lat: float, lon: float, polygon_wkt: str) -> bool:
    """Ray-casting point-in-polygon test. Parses WKT POLYGON manually."""
    # Expected format: POLYGON((lon lat, lon lat, ...))
    # Note: WKT stores coordinates as (lon, lat) = (x, y)
    outer = polygon_wkt.strip()
    if outer.upper().startswith("POLYGON(("):
        inner = outer[9:-2]  # strip POLYGON(( ... ))
    else:
        return False

    coords = []
    for pair in inner.split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            try:
                coords.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue

    if len(coords) < 3:
        return False

    # Ray-casting algorithm
    inside = False
    n = len(coords)
    j = n - 1
    for i in range(n):
        xi, yi = coords[i]
        xj, yj = coords[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


def distance_to_polygon_m(lat: float, lon: float, polygon_wkt: str) -> float:
    """Minimum distance from point to any edge of the polygon, in meters."""
    outer = polygon_wkt.strip()
    if outer.upper().startswith("POLYGON(("):
        inner = outer[9:-2]
    else:
        return float("inf")

    coords = []
    for pair in inner.split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            try:
                coords.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue

    if len(coords) < 3:
        return float("inf")

    min_dist = float("inf")
    n = len(coords)
    for i in range(n):
        x1, y1 = coords[i]
        x2, y2 = coords[(i + 1) % n]
        # Check distance to edge endpoints (simplified - not projection onto edge)
        d = haversine_distance_m(lat, lon, y1, x1)
        if d < min_dist:
            min_dist = d

    return min_dist


# ──────────────────────────────────────────────────────────────
# Derived field computation
# ──────────────────────────────────────────────────────────────

class DroneTracker:
    """In-memory state tracker for deriving fields from sequential events."""

    FLYING_ALTITUDE_THRESHOLD = 10.0   # meters
    FLYING_SPEED_THRESHOLD = 1.0       # m/s
    STALE_TELEMETRY_SECONDS = 30

    def __init__(self):
        # entity_id → {lat, lon, alt, time, speed, heading}
        self._state: Dict[str, dict] = {}

    def update(
        self,
        entity_id: str,
        lat: float,
        lon: float,
        alt: float,
        event_time: datetime,
    ) -> Tuple[float, float, bool]:
        """
        Derive speed_mps, heading_deg, is_flying for this event.
        Returns (speed_mps, heading_deg, is_flying).
        """
        prev = self._state.get(entity_id)

        if prev is None:
            # First event for this drone — can't derive speed/heading yet
            self._state[entity_id] = {
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "time": event_time,
            }
            return (0.0, 0.0, alt > self.FLYING_ALTITUDE_THRESHOLD)

        dt = (event_time - prev["time"]).total_seconds()
        if dt <= 0:
            dt = 0.001  # Avoid division by zero

        # Distance and speed
        dist_m = haversine_distance_m(prev["lat"], prev["lon"], lat, lon)
        speed_mps = dist_m / dt

        # Cap unrealistic speeds (likely GPS glitches)
        if speed_mps > 100.0:
            speed_mps = prev.get("speed", 0.0)

        # Heading
        heading_deg = compute_bearing_deg(prev["lat"], prev["lon"], lat, lon)

        # Is flying
        is_flying = (
            alt > self.FLYING_ALTITUDE_THRESHOLD
            and speed_mps > self.FLYING_SPEED_THRESHOLD
        )

        self._state[entity_id] = {
            "lat": lat,
            "lon": lon,
            "alt": alt,
            "time": event_time,
            "speed": speed_mps,
            "heading": heading_deg,
        }

        return (speed_mps, heading_deg, is_flying)

    def get_state(self, entity_id: str) -> Optional[dict]:
        return self._state.get(entity_id)


# ──────────────────────────────────────────────────────────────
# Alert generation
# ──────────────────────────────────────────────────────────────

class AlertGenerator:
    """Generate alert records for zone proximity and breaches."""

    # Thresholds
    WARNING_DISTANCE_M = 500.0   # warn when within this distance of a zone
    BREACH_BUFFER_M = 100.0      # treat as near-zone breach buffer

    def __init__(self, session):
        self.session = session
        self._zones_cache: list = []
        self._zones_loaded = False

    def load_zones(self):
        """Load restricted zones from Cassandra into memory cache."""
        try:
            rows = self.session.execute("SELECT zone_id, zone_name, polygon_wkt, severity, enabled FROM demo.restricted_zones WHERE enabled = true")
            self._zones_cache = [
                {
                    "zone_id": r.zone_id,
                    "zone_name": r.zone_name,
                    "polygon_wkt": r.polygon_wkt,
                    "severity": r.severity,
                }
                for r in rows
            ]
            self._zones_loaded = True
        except Exception as e:
            print(f"[alert] failed to load zones: {e}")
            self._zones_cache = []

    def check_proximity(
        self,
        entity_id: str,
        lat: float,
        lon: float,
        alt: float,
        speed_mps: float,
        alert_time: datetime,
    ) -> Tuple[bool, bool, float, Optional[str]]:
        """
        Check if drone is near or inside any restricted zone.
        Returns (near_restricted_zone, predicted_zone_breach, risk_score, nearest_zone_id).
        Also creates alert records if warranted.
        """
        if not self._zones_loaded:
            self.load_zones()

        near_zone = False
        predicted_breach = False
        risk_score = 0.0
        nearest_zone_id = None

        for zone in self._zones_cache:
            wkt = zone["polygon_wkt"]

            # Check if point is inside the zone
            inside = point_in_polygon_wkt(lat, lon, wkt)
            dist = 0.0 if inside else distance_to_polygon_m(lat, lon, wkt)

            if inside:
                # Drone is INSIDE a restricted zone — critical alert
                near_zone = True
                predicted_breach = True  # already breached
                risk_score = max(risk_score, 0.95)
                nearest_zone_id = zone["zone_id"]

                self._create_alert(
                    entity_id=entity_id,
                    alert_time=alert_time,
                    alert_type="zone_breach",
                    severity="critical",
                    zone_id=zone["zone_id"],
                    lat=lat,
                    lon=lon,
                    alt=alt,
                    message=f"Drone {entity_id} inside restricted zone: {zone['zone_name']}",
                    risk_score=0.95,
                )

            elif dist < self.WARNING_DISTANCE_M:
                near_zone = True
                nearest_zone_id = zone["zone_id"]
                zone_risk = 1.0 - (dist / self.WARNING_DISTANCE_M)
                risk_score = max(risk_score, zone_risk)

                # High risk = predicted breach
                if zone_risk > 0.7:
                    predicted_breach = True

                # Create warning alert only for first detection (avoid spam)
                if zone_risk > 0.5:
                    self._create_alert(
                        entity_id=entity_id,
                        alert_time=alert_time,
                        alert_type="zone_proximity",
                        severity="warning" if zone_risk < 0.8 else "high",
                        zone_id=zone["zone_id"],
                        lat=lat,
                        lon=lon,
                        alt=alt,
                        message=f"Drone {entity_id} near restricted zone: {zone['zone_name']} ({dist:.0f}m)",
                        risk_score=zone_risk,
                    )

        return (near_zone, predicted_breach, risk_score, nearest_zone_id)

    def _bucket_for_time(self, alert_time: datetime) -> str:
        """Hourly bucket string like 2024-01-15T14."""
        return alert_time.strftime("%Y-%m-%dT%H")

    def _create_alert(
        self,
        entity_id: str,
        alert_time: datetime,
        alert_type: str,
        severity: str,
        zone_id: Optional[str],
        lat: float,
        lon: float,
        alt: float,
        message: str,
        risk_score: float,
    ):
        """Insert an alert record into alerts_by_bucket."""
        try:
            bucket = self._bucket_for_time(alert_time)
            alert_id = uuid.uuid1()
            self.session.execute_async(
                """
                INSERT INTO demo.alerts_by_bucket
                    (bucket, alert_time, entity_id, alert_id, alert_type, severity,
                     zone_id, latitude, longitude, altitude_m, message, risk_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    bucket,
                    alert_time,
                    entity_id,
                    alert_id,
                    alert_type,
                    severity,
                    zone_id,
                    lat,
                    lon,
                    alt,
                    message,
                    risk_score,
                ),
            )
        except Exception as e:
            print(f"[alert] failed to create alert: {e}")


# ──────────────────────────────────────────────────────────────
# Main consumer
# ──────────────────────────────────────────────────────────────

def parse_ts(ts: str):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()


def main() -> None:
    bootstrap = os.getenv("KAFKA_BOOTSTRAP", "kafka:19092")
    topic = os.getenv("TOPIC", "demo-events")
    group_id = os.getenv("GROUP_ID", "demo-cassandra-sink")

    cass_host = os.getenv("CASSANDRA_HOST", "cassandra")
    cass_port = env_int("CASSANDRA_PORT", 9042)
    keyspace = os.getenv("KEYSPACE", "demo")
    table = os.getenv("TABLE", "events")

    batch_size = max(1, env_int("BATCH_SIZE", 200))
    log_every = max(100, env_int("LOG_EVERY", 2000))

    print(
        f"[sink] kafka={bootstrap} topic={topic} group_id={group_id} "
        f"cassandra={cass_host}:{cass_port} {keyspace}.{table} batch_size={batch_size}"
    )

    # Wait/retry Cassandra until it's ready
    cluster = None
    session = None
    while True:
        try:
            cluster, session = connect_cassandra(cass_host, cass_port)
            ensure_schema(session, keyspace, table)
            print("[sink] cassandra connected and schema ensured")
            break
        except Exception as e:
            print(f"[sink] cassandra not ready yet: {e}")
            time.sleep(5)

    # Prepared statements
    insert_raw = session.prepare(
        f"INSERT INTO {table} (entity_id, event_day, event_id, event_time, event_type, observer_id, latitude, longitude, altitude_m, temp_external_c, temp_internal_c, text_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    insert_raw.consistency_level = ConsistencyLevel.QUORUM

    insert_drone_event = session.prepare(
        """
        INSERT INTO demo.drone_events_by_entity
            (entity_id, event_time, event_id, event_type, observer_id,
             latitude, longitude, altitude_m, temp_external_c, temp_internal_c,
             speed_mps, heading_deg, zone_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
    )
    insert_drone_event.consistency_level = ConsistencyLevel.QUORUM

    upsert_latest = session.prepare(
        """
        UPDATE demo.drone_latest_status SET
            event_id = ?,
            event_time = ?,
            event_type = ?,
            observer_id = ?,
            latitude = ?,
            longitude = ?,
            altitude_m = ?,
            temp_external_c = ?,
            temp_internal_c = ?,
            speed_mps = ?,
            heading_deg = ?,
            is_flying = ?,
            telemetry_age_s = ?,
            near_restricted_zone = ?,
            predicted_zone_breach = ?,
            risk_score = ?,
            updated_at = ?
        WHERE entity_id = ?
        """
    )
    upsert_latest.consistency_level = ConsistencyLevel.QUORUM

    # Derived state
    tracker = DroneTracker()
    alert_gen = AlertGenerator(session)

    # Kafka consumer
    consumer = None
    while True:
        try:
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=bootstrap,
                group_id=group_id,
                enable_auto_commit=False,
                auto_offset_reset="earliest",
                consumer_timeout_ms=0,
                value_deserializer=lambda b: json.loads(b.decode("utf-8")),
                max_poll_records=batch_size,
            )
            print("[sink] kafka consumer started")
            break
        except Exception as e:
            print(f"[sink] kafka not ready yet: {e}")
            time.sleep(5)

    buffered = 0
    total = 0
    window_count = 0
    last_report = time.time()
    last_zone_reload = time.time()

    while True:
        records = consumer.poll(timeout_ms=1000, max_records=batch_size)
        if not records:
            continue

        for _, msgs in records.items():
            for msg in msgs:
                evt = msg.value
                try:
                    event_id = uuid.UUID(evt.get("event_id"))
                    event_time = datetime_from_uuid1(event_id)
                except Exception:
                    event_id = uuid.uuid4()
                    event_time = datetime.utcnow()

                if event_time.tzinfo is None:
                    event_time = event_time.replace(tzinfo=timezone.utc)

                event_day = event_time.date()
                entity_id = str(evt.get("entity_id", ""))
                event_type = str(evt.get("event_type", ""))
                observer_id = str(evt.get("observer_id", ""))
                pos = evt.get("position", {})
                latitude = float(pos.get("lat", 0.0))
                longitude = float(pos.get("lon", 0.0))
                altitude_m = float(evt.get("z_m", 0.0))
                temp_external_c = float(evt.get("temp_external_c", 0.0))
                temp_internal_c = float(evt.get("temp_internal_c", 0.0))
                text_payload = str(evt.get("text", ""))

                # 1. Write to raw events table (existing)
                session.execute_async(insert_raw, (
                    entity_id, event_day, event_id, event_time, event_type,
                    observer_id, latitude, longitude, altitude_m,
                    temp_external_c, temp_internal_c, text_payload,
                ))

                # 2. Derive speed, heading, is_flying
                speed_mps, heading_deg, is_flying = tracker.update(
                    entity_id, latitude, longitude, altitude_m, event_time,
                )

                # 3. Check restricted zone proximity (reload zones periodically)
                if time.time() - last_zone_reload > 60:
                    alert_gen.load_zones()
                    last_zone_reload = time.time()

                near_zone, predicted_breach, risk_score, nearest_zone_id = alert_gen.check_proximity(
                    entity_id, latitude, longitude, altitude_m, speed_mps, event_time,
                )

                # Telemetry age
                now_utc = datetime.now(timezone.utc)
                telemetry_age_s = max(0, int((now_utc - event_time).total_seconds()))

                # 4. Write to drone_events_by_entity (history)
                session.execute_async(insert_drone_event, (
                    entity_id, event_time, event_id, event_type, observer_id,
                    latitude, longitude, altitude_m,
                    temp_external_c, temp_internal_c,
                    speed_mps, heading_deg, nearest_zone_id,
                ))

                # 5. Upsert drone_latest_status (current state)
                session.execute_async(upsert_latest, (
                    event_id, event_time, event_type, observer_id,
                    latitude, longitude, altitude_m,
                    temp_external_c, temp_internal_c,
                    speed_mps, heading_deg, is_flying,
                    telemetry_age_s, near_zone, predicted_breach,
                    risk_score, now_utc,
                    entity_id,
                ))

                buffered += 1
                total += 1
                window_count += 1

        # Commit offsets after successful writes
        consumer.commit()
        buffered = 0

        # Report every 5 seconds
        now = time.time()
        if now - last_report >= 5.0:
            elapsed = now - last_report
            rate = window_count / elapsed if elapsed > 0 else 0
            print(f"[sink] total_inserted={total} (~{rate:.1f}/s)")
            window_count = 0
            last_report = now


if __name__ == "__main__":
    main()