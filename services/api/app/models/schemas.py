"""Schemi Pydantic esposti dall'API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Risposta dell'endpoint di healthcheck."""

    status: str


class VersionResponse(BaseModel):
    """Metadati sul servizio in esecuzione."""

    service: str
    version: str
    env: str


class ImportRequest(BaseModel):
    """Richiesta di import di uno studio/serie da un percorso locale."""

    source_path: str = Field(description="Percorso di directory/ZIP/file dentro la data dir.")
    build_volumes: bool = Field(default=True, description="Costruisci i volumi derivati.")
    volume_format: Literal["nifti", "nrrd"] = Field(default="nifti")
    allow_irregular: bool = Field(
        default=False, description="Forza la conversione di serie geometricamente irregolari."
    )


class ImportAccepted(BaseModel):
    """Risposta di accettazione: l'import procede in background."""

    job_id: int
    status: str


class SeriesSummary(BaseModel):
    """Sintesi di una serie DICOM."""

    id: int
    series_instance_uid: str
    series_number: int | None
    modality: str | None
    description: str | None
    instance_count: int
    rows: int | None
    columns: int | None
    pixel_spacing: list[float] | None
    slice_spacing: float | None
    normal: list[float] | None
    origin: list[float] | None
    irregular: bool


class StudySummary(BaseModel):
    """Sintesi di uno studio DICOM."""

    id: int
    study_instance_uid: str
    patient_id: str | None
    study_date: str | None
    description: str | None
    series_count: int


class StudyDetail(StudySummary):
    """Dettaglio di uno studio con le sue serie."""

    series: list[SeriesSummary]


class InstanceSummary(BaseModel):
    """Riferimento a una singola istanza DICOM (nessun pixel)."""

    id: int
    sop_instance_uid: str
    sop_class_uid: str | None
    path: str
    kind: str | None
    instance_number: int | None
    slice_index: int | None
    position: list[float] | None
    orientation: list[float] | None


class VolumeSummary(BaseModel):
    """Riferimento a un volume derivato con la sua geometria."""

    id: int
    series_fk: int
    path: str
    provenance_path: str | None
    volume_format: str
    shape: list[int] | None
    spacing: list[float] | None
    origin: list[float] | None
    normal: list[float] | None
    dtype: str | None
    irregular: bool
    checksum_sha256: str | None


class MetadataResponse(BaseModel):
    """Metadati normalizzati di una singola istanza."""

    model_config = {"extra": "allow"}

    sop_instance_uid: str
    sop_class_uid: str | None = None
    study_instance_uid: str | None = None
    study_description: str | None = None
    study_date: str | None = None
    series_instance_uid: str | None = None
    series_number: int | None = None
    series_description: str | None = None
    modality: str | None = None
    rows: int | None = None
    columns: int | None = None
    pixel_spacing: list[float] | None = None
    image_position_patient: list[float] | None = None
    image_orientation_patient: list[float] | None = None
    rescale_slope: float | None = None
    rescale_intercept: float | None = None
    missing_fields: list[str] = []


class JobResponse(BaseModel):
    """Stato di un job asincrono."""

    id: int
    job_type: str
    status: str
    progress: float
    error: str | None
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime
