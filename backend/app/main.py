"""HTAP Mission Control - FastAPI Backend (App Factory)"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.cassandra_client import cassandra_client
    from app.db.trino_client import trino_client
    try:
        cassandra_client.connect()
        print("[startup] Cassandra connected successfully")
    except Exception as e:
        print(f"[startup] Warning: Cassandra connection failed: {e}")
    try:
        trino_client.connect()
        print("[startup] Trino connected successfully")
    except Exception as e:
        print(f"[startup] Warning: Trino connection failed: {e}")
    yield
    print("[shutdown] Shutting down HTAP Mission Control backend")


def create_app() -> FastAPI:
    app = FastAPI(
        title="HTAP Mission Control",
        description="REST API for HTAP Mission Control dashboard",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins.split(",") if settings.allowed_origins != "*" else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


    # Simple health check
    from datetime import datetime, timezone
    @app.get("/api/health")
    async def health_check():
        return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

    # Routes
    from app.routes.overview import router as overview_router
    from app.routes.map import router as map_router
    from app.routes.alerts import router as alerts_router
    from app.routes.query import router as query_router
    from app.routes.zones import router as zones_router
    from app.routes.health import router as health_router
    from app.routes.vector import router as vector_router
    from app.routes.settings import router as settings_router

    app.include_router(overview_router)
    app.include_router(map_router)
    app.include_router(alerts_router)
    app.include_router(query_router)
    app.include_router(zones_router)
    app.include_router(health_router)
    app.include_router(vector_router)
    app.include_router(settings_router)

    return app


app = create_app()
