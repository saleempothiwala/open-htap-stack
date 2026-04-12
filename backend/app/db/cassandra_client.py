"""Cassandra database client for HTAP Mission Control."""
import time
from typing import List, Optional, Dict, Any
from cassandra.cluster import Cluster, Session, ExecutionProfile, EXEC_PROFILE_DEFAULT
from cassandra.query import SimpleStatement
from cassandra.policies import DCAwareRoundRobinPolicy, WhiteListRoundRobinPolicy
from cassandra.pool import Host
from datetime import datetime, timezone, timedelta

from app.config import settings


class LocalhostAddressTranslator:
    """Translates all Cassandra node addresses to localhost for local development."""
    
    def translate(self, addr):
        # Map any container internal IP to localhost
        return "127.0.0.1"


class CassandraClient:
    """Handles connections to Cassandra and provides data access methods."""

    def __init__(self):
        self._cluster: Optional[Cluster] = None
        self._session: Optional[Session] = None
        self.connected = False
        self._last_connect_attempt = 0
        self._connect_timeout = 60  # seconds between forced retries if failed

    def connect(self, force=False):
        """Establish connection to Cassandra."""
        if self.connected and not force:
            return

        # Throttle connection attempts
        now = time.time()
        if not force and not self.connected and (now - self._last_connect_attempt < 10): # retry every 10s if requested
            return

        self._last_connect_attempt = now
        log_file = "/Users/saleem/projects/open-htap-stack/cassandra_debug.log"
        
        with open(log_file, "a") as f:
            f.write(f"\n[{datetime.now().isoformat()}] Attempting connection to {settings.cassandra_host}:{settings.cassandra_port}\n")
            try:
                # Address translator should return the input if it's already an IP we like, 
                # or map container IPs to localhost.
                class SimpleTranslator:
                    def translate(self, addr):
                        return "127.0.0.1"
                
                lb_policy = WhiteListRoundRobinPolicy(["127.0.0.1", "localhost"])
                
                profile = ExecutionProfile(
                    load_balancing_policy=lb_policy,
                    request_timeout=10,
                )
                
                self._cluster = Cluster(
                    contact_points=[settings.cassandra_host],
                    port=settings.cassandra_port,
                    address_translator=SimpleTranslator(),
                    execution_profiles={EXEC_PROFILE_DEFAULT: profile},
                    protocol_version=4,
                )
                
                f.write(f"Cluster object created. Connecting to '{settings.cassandra_keyspace}'...\n")
                self._session = self._cluster.connect(settings.cassandra_keyspace)
                self.connected = True
                f.write("Success! Connected.\n")
                print(f"[db] Connected to Cassandra: {settings.cassandra_host}")
                
            except Exception as e:
                self.connected = False
                f.write(f"Connection failed: {str(e)}\n")
                import traceback
                f.write(traceback.format_exc())
                print(f"[db] Cassandra connection failed: {e}")
                if force:
                    raise e

    def execute_query(self, cql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Execute a CQL query and return results as list of dicts."""
        if not self.connected:
            self.connect()
        rows = self._session.execute(cql, params)
        result = []
        for row in rows:
            d = {}
            for col_name in rows.column_names:
                val = getattr(row, col_name, None)
                # Convert datetime-like objects to ISO strings
                if isinstance(val, datetime):
                    d[col_name] = val.isoformat()
                elif hasattr(val, 'isoformat'):
                    d[col_name] = val.isoformat()
                else:
                    d[col_name] = val
            result.append(d)
        return result

    # ──────────────────────── Overview / KPI queries ────────────────────────

    def get_overview_kpis(self) -> Dict[str, Any]:
        """Get current KPIs for the overview dashboard."""
        kpis = {}

        # Active flying drones
        rows = self.execute_query(
            "SELECT count(*) AS cnt FROM drone_latest_status WHERE is_flying = true ALLOW FILTERING"
        )
        kpis["active_flying_drones"] = rows[0]["cnt"] if rows else 0

        # Speed stats
        rows = self.execute_query(
            "SELECT max(speed_mps) as max_speed, min(speed_mps) as min_speed, "
            "avg(speed_mps) as avg_speed FROM drone_latest_status WHERE is_flying = true ALLOW FILTERING"
        )
        if rows and rows[0]["max_speed"] is not None:
            kpis["max_speed_mps"] = round(rows[0]["max_speed"], 1)
            kpis["min_speed_mps"] = round(rows[0]["min_speed"], 1) if rows[0]["min_speed"] is not None else 0.0
            kpis["avg_speed_mps"] = round(rows[0]["avg_speed"], 1)
        else:
            kpis["max_speed_mps"] = 0.0
            kpis["min_speed_mps"] = 0.0
            kpis["avg_speed_mps"] = 0.0

        # Altitude stats
        rows = self.execute_query(
            "SELECT max(altitude_m) as max_alt, min(altitude_m) as min_alt, "
            "avg(altitude_m) as avg_alt FROM drone_latest_status WHERE is_flying = true ALLOW FILTERING"
        )
        if rows and rows[0]["max_alt"] is not None:
            kpis["max_altitude_m"] = round(rows[0]["max_alt"], 1)
            kpis["min_altitude_m"] = round(rows[0]["min_alt"], 1) if rows[0]["min_alt"] is not None else 0.0
            kpis["avg_altitude_m"] = round(rows[0]["avg_alt"], 1)
        else:
            kpis["max_altitude_m"] = 0.0
            kpis["min_altitude_m"] = 0.0
            kpis["avg_altitude_m"] = 0.0

        # Near zone count
        rows = self.execute_query(
            "SELECT count(*) AS cnt FROM drone_latest_status WHERE near_restricted_zone = true ALLOW FILTERING"
        )
        kpis["near_zone_count"] = rows[0]["cnt"] if rows else 0

        # Predicted breach count
        rows = self.execute_query(
            "SELECT count(*) AS cnt FROM drone_latest_status WHERE predicted_zone_breach = true ALLOW FILTERING"
        )
        kpis["predicted_breach_count"] = rows[0]["cnt"] if rows else 0

        # Total drones
        rows = self.execute_query("SELECT count(*) AS cnt FROM drone_latest_status")
        total = rows[0]["cnt"] if rows else 0
        kpis["total_drones"] = total
        kpis["grounded_drones"] = total - kpis.get("active_flying_drones", 0)

        # Total events (sum of all ingestion buckets)
        try:
            rows = self.execute_query("SELECT record_count FROM ingestion_counts")
            kpis["total_events"] = sum((r["record_count"] or 0) for r in rows)
        except Exception:
            kpis["total_events"] = 0

        return kpis

    def get_all_drones(self) -> List[Dict[str, Any]]:
        """Get all drones from latest_status for map display."""
        return self.execute_query(
            "SELECT entity_id, event_time, latitude, longitude, altitude_m, "
            "speed_mps, heading_deg, is_flying, temp_internal_c, temp_external_c, "
            "near_restricted_zone, predicted_zone_breach, risk_score "
            "FROM drone_latest_status LIMIT 500"
        )

    def get_flying_drones(self) -> List[Dict[str, Any]]:
        """Get only flying drones for map."""
        return self.execute_query(
            "SELECT entity_id, event_time, latitude, longitude, altitude_m, "
            "speed_mps, heading_deg, is_flying, temp_internal_c, temp_external_c, "
            "near_restricted_zone, predicted_zone_breach, risk_score "
            "FROM drone_latest_status WHERE is_flying = true ALLOW FILTERING LIMIT 500"
        )

    def get_drone_detail(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Get details for a specific drone."""
        rows = self.execute_query(
            "SELECT entity_id, event_time, latitude, longitude, altitude_m, "
            "speed_mps, heading_deg, is_flying, temp_internal_c, temp_external_c, "
            "event_type, observer_id, telemetry_age_s, near_restricted_zone, "
            "predicted_zone_breach, risk_score "
            "FROM drone_latest_status WHERE entity_id = %s",
            (entity_id,)
        )
        return rows[0] if rows else None

    def get_zones(self) -> List[Dict[str, Any]]:
        """Get all enabled restricted zones.
        
        Fetches all zone rows and filters enabled=True in Python to avoid
        requiring an SAI or secondary index on the `enabled` boolean column.
        The restricted_zones table is tiny (< 100 rows) so a full scan is free.
        Also re-seeds any missing zones so the map always shows polygons.
        """
        rows = self.execute_query(
            "SELECT zone_id, zone_name, polygon_wkt, severity, enabled "
            "FROM restricted_zones"
        )
        # If table is empty, transparently re-seed the demo zones
        if not rows:
            self._seed_restricted_zones()
            rows = self.execute_query(
                "SELECT zone_id, zone_name, polygon_wkt, severity, enabled "
                "FROM restricted_zones"
            )
        return [r for r in rows if r.get("enabled", True)]

    def _seed_restricted_zones(self):
        """Insert the three Oslo demo zones if the table is empty."""
        zones = [
            (
                "zone-oslo-airport", "Oslo Lufthavn Gardermoen",
                "POLYGON((11.05 60.18, 11.15 60.18, 11.15 60.22, 11.05 60.22, 11.05 60.18))",
                "critical", True,
            ),
            (
                "zone-royal-palace", "Det Kongelige Slott",
                "POLYGON((10.72 59.91, 10.74 59.91, 10.74 59.92, 10.72 59.92, 10.72 59.91))",
                "critical", True,
            ),
            (
                "zone-fornebu", "Fornebu Tech Park",
                "POLYGON((10.62 59.88, 10.66 59.88, 10.66 59.90, 10.62 59.90, 10.62 59.88))",
                "warning", True,
            ),
        ]
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        for zone_id, name, wkt, severity, enabled in zones:
            try:
                self.execute_query(
                    "INSERT INTO restricted_zones "
                    "(zone_id, zone_name, polygon_wkt, severity, enabled, updated_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s) IF NOT EXISTS",
                    (zone_id, name, wkt, severity, enabled, now),
                )
            except Exception as e:
                print(f"[db] zone seed error ({zone_id}): {e}")

    def get_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent alerts across all buckets."""
        all_alerts = []
        # Get alerts from last few hourly buckets
        now = datetime.now(timezone.utc)
        for i in range(6):  # Last 6 hours
            bucket = (now.replace(minute=0, second=0, microsecond=0).isoformat()[:13]).replace("+", "T").split("T")[0] + "T" + str(now.replace(minute=0, second=0, microsecond=0).hour).zfill(2)
            # Use a simpler bucket format
            bucket = now.strftime("%Y-%m-%dT%H")
            bucket_ts = now.replace(minute=0, second=0, microsecond=0)
            rows = self.execute_query(
                "SELECT alert_id, alert_time, entity_id, alert_type, severity, "
                "zone_id, latitude, longitude, altitude_m, message, risk_score "
                "FROM alerts_by_bucket WHERE bucket = %s LIMIT %s",
                (bucket, limit - len(all_alerts))
            )
            all_alerts.extend(rows)
            now = now.replace(hour=(now.hour - 1) % 24)
            if len(all_alerts) >= limit:
                break

        return all_alerts[:limit]

    def get_drones_in_polygon(self, polygon_wkt: str) -> List[Dict[str, Any]]:
        """Get all drones (we'll filter server-side since Cassandra doesn't support ST_Contains natively)."""
        return self.get_flying_drones()

    def get_ingestion_history(self, hours: int = 8) -> List[Dict[str, Any]]:
        """Get ingestion counts for the last N hours in 30-minute buckets."""
        now = datetime.now(timezone.utc)
        num_buckets = hours * 2  # 2 buckets per hour
        results = []

        for i in range(num_buckets - 1, -1, -1):  # oldest first
            t = now - timedelta(minutes=30 * i)
            minute_bucket = 0 if t.minute < 30 else 30
            bucket_key = f"{t.strftime('%Y-%m-%dT%H')}:{minute_bucket:02d}"
            display_time = f"{t.strftime('%H')}:{minute_bucket:02d}"

            try:
                rows = self.execute_query(
                    "SELECT record_count FROM ingestion_counts WHERE bucket = %s",
                    (bucket_key,)
                )
                count = rows[0]["record_count"] if rows else 0
            except Exception:
                count = 0

            results.append({
                "time": display_time,
                "timestamp": bucket_key,
                "count": count or 0,
            })

        return results

    def get_ingestion_rate(self) -> float:
        """Get the current ingestion rate in records per second from the last completed 30-min bucket."""
        now = datetime.now(timezone.utc)
        # Use the previous completed 30-min bucket
        t = now - timedelta(minutes=30)
        minute_bucket = 0 if t.minute < 30 else 30
        bucket_key = f"{t.strftime('%Y-%m-%dT%H')}:{minute_bucket:02d}"

        try:
            # Check current bucket first
            minute_bucket = 0 if now.minute < 30 else 30
            bucket_key = f"{now.strftime('%Y-%m-%dT%H')}:{minute_bucket:02d}"
            rows = self.execute_query(
                "SELECT record_count FROM ingestion_counts WHERE bucket = %s",
                (bucket_key,)
            )
            count = rows[0]["record_count"] if rows else 0
            
            # If current bucket is small, check the previous one too
            if count < 100:
                t = now - timedelta(minutes=30)
                minute_bucket = 0 if t.minute < 30 else 30
                bucket_key = f"{t.strftime('%Y-%m-%dT%H')}:{minute_bucket:02d}"
                rows = self.execute_query(
                    "SELECT record_count FROM ingestion_counts WHERE bucket = %s",
                    (bucket_key,)
                )
                prev_count = rows[0]["record_count"] if rows else 0
                return (prev_count or 0) / 1800.0
            
            # Estimate rate based on elapsed time in current bucket
            elapsed_sec = (now.minute % 30) * 60 + now.second
            if elapsed_sec > 10:
                return count / elapsed_sec
            return 0.0
        except Exception:
            return 0.0


# Singleton instance
cassandra_client = CassandraClient()