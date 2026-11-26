"""Conversione dei modelli ORM in schemi Pydantic esposti (P1-07)."""

from __future__ import annotations

from app.db.models import Instance, Series, Study, Volume
from app.dicom.metadata import InstanceMetadata, metadata_to_dict
from app.models.schemas import (
    InstanceSummary,
    MetadataResponse,
    SeriesSummary,
    StudyDetail,
    StudySummary,
    VolumeDetail,
    VolumeSummary,
)


def study_summary(study: Study, series_count: int) -> StudySummary:
    """Sintesi di uno studio con il numero di serie."""
    return StudySummary(
        id=study.id,
        study_instance_uid=study.study_instance_uid,
        patient_id=study.patient_id,
        study_date=study.study_date,
        description=study.description,
        series_count=series_count,
    )


def study_detail(study: Study, series_list: list[Series]) -> StudyDetail:
    """Dettaglio di uno studio con l'elenco delle sue serie."""
    summary = study_summary(study, len(series_list))
    return StudyDetail(**summary.model_dump(), series=[series_summary(s) for s in series_list])


def series_summary(series: Series) -> SeriesSummary:
    """Sintesi di una serie con i parametri geometrici principali."""
    return SeriesSummary(
        id=series.id,
        series_instance_uid=series.series_instance_uid,
        series_number=series.series_number,
        modality=series.modality,
        description=series.description,
        instance_count=series.instance_count,
        rows=series.rows,
        columns=series.columns,
        pixel_spacing=series.pixel_spacing,
        slice_spacing=series.slice_spacing,
        normal=series.normal,
        origin=series.origin,
        irregular=series.irregular,
    )


def instance_summary(instance: Instance) -> InstanceSummary:
    """Riferimento a un'istanza DICOM (nessun pixel)."""
    return InstanceSummary(
        id=instance.id,
        sop_instance_uid=instance.sop_instance_uid,
        sop_class_uid=instance.sop_class_uid,
        path=instance.path,
        kind=instance.kind,
        instance_number=instance.instance_number,
        slice_index=instance.slice_index,
        position=instance.position,
        orientation=instance.orientation,
    )


def volume_summary(volume: Volume) -> VolumeSummary:
    """Riferimento a un volume derivato con la sua geometria."""
    return VolumeSummary(
        id=volume.id,
        series_fk=volume.series_fk,
        path=volume.path,
        provenance_path=volume.provenance_path,
        volume_format=volume.volume_format,
        shape=volume.shape,
        spacing=volume.spacing,
        origin=volume.origin,
        normal=volume.normal,
        dtype=volume.dtype,
        irregular=volume.irregular,
        checksum_sha256=volume.checksum_sha256,
    )


def volume_detail(volume: Volume) -> VolumeDetail:
    """Volume derivato con la geometria completa (affinità LPS) e la data."""
    summary = volume_summary(volume)
    return VolumeDetail(
        **summary.model_dump(),
        affine_lps=volume.affine_lps,
        created_at=volume.created_at,
    )


def metadata_response(metadata: InstanceMetadata) -> MetadataResponse:
    """Metadati normalizzati di un'istanza, senza mai esporre i pixel."""
    return MetadataResponse.model_validate(metadata_to_dict(metadata))


__all__ = [
    "instance_summary",
    "metadata_response",
    "series_summary",
    "study_detail",
    "study_summary",
    "volume_detail",
    "volume_summary",
]
