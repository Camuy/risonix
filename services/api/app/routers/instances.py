"""Endpoint di consultazione delle singole istanze e dei loro metadati (P1-07)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import SessionDep
from app.db.models import Instance
from app.dicom.metadata import extract_metadata
from app.models.schemas import InstanceSummary, MetadataResponse
from app.repositories import InstanceRepository
from app.services.serializers import instance_summary, metadata_response

router = APIRouter(prefix="/api", tags=["instances"])

_ERROR_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "Istanza o metadati non trovati"}
}


def _get_instance(instance_id: int, session: SessionDep) -> Instance:
    instance = InstanceRepository(session).get(instance_id)
    if instance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="istanza non trovata")
    return instance


@router.get("/instances/{instance_id}", response_model=InstanceSummary, responses=_ERROR_NOT_FOUND)
def get_instance(instance_id: int, session: SessionDep) -> InstanceSummary:
    """Riferimento a una singola istanza DICOM."""
    return instance_summary(_get_instance(instance_id, session))


@router.get(
    "/instances/{instance_id}/metadata",
    response_model=MetadataResponse,
    responses=_ERROR_NOT_FOUND,
)
def get_instance_metadata(instance_id: int, session: SessionDep) -> MetadataResponse:
    """Metadati normalizzati letti dall'istanza (solo header, nessun pixel)."""
    instance = _get_instance(instance_id, session)
    metadata = extract_metadata(instance.path)
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="metadati non disponibili per l'istanza",
        )
    return metadata_response(metadata)


__all__ = ["router"]
