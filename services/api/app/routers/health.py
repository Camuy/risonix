"""Endpoint di healthcheck per liveness/readiness."""

from fastapi import APIRouter

from ..models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Restituisce lo stato del servizio."""
    return HealthResponse(status="ok")
