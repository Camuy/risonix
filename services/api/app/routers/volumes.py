"""Endpoint dei volumi derivati e del download interoperabile (P3-01).

Il server resta **autorevole sulla geometria**: espone i volumi costruiti dal
builder (P1-05) con la loro affinità LPS e permette di scaricarli in NIfTI/NRRD.
Non esegue alcun resampling MPR: la ricostruzione multiplanare è lato client.
"""

from __future__ import annotations

from typing import Any, Final

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.core.dependencies import SessionDep, SettingsDep
from app.db.models import Volume
from app.models.schemas import VolumeDetail, VolumeSummary
from app.repositories import VolumeRepository
from app.services.import_service import ImportValidationError, validate_source
from app.services.serializers import volume_detail, volume_summary

router = APIRouter(prefix="/api/volumes", tags=["volumes"])

#: Media type per formato di volume (NIfTI è sempre compresso ``.nii.gz``).
_MEDIA_TYPES: Final[dict[str, str]] = {
    "nifti": "application/gzip",
    "nrrd": "application/octet-stream",
}
_DEFAULT_MEDIA_TYPE: Final[str] = "application/octet-stream"

_ERROR_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "Volume o file non trovato"}
}


def _get_volume(volume_id: int, session: SessionDep) -> Volume:
    volume = VolumeRepository(session).get(volume_id)
    if volume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="volume non trovato")
    return volume


@router.get("", response_model=list[VolumeSummary])
def list_volumes(
    session: SessionDep,
    series_id: int | None = Query(default=None, description="Filtra per serie (opzionale)"),
) -> list[VolumeSummary]:
    """Elenca i volumi derivati, opzionalmente filtrati per serie."""
    volumes = VolumeRepository(session).list_all(series_id=series_id)
    return [volume_summary(volume) for volume in volumes]


@router.get("/{volume_id}", response_model=VolumeDetail, responses=_ERROR_NOT_FOUND)
def get_volume(volume_id: int, session: SessionDep) -> VolumeDetail:
    """Dettaglio di un volume con geometria completa (affinità LPS inclusa)."""
    return volume_detail(_get_volume(volume_id, session))


@router.get(
    "/{volume_id}/download",
    response_class=FileResponse,
    responses={
        **_ERROR_NOT_FOUND,
        200: {
            "description": "Volume NIfTI (.nii.gz) o NRRD come file allegato",
            "content": {"application/gzip": {}, "application/octet-stream": {}},
        },
    },
)
def download_volume(volume_id: int, session: SessionDep, settings: SettingsDep) -> FileResponse:
    """Scarica il file del volume (NIfTI o NRRD) confinato nella data dir."""
    volume = _get_volume(volume_id, session)
    try:
        path = validate_source(volume.path, settings.data_dir)
    except ImportValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="file del volume non disponibile"
        ) from exc
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="file del volume non trovato"
        )

    media_type = _MEDIA_TYPES.get(volume.volume_format, _DEFAULT_MEDIA_TYPE)
    return FileResponse(path, media_type=media_type, filename=path.name)


__all__ = ["router"]
