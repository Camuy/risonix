"""Endpoint di consultazione delle serie e delle loro istanze/volumi (P1-07)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import SessionDep
from app.db.models import Series
from app.models.schemas import InstanceSummary, SeriesSummary, VolumeSummary
from app.repositories import InstanceRepository, SeriesRepository, VolumeRepository
from app.services.serializers import instance_summary, series_summary, volume_summary

router = APIRouter(prefix="/api", tags=["series"])

_ERROR_NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Serie non trovata"}}


def _get_series(series_id: int, session: SessionDep) -> Series:
    series = SeriesRepository(session).get(series_id)
    if series is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="serie non trovata")
    return series


@router.get("/series/{series_id}", response_model=SeriesSummary, responses=_ERROR_NOT_FOUND)
def get_series(series_id: int, session: SessionDep) -> SeriesSummary:
    """Dettaglio di una serie."""
    return series_summary(_get_series(series_id, session))


@router.get(
    "/series/{series_id}/instances",
    response_model=list[InstanceSummary],
    responses=_ERROR_NOT_FOUND,
)
def list_series_instances(series_id: int, session: SessionDep) -> list[InstanceSummary]:
    """Istanze di una serie, ordinate per indice di slice."""
    series = _get_series(series_id, session)
    instances = InstanceRepository(session).list_for_series(series.id)
    return [instance_summary(item) for item in instances]


@router.get(
    "/series/{series_id}/volumes",
    response_model=list[VolumeSummary],
    responses=_ERROR_NOT_FOUND,
)
def list_series_volumes(series_id: int, session: SessionDep) -> list[VolumeSummary]:
    """Volumi derivati di una serie."""
    series = _get_series(series_id, session)
    volumes = VolumeRepository(session).list_for_series(series.id)
    return [volume_summary(item) for item in volumes]


__all__ = ["router"]
