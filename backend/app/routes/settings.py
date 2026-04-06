"""Settings / Demo Controls routes."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/settings", tags=["settings"])


class DemoSettings(BaseModel):
    drones_enabled: int = 100
    events_per_sec: int = 500
    outlier_percent: float = 5.0
    inject_breach_alerts: bool = False
    replay_mode: bool = False
    replay_minutes: int = 10


class DemoSettingsResponse(BaseModel):
    settings: DemoSettings
    success: bool = True
    message: str = ""


# In-memory demo settings (would be persisted in production)
_demo_settings = DemoSettings()


@router.get("/demo", response_model=DemoSettingsResponse)
async def get_demo_settings():
    return DemoSettingsResponse(settings=_demo_settings)


@router.post("/demo", response_model=DemoSettingsResponse)
async def update_demo_settings(settings: DemoSettings):
    global _demo_settings
    _demo_settings = settings
    return DemoSettingsResponse(
        settings=_demo_settings,
        message="Demo settings updated successfully",
    )


@router.post("/demo/inject-alert")
async def inject_demo_alert(entity_id: Optional[str] = None):
    """Simulate an alert for testing purposes."""
    # This would create a synthetic alert record
    return {
        "success": True,
        "message": f"Demo alert injected for {entity_id or 'random drone'}",
    }