"""Endpoint con i metadati di versione del servizio."""

from fastapi import APIRouter

from ..core.config import get_settings
from ..models.schemas import VersionResponse

router = APIRouter(tags=["version"])


@router.get("/version", response_model=VersionResponse)
def version() -> VersionResponse:
    """Nome, versione e ambiente del servizio."""
    settings = get_settings()
    return VersionResponse(
        service=settings.service_name,
        version=settings.version,
        env=settings.env,
    )
