"""Platform health routes."""
import socket
from typing import Dict, Any, List
from fastapi import APIRouter

from app.config import settings
from app.models import ServiceHealth, PlatformHealthResponse
from app.db.cassandra_client import cassandra_client

router = APIRouter(prefix="/api/platform", tags=["platform"])

SERVICE_CHECKS = [
    ("Cassandra", settings.cassandra_host, settings.cassandra_port),
    ("Kafka", "localhost", 9092),
    ("Presto/Trino", settings.trino_host, settings.trino_port),
    ("Spark", "localhost", 10000),
]


def _check_service(host: str, port: int) -> Dict[str, Any]:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex((host, port))
        sock.close()
        return {"status": "up" if result == 0 else "down"}
    except Exception:
        return {"status": "unknown"}


@router.get("/health", response_model=PlatformHealthResponse)
async def get_platform_health():
    services: List[ServiceHealth] = []
    up_count = 0
    for name, host, port in SERVICE_CHECKS:
        status = _check_service(host, port)
        if status["status"] == "up":
            up_count += 1
        services.append(ServiceHealth(name=name, **status))

    total_drones = 0
    if cassandra_client.connected:
        try:
            rows = cassandra_client.execute_query("SELECT count(*) as cnt FROM drone_latest_status")
            total_drones = rows[0]["cnt"] if rows else 0
        except Exception:
            pass

    health_score = up_count / len(services) if services else 0.0
    return PlatformHealthResponse(
        services=services,
        total_drones=total_drones,
        overall_health_score=health_score,
    )