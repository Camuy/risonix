"""Servizio di import: scansione → raggruppamento → geometria → volumi → DB (P1-07).

Il servizio è **sincrono e testabile**: l'asincronia è responsabilità del job
runner, che lo invoca in background. Non costruisce mai l'intero studio in
memoria: una serie alla volta, un volume alla volta.

Regole:
* il percorso di import deve stare **dentro la data dir** (normalmente
  ``data/incoming``): niente letture arbitrarie dal filesystem;
* la de-identificazione completa dei campi paziente è demandata a P1-08; qui i
  campi paziente non vengono popolati dal DICOM;
* i file originali non vengono mai modificati.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.dicom import geometry, scanner
from app.dicom.deident import DeidPolicy, deidentify_file, safe_component
from app.dicom.metadata import InstanceMetadata, extract_metadata
from app.dicom.study import SeriesGroup, group_scan
from app.dicom.volume import VolumeBuildError, VolumeFormat, build_volume, default_volume_path
from app.repositories import (
    InstanceRepository,
    SeriesRepository,
    StudyRepository,
    VolumeRepository,
)

logger = logging.getLogger(__name__)


class ImportValidationError(ValueError):
    """Input di import non valido (percorso inesistente o fuori dalla data dir)."""


def validate_source(source_path: str | Path, data_dir: str | Path) -> Path:
    """Risolve e valida il percorso di import rispetto alla data dir."""
    root = Path(data_dir).expanduser().resolve()
    source = Path(source_path).expanduser()
    if not source.is_absolute():
        source = root / source
    source = source.resolve()
    if not source.exists():
        raise ImportValidationError(f"percorso di import inesistente: {source}")
    if not source.is_relative_to(root):
        raise ImportValidationError(f"il percorso di import deve essere dentro {root}")
    return source


@dataclass
class ImportResult:
    """Conteggi dell'import, senza dati clinici."""

    studies: int = 0
    series: int = 0
    instances: int = 0
    volumes: int = 0
    deidentified: int = 0
    unreadable: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "studies": self.studies,
            "series": self.series,
            "instances": self.instances,
            "volumes": self.volumes,
            "deidentified": self.deidentified,
            "unreadable": self.unreadable,
        }


def _metadatas(paths: list[str]) -> dict[str, InstanceMetadata]:
    """Mappa ``SOPInstanceUID → metadati`` per i file leggibili."""
    found: dict[str, InstanceMetadata] = {}
    for path in paths:
        metadata = extract_metadata(path)
        if metadata is None:
            continue
        found[metadata.sop_instance_uid] = metadata
    return found


def _persist_series(
    session: Session,
    group: SeriesGroup,
    *,
    data_dir: Path,
    build_volumes: bool,
    volume_format: VolumeFormat,
    allow_irregular: bool,
    deidentify: bool,
    deid_policy: DeidPolicy,
    result: ImportResult,
) -> None:
    series_repo = SeriesRepository(session)
    instance_repo = InstanceRepository(session)
    volume_repo = VolumeRepository(session)

    uid = group.series_instance_uid
    assert group.study_instance_uid is not None and uid is not None

    paths = [instance.path for instance in group.instances]
    metadatas = _metadatas(paths)
    result.unreadable += len(paths) - len(metadatas)
    geo = geometry.analyze_geometry(list(metadatas.values()))
    slice_index = {
        instance_uid: index for index, instance_uid in enumerate(geo.ordered_instance_uids)
    }
    first = next(iter(metadatas.values()), None)

    series = series_repo.get_by_uid(uid)
    if series is None:
        series = series_repo.create(
            study_fk=_study_id_for(session, group.study_instance_uid),
            series_instance_uid=uid,
            series_number=group.series_number,
            modality=group.modality,
            description=group.series_description,
            instance_count=group.instance_count,
            rows=first.rows if first else None,
            columns=first.columns if first else None,
            pixel_spacing=list(first.pixel_spacing) if first and first.pixel_spacing else None,
            slice_spacing=geo.slice_spacing,
            normal=list(geo.normal) if geo.normal else None,
            origin=list(first.image_position_patient)
            if first and first.image_position_patient
            else None,
            irregular=geo.irregular,
            issues=geometry.geometry_to_dict(geo)["issues"],
        )
        result.series += 1
    else:
        series.instance_count = group.instance_count
        series.modality = group.modality
        series.description = group.series_description
        series.slice_spacing = geo.slice_spacing
        series.normal = list(geo.normal) if geo.normal else None
        series.irregular = geo.irregular

    for instance in group.instances:
        if instance_repo.get_by_uid(instance.sop_instance_uid) is not None:
            continue
        instance_repo.create(
            series_fk=series.id,
            sop_instance_uid=instance.sop_instance_uid,
            path=instance.path,
            sop_class_uid=instance.sop_class_uid,
            kind=instance.kind,
            instance_number=instance.instance_number,
            slice_index=slice_index.get(instance.sop_instance_uid),
            position=list(instance.image_position) if instance.image_position else None,
            orientation=list(instance.image_orientation) if instance.image_orientation else None,
        )
        result.instances += 1

    if deidentify:
        _write_deidentified_copies(group, data_dir, uid, deid_policy, result)

    if not build_volumes or not group.is_image or len(metadatas) < 2:
        return
    if geo.normal is None or geo.slice_spacing is None:
        return
    if volume_repo.list_for_series(series.id):
        return

    by_uid = {instance.sop_instance_uid: instance.path for instance in group.instances}
    ordered_paths = [by_uid[value] for value in geo.ordered_instance_uids if value in by_uid]
    output = default_volume_path(data_dir, uid, volume_format)
    try:
        built = build_volume(
            ordered_paths,
            output,
            volume_format=volume_format,
            apply_rescale=True,
            allow_irregular=allow_irregular,
        )
    except VolumeBuildError as exc:
        logger.warning("volume non costruito per la serie %s: %s", uid, exc)
        return

    volume_repo.create(
        series_fk=series.id,
        path=str(built.path),
        volume_format=built.format,
        provenance_path=str(built.provenance_path),
        shape=list(built.shape),
        spacing=list(built.spacing),
        origin=list(built.origin),
        normal=list(built.normal),
        affine_lps=[list(row) for row in built.affine_lps],
        dtype=built.dtype,
        irregular=built.irregular,
        checksum_sha256=built.checksum_sha256,
    )
    result.volumes += 1


def _study_id_for(session: Session, study_instance_uid: str) -> int:
    study = StudyRepository(session).get_by_uid(study_instance_uid)
    assert study is not None
    return study.id


def _write_deidentified_copies(
    group: SeriesGroup,
    data_dir: Path,
    series_uid: str,
    policy: DeidPolicy,
    result: ImportResult,
) -> None:
    """Scrive copie de-identificate in ``data/derived`` (gli originali restano intatti)."""
    destination_dir = data_dir / "derived" / "deidentified" / safe_component(series_uid)
    for instance in group.instances:
        destination = destination_dir / Path(instance.path).name
        if destination.exists():
            continue
        deidentify_file(instance.path, destination, policy)
        result.deidentified += 1


def import_study(
    session: Session,
    source_path: str | Path,
    *,
    data_dir: str | Path,
    build_volumes: bool = True,
    volume_format: VolumeFormat = "nifti",
    allow_irregular: bool = False,
    deidentify: bool = False,
    deidentify_salt: str = "risonix",
    deidentify_remap_uids: bool = False,
) -> ImportResult:
    """Importa studi/serie/istanze dal percorso e li persiste; restituisce i conteggi."""
    source = validate_source(source_path, data_dir)
    data_root = Path(data_dir).expanduser().resolve()
    staging = data_root / "cache" / "import"
    report = scanner.scan_path(source, extract_to=staging)
    grouped = group_scan(report)

    result = ImportResult(unreadable=len(grouped.unreadable))
    studies = StudyRepository(session)
    deid_policy = DeidPolicy(salt=deidentify_salt, remap_uids=deidentify_remap_uids)

    for study_group in grouped.studies:
        uid = study_group.study_instance_uid
        if uid is None:
            result.unreadable += sum(len(series.instances) for series in study_group.series)
            continue
        if studies.get_by_uid(uid) is None:
            studies.create(study_instance_uid=uid)
            result.studies += 1

        for group in study_group.series:
            if group.series_instance_uid is None:
                result.unreadable += len(group.instances)
                continue
            _persist_series(
                session,
                group,
                data_dir=data_root,
                build_volumes=build_volumes,
                volume_format=volume_format,
                allow_irregular=allow_irregular,
                deidentify=deidentify,
                deid_policy=deid_policy,
                result=result,
            )

    session.flush()
    return result


__all__ = ["ImportResult", "ImportValidationError", "import_study", "validate_source"]
