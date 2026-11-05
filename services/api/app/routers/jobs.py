"""Endpoint di consultazione dello stato dei job asincroni (P1-07)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.core.dependencies import SessionDep
from app.models.schemas import JobResponse
from app.repositories import JobRepository

router = APIRouter(prefix="/api", tags=["jobs"])

_ERROR_NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Job non trovato"}}


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(
    session: SessionDep,
    job_status: str | None = Query(default=None, alias="status"),
) -> list[JobResponse]:
    """Elenca i job, opzionalmente filtrati per stato."""
    repo = JobRepository(session)
    jobs = repo.list_by_status(job_status) if job_status else repo.list()
    return [JobResponse.model_validate(job, from_attributes=True) for job in jobs]


@router.get("/jobs/{job_id}", response_model=JobResponse, responses=_ERROR_NOT_FOUND)
def get_job(job_id: int, session: SessionDep) -> JobResponse:
    """Stato di un singolo job."""
    job = JobRepository(session).get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job non trovato")
    return JobResponse.model_validate(job, from_attributes=True)


__all__ = ["router"]
