"""Settings / Demo Controls routes."""
import os
import json
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

# Load .env so os.getenv picks up values even when the backend is run directly
# with uvicorn (not via pydantic-settings). Safe to call multiple times.
try:
    from dotenv import load_dotenv
    _env_file = Path(__file__).parent.parent.parent.parent / ".env"
    if _env_file.exists():
        load_dotenv(_env_file, override=False)
except ImportError:
    pass

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Shared settings file — written by this backend, read by the producer container
# via a bind-mount. Deleted on startup so pod restart reverts to env-var defaults.
_SETTINGS_FILE = Path(__file__).parent.parent.parent.parent / "settings-cache" / "demo-settings.json"


def _delete_settings_file() -> None:
    """Called at startup. Removing the file means the producer falls back to
    env-var defaults, honouring the 'pod restart = revert to defaults' contract."""
    try:
        _SETTINGS_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def _write_settings_file(s: "DemoSettings") -> None:
    try:
        _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SETTINGS_FILE.write_text(json.dumps({
            "drones_enabled": s.drones_enabled,
            "events_per_sec": s.events_per_sec,
            "outlier_percent": s.outlier_percent,
            "inject_breach_alerts": s.inject_breach_alerts,
            "replay_mode": s.replay_mode,
            "replay_minutes": s.replay_minutes,
        }))
    except Exception as e:
        print(f"[settings] failed to write settings file: {e}")


# Delete any stale settings file from a previous run so defaults are used.
_delete_settings_file()


def _defaults_from_env() -> "DemoSettings":
    """Read default settings from environment variables (set by compose)."""
    return DemoSettings(
        drones_enabled=int(os.getenv("N_ENTITIES", "100")),
        events_per_sec=int(os.getenv("EVENTS_PER_SEC", "5000")),
        outlier_percent=float(os.getenv("OUTLIER_PERCENT", "5.0")),
        inject_breach_alerts=False,
        replay_mode=False,
        replay_minutes=10,
    )


class DemoSettings(BaseModel):
    drones_enabled: int = 100
    events_per_sec: int = 5000
    outlier_percent: float = 5.0
    inject_breach_alerts: bool = False
    replay_mode: bool = False
    replay_minutes: int = 10


class DemoSettingsResponse(BaseModel):
    settings: DemoSettings
    success: bool = True
    message: str = ""


# In-memory store — seeded from env vars at startup.
# Reverts to env-var defaults automatically when the pod is restarted.
_demo_settings: DemoSettings = _defaults_from_env()


@router.get("/demo/defaults", response_model=DemoSettingsResponse)
async def get_default_settings():
    """Return the pod-startup defaults (derived from env vars / compose config).
    The UI can call this to offer a 'Reset to Defaults' action.
    """
    return DemoSettingsResponse(
        settings=_defaults_from_env(),
        message="Pod startup defaults",
    )


@router.get("/demo", response_model=DemoSettingsResponse)
async def get_demo_settings():
    return DemoSettingsResponse(settings=_demo_settings)


@router.post("/demo", response_model=DemoSettingsResponse)
async def update_demo_settings(settings: DemoSettings):
    global _demo_settings
    _demo_settings = settings
    _write_settings_file(settings)   # producer picks this up via bind-mount
    return DemoSettingsResponse(
        settings=_demo_settings,
        message="Demo settings updated successfully",
    )


@router.post("/demo/inject-alert")
async def inject_demo_alert(entity_id: Optional[str] = None):
    """Simulate an alert for testing purposes."""
    return {
        "success": True,
        "message": f"Demo alert injected for {entity_id or 'random drone'}",
    }


@router.post("/demo/cleanup")
async def cleanup_stale_drones():
    """Truncate drone_latest_status to remove stale rows from previous producer runs.
    Use this after changing N_ENTITIES (drones_enabled) so the KPIs reflect
    the new fleet size rather than the old larger one stored in Cassandra.
    """
    from app.db.cassandra_client import cassandra_client
    if not cassandra_client.connected:
        return {"success": False, "message": "Cassandra not connected"}
    try:
        cassandra_client.execute_query("TRUNCATE drone_latest_status")
        return {
            "success": True,
            "message": "Stale drone records cleared. KPIs will reset as new telemetry arrives.",
        }
    except Exception as e:
        return {"success": False, "message": str(e)}