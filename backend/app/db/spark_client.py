"""Spark Thrift Server (HiveServer2) client for HTAP benchmark queries.

Connects to the Spark Thrift Server started inside the spark container.
Uses PyHive which speaks the HiveServer2 binary protocol.
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

    def connect(self):
        """Attempt to connect to the Spark Thrift Server."""
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
        except Exception as e:
            print(f"[db] Failed to connect to Spark Thrift Server: {e}")
            self._connected = False

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
            columns = [desc[0].split(".")[-1] for desc in cur.description]  # strip table prefix
            rows = cur.fetchall()
            cur.close()
            return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            # Connection may be stale — reset so the next call retries
            self._connected = False
            self._conn = None
            raise


spark_client = SparkThriftClient()
