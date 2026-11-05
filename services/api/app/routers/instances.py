"""Endpoint di consultazione delle singole istanze e dei loro metadati (P1-07)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.core.dependencies import SessionDep, SettingsDep
from app.db.models import Instance
from app.dicom.metadata import extract_metadata
from app.models.schemas import InstanceSummary, MetadataResponse
from app.repositories import InstanceRepository
from app.services.import_service import ImportValidationError, validate_source
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


@router.get(
    "/instances/{instance_id}/file",
    response_class=FileResponse,
    responses={
        **_ERROR_NOT_FOUND,
        200: {
            "description": "File DICOM originale (con pixel) per il loader wadouri",
            "content": {"application/dicom": {}},
        },
    },
)
def get_instance_file(instance_id: int, session: SessionDep, settings: SettingsDep) -> FileResponse:
    """Restituisce il file DICOM P10 (pixel inclusi) confinato nella data dir.

    Il frontend lo consuma con lo schema ``wadouri`` di Cornerstone per
    decodificare lo stack senza esporre il filesystem.
    """
    instance = _get_instance(instance_id, session)
    try:
        path = validate_source(instance.path, settings.data_dir)
    except ImportValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="file DICOM non disponibile"
        ) from exc
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="file DICOM non trovato")
    return FileResponse(path, media_type="application/dicom", filename=path.name)


__all__ = ["router"]
