"""Cassandra database client for HTAP Mission Control."""
import time
from typing import List, Optional, Dict, Any
from cassandra.cluster import Cluster, Session, ExecutionProfile, EXEC_PROFILE_DEFAULT
from cassandra.query import SimpleStatement
from cassandra.policies import DCAwareRoundRobinPolicy, WhiteListRoundRobinPolicy
from cassandra.pool import Host
from datetime import datetime, timezone

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

    def connect(self):
        """Establish connection to Cassandra."""
        if self.connected:
            return

        retries = 0
        max_retries = 30
        while retries < max_retries:
            try:
                # Use address translator to map container IPs to localhost
                # This is critical when running locally against containerized Cassandra
                translator = LocalhostAddressTranslator()
                lb_policy = WhiteListRoundRobinPolicy(["127.0.0.1"])
                
                profile = ExecutionProfile(
                    load_balancing_policy=lb_policy,
                )
                
                self._cluster = Cluster(
                    contact_points=["127.0.0.1"],
                    port=settings.cassandra_port,
                    address_translator=translator,
                    execution_profiles={EXEC_PROFILE_DEFAULT: profile},
                    protocol_version=4,
                )
                self._session = self._cluster.connect(settings.cassandra_keyspace)
                self.connected = True
                print(f"[db] Connected to Cassandra: 127.0.0.1:{settings.cassandra_port}")
                return
            except Exception as e:
                retries += 1
                print(f"[db] Cassandra not ready yet (attempt {retries}/{max_retries}): {e}")
                time.sleep(2)

        raise RuntimeError(f"Could not connect to Cassandra after {max_retries} attempts")

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
        kpis["total_drones"] = rows[0]["cnt"] if rows else 0

        return kpis

    def get_all_drones(self) -> List[Dict[str, Any]]:
        """Get all drones from latest_status for map display."""
        return self.execute_query(
            "SELECT entity_id, event_time, latitude, longitude, altitude_m, "
            "speed_mps, heading_deg, is_flying, temp_internal_c, temp_external_c, "
            "near_restricted_zone, predicted_zone_breach, risk_score "
            "FROM drone_latest_status"
        )

    def get_flying_drones(self) -> List[Dict[str, Any]]:
        """Get only flying drones for map."""
        return self.execute_query(
            "SELECT entity_id, event_time, latitude, longitude, altitude_m, "
            "speed_mps, heading_deg, is_flying, temp_internal_c, temp_external_c, "
            "near_restricted_zone, predicted_zone_breach, risk_score "
            "FROM drone_latest_status WHERE is_flying = true ALLOW FILTERING"
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
        """Get all enabled restricted zones."""
        rows = self.execute_query(
            "SELECT zone_id, zone_name, polygon_wkt, severity, enabled "
            "FROM restricted_zones WHERE enabled = true"
        )
        return rows

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


# Singleton instance
cassandra_client = CassandraClient()