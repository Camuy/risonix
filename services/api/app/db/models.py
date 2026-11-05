"""Modelli ORM dello schema SQLite (P1-06).

Le entità seguono lo schema logico della specifica (§7.3): Study, Series,
Instance, Volume, Segmentation, Model, Job, Experiment e i record di
elaborazione (Processing).

Principi:
* il database contiene **solo metadati e riferimenti** (path, UID, stato); gli
  array immagine non vengono mai persistiti;
* i campi numerici multi-valore (posizione, orientamento, spacing, affine,
  parametri) sono salvati come JSON, non come blob binari;
* ogni UID DICOM è univoco e indicizzato perché è la chiave di deduplica.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Study(Base):
    """Studio DICOM: radice dell'albero Study → Series → Instance."""

    __tablename__ = "study"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    study_instance_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    patient_id: Mapped[str | None] = mapped_column(String(128))
    patient_name: Mapped[str | None] = mapped_column(String(256))
    study_date: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    series: Mapped[list[Series]] = relationship(
        back_populates="study", cascade="all, delete-orphan"
    )


class Series(Base):
    """Serie DICOM appartenente a uno studio, con parametri geometrici."""

    __tablename__ = "series"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    study_fk: Mapped[int] = mapped_column(ForeignKey("study.id", ondelete="CASCADE"), index=True)
    series_instance_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    series_number: Mapped[int | None] = mapped_column(Integer)
    modality: Mapped[str | None] = mapped_column(String(16), index=True)
    description: Mapped[str | None] = mapped_column(String(512))
    instance_count: Mapped[int] = mapped_column(Integer, default=0)

    rows: Mapped[int | None] = mapped_column(Integer)
    columns: Mapped[int | None] = mapped_column(Integer)
    pixel_spacing: Mapped[list[float] | None] = mapped_column(JSON)
    slice_spacing: Mapped[float | None] = mapped_column(Float)
    normal: Mapped[list[float] | None] = mapped_column(JSON)
    origin: Mapped[list[float] | None] = mapped_column(JSON)
    irregular: Mapped[bool] = mapped_column(Boolean, default=False)
    issues: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    study: Mapped[Study] = relationship(back_populates="series")
    instances: Mapped[list[Instance]] = relationship(
        back_populates="series", cascade="all, delete-orphan"
    )
    volumes: Mapped[list[Volume]] = relationship(
        back_populates="series", cascade="all, delete-orphan"
    )


class Instance(Base):
    """Singola istanza DICOM: riferimento al file su filesystem, non ai pixel."""

    __tablename__ = "instance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    series_fk: Mapped[int] = mapped_column(ForeignKey("series.id", ondelete="CASCADE"), index=True)
    sop_instance_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    sop_class_uid: Mapped[str | None] = mapped_column(String(128))
    path: Mapped[str] = mapped_column(Text)
    kind: Mapped[str | None] = mapped_column(String(16), index=True)
    instance_number: Mapped[int | None] = mapped_column(Integer)
    slice_index: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[list[float] | None] = mapped_column(JSON)
    orientation: Mapped[list[float] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    series: Mapped[Series] = relationship(back_populates="instances")


class Volume(Base):
    """Volume derivato (NIfTI/NRRD) con geometria e checksum di provenienza."""

    __tablename__ = "volume"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    series_fk: Mapped[int] = mapped_column(ForeignKey("series.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(Text)
    provenance_path: Mapped[str | None] = mapped_column(Text)
    volume_format: Mapped[str] = mapped_column(String(16))
    shape: Mapped[list[int] | None] = mapped_column(JSON)
    spacing: Mapped[list[float] | None] = mapped_column(JSON)
    origin: Mapped[list[float] | None] = mapped_column(JSON)
    normal: Mapped[list[float] | None] = mapped_column(JSON)
    affine_lps: Mapped[list[list[float]] | None] = mapped_column(JSON)
    dtype: Mapped[str | None] = mapped_column(String(32))
    irregular: Mapped[bool] = mapped_column(Boolean, default=False)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    series: Mapped[Series] = relationship(back_populates="volumes")
    segmentations: Mapped[list[Segmentation]] = relationship(
        back_populates="volume", cascade="all, delete-orphan"
    )


class Processing(Base):
    """Registro di un'elaborazione (conversione, rescale, …) su serie o volume."""

    __tablename__ = "processing"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    series_fk: Mapped[int | None] = mapped_column(
        ForeignKey("series.id", ondelete="SET NULL"), index=True
    )
    volume_fk: Mapped[int | None] = mapped_column(
        ForeignKey("volume.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Segmentation(Base):
    """Maschera di segmentazione collegata a un volume di riferimento."""

    __tablename__ = "segmentation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    volume_fk: Mapped[int] = mapped_column(ForeignKey("volume.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(256))
    label: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str | None] = mapped_column(String(16))
    anatomy: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    volume: Mapped[Volume] = relationship(back_populates="segmentations")


class Model(Base):
    """Modello AI registrato: pesi su filesystem, qui solo metadati."""

    __tablename__ = "model"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), index=True)
    version: Mapped[str | None] = mapped_column(String(64))
    license: Mapped[str | None] = mapped_column(String(128))
    checksum: Mapped[str | None] = mapped_column(String(128))
    adapter: Mapped[str | None] = mapped_column(String(128))
    extra_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Job(Base):
    """Job asincrono (import, conversione, inferenza, export) con stato e progresso."""

    __tablename__ = "job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_type: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Experiment(Base):
    """Esperimento di ricerca: configurazione, input, output e metriche."""

    __tablename__ = "experiment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    outputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


__all__ = [
    "Experiment",
    "Instance",
    "Job",
    "Model",
    "Processing",
    "Segmentation",
    "Series",
    "Study",
    "Volume",
]
