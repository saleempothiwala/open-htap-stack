import trino
import os
from typing import List, Dict, Any, Optional
import time

from app.config import settings

class TrinoClient:
    def __init__(self):
        self._conn = None
        self._connected = False

    def connect(self):
        """Establish connection to Trino."""
        try:
            # Use 'localhost' if running outside container, or 'presto' if inside
            host = os.getenv("TRINO_HOST_OVERRIDE", settings.trino_host)
            
            self._conn = trino.dbapi.connect(
                host=host,
                port=settings.trino_port,
                user=settings.trino_user,
                catalog=settings.trino_catalog,
                schema=settings.trino_schema,
            )
            self._connected = True
            print(f"[db] Connected to Trino: {host}:{settings.trino_port}")
        except Exception as e:
            print(f"[db] Failed to connect to Trino: {e}")
            self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    def execute_query(self, sql: str) -> List[Dict[str, Any]]:
        """Execute a SQL query and return rows as list of dicts."""
        if not self._connected:
            self.connect()
        
        if not self._connected:
            raise Exception("Trino not connected")

        cur = self._conn.cursor()
        try:
            cur.execute(sql)
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            
            # Map columns to values
            return [dict(zip(columns, row)) for row in rows]
        finally:
            cur.close()

import os
trino_client = TrinoClient()
