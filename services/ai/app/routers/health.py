"""Endpoint di healthcheck per liveness/readiness."""

from fastapi import APIRouter

from ..models.schemas import HealthResponse
from ..monitoring.memory import current_memory_mb

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Stato del servizio e consumo di memoria corrente."""
    return HealthResponse(status="ok", memory_mb=round(current_memory_mb(), 2))
