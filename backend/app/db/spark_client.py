"""Spark Thrift Server (HiveServer2) client for HTAP benchmark queries.

Connects to the Spark Thrift Server started inside the spark container.
Uses PyHive which speaks the HiveServer2 binary protocol.

Table registration strategy
───────────────────────────
Spark's Thrift Server can't resolve the Cassandra data source at read-time
via the short alias (no META-INF/services entry in the connector JAR).
We therefore register the table as a Spark JDBC source backed by Trino,
which is Spark-native (no extra JARs) and reads the same live Cassandra data.
"""
import os
import time
from typing import List, Dict, Any

from app.config import settings


class SparkThriftClient:
    """Thin wrapper around PyHive's Hive DBAPI connector."""

    def __init__(self):
        self._conn = None
        self._connected = False

    # Trino JDBC URL — inside the container network it's trino:8080;
    # from the host (dev mode) it's localhost:8088
    _TRINO_JDBC_HOST = os.getenv("TRINO_HOST_OVERRIDE", "localhost")
    _TRINO_JDBC_PORT = int(os.getenv("TRINO_PORT_OVERRIDE", "8088"))

    def connect(self):
        """Attempt to connect to the Spark Thrift Server and register tables."""
        try:
            from pyhive import hive  # type: ignore
            host = os.getenv("SPARK_THRIFT_HOST", settings.spark_thrift_host)
            port = int(os.getenv("SPARK_THRIFT_PORT", str(settings.spark_thrift_port)))
            self._conn = hive.connect(
                host=host,
                port=port,
                database="default",
                auth="NONE",
                configuration={"hive.execution.engine": "spark"},
            )
            self._connected = True
            print(f"[db] Connected to Spark Thrift Server: {host}:{port}")
            # Register Cassandra data via Trino JDBC (Spark-native, no extra JARs)
            self._register_tables()
        except Exception as e:
            print(f"[db] Failed to connect to Spark Thrift Server: {e}")
            self._connected = False

    def _register_tables(self):
        """Create a JDBC-backed Spark table that reads Cassandra data via Trino.

        Trino's JDBC driver is already on Spark's classpath and doesn't need
        extra setup. The resulting table is queryable with standard SparkSQL.
        """
        jdbc_url = (
            f"jdbc:trino://{self._TRINO_JDBC_HOST}:{self._TRINO_JDBC_PORT}"
            f"/cassandra/demo"
        )
        ddl = f"""
CREATE TABLE IF NOT EXISTS default.drone_latest_status
USING jdbc
OPTIONS (
  url        '{jdbc_url}',
  dbtable    'drone_latest_status',
  driver     'io.trino.jdbc.TrinoDriver',
  user       'spark'
)
"""
        try:
            cur = self._conn.cursor()
            cur.execute(ddl.strip())
            cur.close()
            print("[db] Spark JDBC table drone_latest_status registered (via Trino)")
        except Exception as e:
            print(f"[db] Spark table registration warning: {e}")

    @property
    def connected(self) -> bool:
        return self._connected

    def execute_query(self, sql: str) -> List[Dict[str, Any]]:
        """Execute a SQL query and return rows as a list of dicts."""
        if not self._connected:
            self.connect()

        if not self._connected:
            raise RuntimeError("Spark Thrift Server not connected")

        try:
            cur = self._conn.cursor()
            cur.execute(sql)
            columns = [desc[0].split(".")[-1] for desc in cur.description]
            rows = cur.fetchall()
            cur.close()
            return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            # Connection may be stale — reset so the next call retries
            self._connected = False
            self._conn = None
            raise


spark_client = SparkThriftClient()
