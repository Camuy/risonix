"""Raggruppamento per studio/serie e classificazione delle serie (P1-02).

I file scoperti dallo scanner (:mod:`app.dicom.scanner`) vengono letti nel solo
header e raggruppati per ``StudyInstanceUID`` e ``SeriesInstanceUID``. Le serie
sono classificate come *immagine*, *report* o *supporto* così che le serie
non-imaging (SR, Presentation State, …) non vengano mai trattate come volumi.

``SeriesDescription`` è un indizio debole e viene riportata solo a corredo:
l'appartenenza a una serie dipende **solo** dall'``SeriesInstanceUID`` e i
duplicati sono individuati per ``SOPInstanceUID`` senza mai scartare l'originale.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast

import pydicom
from pydicom.errors import InvalidDicomError

from app.dicom.scanner import ScanError, ScanReport

logger = logging.getLogger(__name__)

#: Classificazione di un'istanza o di una serie.
InstanceKind = Literal["image", "report", "support", "unknown"]

#: Segnaposto per istanze prive di ``StudyInstanceUID``/``SeriesInstanceUID``.
_UNKNOWN_UID = "(senza UID)"

#: Prefissi di SOP Class UID dei report strutturati (SR) e dei Key Object.
_REPORT_SOP_PREFIXES = ("1.2.840.10008.5.1.4.1.1.88",)

#: Prefissi di SOP Class UID degli oggetti di supporto privi di pixel clinici.
_SUPPORT_SOP_PREFIXES = (
    "1.2.840.10008.5.1.4.1.1.11",  # Presentation State
    "1.2.840.10008.5.1.4.1.1.66",  # Raw Data
    "1.2.840.10008.5.1.4.1.1.481.3",  # RT Structure Set
)

#: Modalità che non producono mai volumi di intensità.
_NON_IMAGE_MODALITIES = frozenset({"SR", "PR", "KO", "PLAN", "RTSTRUCT", "REG", "FID"})

#: Tag letti per raggruppare/classificare un'istanza (nessun pixel data).
_STUDY_TAGS = [
    "SOPInstanceUID",
    "SOPClassUID",
    "Modality",
    "StudyInstanceUID",
    "SeriesInstanceUID",
    "InstanceNumber",
    "SeriesNumber",
    "SeriesDescription",
    "ImagePositionPatient",
    "ImageOrientationPatient",
    "PixelSpacing",
    "Rows",
    "Columns",
]


@dataclass(frozen=True)
class InstanceInfo:
    """Metadati minimi di un'istanza, sufficienti a raggrupparla e classificarla."""

    path: str
    sop_instance_uid: str
    sop_class_uid: str | None
    modality: str | None
    study_instance_uid: str | None
    series_instance_uid: str | None
    instance_number: int | None
    series_number: int | None
    series_description: str | None
    image_position: tuple[float, ...] | None
    image_orientation: tuple[float, ...] | None
    kind: InstanceKind


@dataclass(frozen=True)
class DuplicateGroup:
    """Istante con lo stesso ``SOPInstanceUID`` presente in più file."""

    sop_instance_uid: str
    paths: list[str]
    kept: str


@dataclass
class SeriesGroup:
    """Serie DICOM raggruppata per ``SeriesInstanceUID``."""

    series_instance_uid: str | None
    study_instance_uid: str | None
    series_number: int | None
    series_description: str | None
    modality: str | None
    kind: InstanceKind
    instances: list[InstanceInfo] = field(default_factory=list)

    @property
    def is_image(self) -> bool:
        return self.kind == "image"

    @property
    def instance_count(self) -> int:
        return len(self.instances)


@dataclass
class StudyGroup:
    """Studio DICOM raggruppato per ``StudyInstanceUID``."""

    study_instance_uid: str | None
    series: list[SeriesGroup] = field(default_factory=list)
    duplicates: list[DuplicateGroup] = field(default_factory=list)

    @property
    def image_series(self) -> list[SeriesGroup]:
        return [s for s in self.series if s.is_image]


@dataclass
class GroupReport:
    """Esito del raggruppamento di un intero import."""

    studies: list[StudyGroup] = field(default_factory=list)
    unreadable: list[ScanError] = field(default_factory=list)


def classify_instance(
    *, sop_class_uid: str | None, modality: str | None, has_pixels: bool
) -> InstanceKind:
    """Classifica una singola istanza come immagine, report o supporto."""
    if _matches_prefix(sop_class_uid, _REPORT_SOP_PREFIXES):
        return "report"
    if _matches_prefix(sop_class_uid, _SUPPORT_SOP_PREFIXES):
        return "support"
    if modality in _NON_IMAGE_MODALITIES:
        return "report" if modality == "SR" else "support"
    if has_pixels:
        return "image"
    return "support"


def _matches_prefix(value: str | None, prefixes: tuple[str, ...]) -> bool:
    if not value:
        return False
    return value.startswith(prefixes)


def _read_header(path: Path) -> Any:
    try:
        return pydicom.dcmread(path, stop_before_pixels=True, specific_tags=_STUDY_TAGS)
    except InvalidDicomError:
        pass
    except (OSError, ValueError):
        return None
    try:
        return pydicom.dcmread(path, stop_before_pixels=True, force=True, specific_tags=_STUDY_TAGS)
    except (InvalidDicomError, OSError, ValueError):
        return None


def _as_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float_tuple(value: Any) -> tuple[float, ...] | None:
    if value is None:
        return None
    try:
        return tuple(float(item) for item in value)
    except (TypeError, ValueError):
        return None


def load_instance(path: str | Path) -> InstanceInfo | None:
    """Legge l'header di un file e ne restituisce i metadati di raggruppamento."""
    target = Path(path)
    header = _read_header(target)
    if header is None:
        return None
    sop_instance_uid = _as_text(getattr(header, "SOPInstanceUID", None))
    if not sop_instance_uid:
        return None
    sop_class_uid = _as_text(getattr(header, "SOPClassUID", None))
    modality = _as_text(getattr(header, "Modality", None))
    has_pixels = bool(getattr(header, "Rows", None) and getattr(header, "Columns", None))
    position = _as_float_tuple(getattr(header, "ImagePositionPatient", None))
    if position is not None and len(position) != 3:
        position = None
    orientation = _as_float_tuple(getattr(header, "ImageOrientationPatient", None))
    return InstanceInfo(
        path=str(target),
        sop_instance_uid=sop_instance_uid,
        sop_class_uid=sop_class_uid,
        modality=modality,
        study_instance_uid=_as_text(getattr(header, "StudyInstanceUID", None)),
        series_instance_uid=_as_text(getattr(header, "SeriesInstanceUID", None)),
        instance_number=_as_int(getattr(header, "InstanceNumber", None)),
        series_number=_as_int(getattr(header, "SeriesNumber", None)),
        series_description=_as_text(getattr(header, "SeriesDescription", None)),
        image_position=position,
        image_orientation=orientation,
        kind=classify_instance(
            sop_class_uid=sop_class_uid, modality=modality, has_pixels=has_pixels
        ),
    )


def _find_duplicates(instances: list[InstanceInfo]) -> list[DuplicateGroup]:
    by_uid: dict[str, list[str]] = {}
    for instance in instances:
        by_uid.setdefault(instance.sop_instance_uid, []).append(instance.path)
    duplicates = [
        DuplicateGroup(sop_instance_uid=uid, paths=sorted(paths), kept=sorted(paths)[0])
        for uid, paths in by_uid.items()
        if len(paths) > 1
    ]
    duplicates.sort(key=lambda dup: dup.sop_instance_uid)
    return duplicates


def _dedupe(instances: list[InstanceInfo]) -> list[InstanceInfo]:
    kept: dict[str, InstanceInfo] = {}
    for instance in sorted(instances, key=lambda item: item.path):
        kept.setdefault(instance.sop_instance_uid, instance)
    return list(kept.values())


def _series_kind(instances: list[InstanceInfo]) -> InstanceKind:
    kinds = {instance.kind for instance in instances}
    for candidate in ("image", "report", "support"):
        if candidate in kinds:
            return cast(InstanceKind, candidate)
    return "unknown"


def _instance_sort_key(instance: InstanceInfo) -> tuple[Any, ...]:
    return (
        instance.instance_number is None,
        instance.instance_number or 0,
        instance.image_position or (0.0, 0.0, 0.0),
        instance.path,
    )


def _series_sort_key(series: SeriesGroup) -> tuple[Any, ...]:
    return (
        series.series_number is None,
        series.series_number or 0,
        series.series_instance_uid or "",
    )


def group_instances(instances: list[InstanceInfo]) -> list[StudyGroup]:
    """Raggruppa le istanze per studio e serie, rilevando i duplicati."""
    by_study: dict[str, list[InstanceInfo]] = {}
    for instance in instances:
        key = instance.study_instance_uid or _UNKNOWN_UID
        by_study.setdefault(key, []).append(instance)

    studies: list[StudyGroup] = []
    for study_key, items in by_study.items():
        duplicates = _find_duplicates(items)
        deduped = _dedupe(items)
        by_series: dict[str, list[InstanceInfo]] = {}
        for instance in deduped:
            series_key = instance.series_instance_uid or _UNKNOWN_UID
            by_series.setdefault(series_key, []).append(instance)

        series_list: list[SeriesGroup] = []
        for series_key, series_items in by_series.items():
            ordered = sorted(series_items, key=_instance_sort_key)
            first = ordered[0]
            series_list.append(
                SeriesGroup(
                    series_instance_uid=None if series_key == _UNKNOWN_UID else series_key,
                    study_instance_uid=None if study_key == _UNKNOWN_UID else study_key,
                    series_number=first.series_number,
                    series_description=first.series_description,
                    modality=first.modality,
                    kind=_series_kind(ordered),
                    instances=ordered,
                )
            )
        series_list.sort(key=_series_sort_key)
        studies.append(
            StudyGroup(
                study_instance_uid=None if study_key == _UNKNOWN_UID else study_key,
                series=series_list,
                duplicates=duplicates,
            )
        )

    studies.sort(key=lambda study: study.study_instance_uid or "")
    return studies


def group_scan(report: ScanReport) -> GroupReport:
    """Raggruppa le istanze scoperte da uno :class:`ScanReport`."""
    instances: list[InstanceInfo] = []
    unreadable: list[ScanError] = []
    for dicom_file in report.dicom_files:
        instance = load_instance(dicom_file.path)
        if instance is None:
            unreadable.append(ScanError(path=dicom_file.path, message="header DICOM non leggibile"))
            continue
        instances.append(instance)
    return GroupReport(studies=group_instances(instances), unreadable=unreadable)


def group_report_to_dict(report: GroupReport) -> dict[str, Any]:
    """Serializza un :class:`GroupReport` in una struttura JSON-friendly."""
    total_series = sum(len(study.series) for study in report.studies)
    image_series = sum(len(study.image_series) for study in report.studies)
    duplicates = sum(len(study.duplicates) for study in report.studies)
    return {
        "study_count": len(report.studies),
        "series_count": total_series,
        "image_series_count": image_series,
        "duplicate_count": duplicates,
        "studies": [_study_to_dict(study) for study in report.studies],
        "unreadable": [{"path": e.path, "message": e.message} for e in report.unreadable],
    }


def _study_to_dict(study: StudyGroup) -> dict[str, Any]:
    return {
        "study_instance_uid": study.study_instance_uid,
        "series_count": len(study.series),
        "image_series_count": len(study.image_series),
        "series": [_series_to_dict(series) for series in study.series],
        "duplicates": [
            {
                "sop_instance_uid": dup.sop_instance_uid,
                "kept": dup.kept,
                "paths": list(dup.paths),
            }
            for dup in study.duplicates
        ],
    }


def _series_to_dict(series: SeriesGroup) -> dict[str, Any]:
    return {
        "series_instance_uid": series.series_instance_uid,
        "series_number": series.series_number,
        "series_description": series.series_description,
        "modality": series.modality,
        "kind": series.kind,
        "instance_count": series.instance_count,
        "instances": [instance.path for instance in series.instances],
    }


__all__ = [
    "DuplicateGroup",
    "GroupReport",
    "InstanceInfo",
    "InstanceKind",
    "SeriesGroup",
    "StudyGroup",
    "classify_instance",
    "group_instances",
    "group_report_to_dict",
    "group_scan",
    "load_instance",
]
