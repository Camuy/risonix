"""Endpoint di import e consultazione degli studi (P1-07)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.core.dependencies import JobRunnerDep, SessionDep, SettingsDep
from app.models.schemas import (
    ImportAccepted,
    ImportRequest,
    SeriesSummary,
    StudyDetail,
    StudySummary,
)
from app.repositories import SeriesRepository, StudyRepository
from app.services.import_service import ImportValidationError, validate_source
from app.services.serializers import series_summary, study_detail, study_summary

router = APIRouter(prefix="/api", tags=["studies"])

#: Tipo di job registrato per l'import (vedi ``app.main``).
IMPORT_JOB_TYPE = "import"

_ERROR_INVALID_SOURCE: dict[int | str, dict[str, Any]] = {
    400: {"description": "Percorso di import non valido"}
}
_ERROR_NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Studio non trovato"}}


@router.post(
    "/studies/import",
    response_model=ImportAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    responses=_ERROR_INVALID_SOURCE,
)
def request_import(
    payload: ImportRequest,
    settings: SettingsDep,
    runner: JobRunnerDep,
) -> ImportAccepted:
    """Valida il percorso e accoda un import asincrono; restituisce il job."""
    try:
        validate_source(payload.source_path, settings.data_dir)
    except ImportValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    job_id = runner.submit(IMPORT_JOB_TYPE, payload.model_dump())
    return ImportAccepted(job_id=job_id, status="queued")


@router.get("/studies", response_model=list[StudySummary])
def list_studies(session: SessionDep) -> list[StudySummary]:
    """Elenca gli studi importati."""
    studies = StudyRepository(session)
    series = SeriesRepository(session)
    return [study_summary(study, len(series.list_for_study(study.id))) for study in studies.list()]


@router.get("/studies/{study_id}", response_model=StudyDetail, responses=_ERROR_NOT_FOUND)
def get_study(study_id: int, session: SessionDep) -> StudyDetail:
    """Dettaglio di uno studio con le sue serie."""
    study = StudyRepository(session).get(study_id)
    if study is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="studio non trovato")
    return study_detail(study, SeriesRepository(session).list_for_study(study.id))


@router.delete(
    "/studies/{study_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_ERROR_NOT_FOUND,
)
def delete_study(study_id: int, session: SessionDep) -> Response:
    """Elimina uno studio e, a cascata, serie, istanze e volumi."""
    repo = StudyRepository(session)
    study = repo.get(study_id)
    if study is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="studio non trovato")
    repo.delete(study)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/studies/{study_id}/series",
    response_model=list[SeriesSummary],
    responses=_ERROR_NOT_FOUND,
)
def list_study_series(study_id: int, session: SessionDep) -> list[SeriesSummary]:
    """Serie di uno studio."""
    study = StudyRepository(session).get(study_id)
    if study is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="studio non trovato")
    return [series_summary(item) for item in SeriesRepository(session).list_for_study(study.id)]


__all__ = ["IMPORT_JOB_TYPE", "router"]
