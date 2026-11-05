"""Costruzione di volumi NIfTI/NRRD con geometria preservata (P1-05).

Il builder trasforma una serie di slice ordinate in una griglia 3D usando la
**geometria fisica** calcolata dal motore di P1-04: la matrice di affinità mappa
gli indici voxel ``(i, j, k)`` alle coordinate del paziente, così il volume
ricostruito resta allineato alla serie sorgente.

Coordinate
----------
I DICOM usano lo spazio paziente **LPS** (Left-Posterior-Superior). I volumi
NIfTI per convenzione sono in **RAS**: al momento del salvataggio l'affinità LPS
viene convertita in RAS (negazione degli assi X/Y). I volumi NRRD restano in LPS
(``space = left-posterior-superior``). In entrambi i casi la geometria è la
stessa, cambia solo la convenzione di riferimento.

Limiti documentati
------------------
* Lo spacing è calcolato lungo la normale; serie con gap/anomalie di spacing
  vengono rifiutate a meno di ``allow_irregular=True`` (nessuna interpolazione
  silenziosa).
* I file DICOM di origine non vengono mai modificati: le conversioni usano
  file temporanei e sostituzione atomica.
* Non si caricano interi studi: si elabora una serie alla volta e una slice per
  volta; è tenuto in memoria solo l'array del volume corrente.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import nibabel as nib
import nrrd
import numpy as np
import pydicom
from numpy.typing import NDArray

from app.dicom import geometry
from app.dicom.metadata import InstanceMetadata, extract_metadata

VolumeFormat = Literal["nifti", "nrrd"]

_FLIP_LPS_TO_RAS: NDArray[np.float64] = np.diag([-1.0, -1.0, 1.0, 1.0])
_SAFE_UID = re.compile(r"[^0-9A-Za-z._-]")


class VolumeBuildError(RuntimeError):
    """Impossibile costruire un volume geometricamente valido dalla serie."""


@dataclass(frozen=True)
class VolumeBuildResult:
    """Esito della costruzione di un volume, con provenienza completa."""

    path: Path
    provenance_path: Path
    format: VolumeFormat
    shape: tuple[int, int, int]
    spacing: tuple[float, float, float]
    origin: tuple[float, float, float]
    normal: tuple[float, float, float]
    affine_lps: tuple[tuple[float, float, float, float], ...]
    affine_file: tuple[tuple[float, float, float, float], ...]
    slice_index_map: tuple[str, ...]
    applied_rescale: bool
    dtype: str
    irregular: bool
    checksum_sha256: str


def infer_format(output_path: Path | str) -> VolumeFormat:
    """Deduce il formato dal suffisso del percorso (``.nii[.gz]`` / ``.nrrd``)."""
    name = str(output_path).lower()
    if name.endswith(".nrrd"):
        return "nrrd"
    if name.endswith(".nii") or name.endswith(".nii.gz"):
        return "nifti"
    raise VolumeBuildError(f"formato volume non riconosciuto: {output_path}")


def default_volume_path(data_dir: str | Path, series_uid: str, volume_format: VolumeFormat) -> Path:
    """Percorso canonico in ``data/processed`` per una serie."""
    safe_uid = _SAFE_UID.sub("_", series_uid)
    suffix = ".nii.gz" if volume_format == "nifti" else ".nrrd"
    return Path(data_dir) / "processed" / f"{safe_uid}{suffix}"


def _lps_affine(
    origin: Sequence[float],
    row_direction: Sequence[float],
    column_direction: Sequence[float],
    normal: Sequence[float],
    row_spacing: float,
    column_spacing: float,
    slice_spacing: float,
) -> NDArray[np.float64]:
    affine = np.eye(4, dtype=np.float64)
    affine[:3, 0] = np.asarray(row_direction, dtype=np.float64) * row_spacing
    affine[:3, 1] = np.asarray(column_direction, dtype=np.float64) * column_spacing
    affine[:3, 2] = np.asarray(normal, dtype=np.float64) * slice_spacing
    affine[:3, 3] = np.asarray(origin, dtype=np.float64)
    return affine


def _as_affine_tuple(affine: NDArray[np.float64]) -> tuple[tuple[float, float, float, float], ...]:
    return tuple(
        (float(affine[row, 0]), float(affine[row, 1]), float(affine[row, 2]), float(affine[row, 3]))
        for row in range(4)
    )


def _reference_orientation(ordered: Sequence[tuple[Path, InstanceMetadata]]) -> Sequence[float]:
    for _, metadata in ordered:
        orientation = metadata.image_orientation_patient
        if orientation is not None:
            return orientation
    raise VolumeBuildError("nessuna ImageOrientationPatient valida per costruire l'affinità")


def _validate_grid(ordered: Sequence[tuple[Path, InstanceMetadata]]) -> tuple[int, int]:
    reference = ordered[0][1]
    if reference.rows is None or reference.columns is None:
        raise VolumeBuildError("dimensione in-plane (Rows/Columns) mancante")
    if reference.pixel_spacing is None or len(reference.pixel_spacing) != 2:
        raise VolumeBuildError("PixelSpacing mancante o non valido")
    for path, metadata in ordered:
        if metadata.rows != reference.rows or metadata.columns != reference.columns:
            raise VolumeBuildError(f"dimensione in-plane incoerente in {path.name}")
        if metadata.pixel_spacing != reference.pixel_spacing:
            raise VolumeBuildError(f"PixelSpacing incoerente in {path.name}")
    return reference.rows, reference.columns


def _load_volume(
    ordered: Sequence[tuple[Path, InstanceMetadata]],
    shape: tuple[int, int, int],
    apply_rescale: bool,
) -> tuple[NDArray[Any], bool]:
    slopes = [metadata.rescale() for _, metadata in ordered]
    non_identity = any(slope != 1.0 or intercept != 0.0 for slope, intercept in slopes)
    applied_rescale = apply_rescale and non_identity

    rows, columns, slices = shape
    volume: NDArray[Any]
    if applied_rescale:
        volume = np.empty((rows, columns, slices), dtype=np.float32)
    else:
        first_dataset = pydicom.dcmread(ordered[0][0])
        volume = np.empty((rows, columns, slices), dtype=first_dataset.pixel_array.dtype)

    for index, (path, _metadata) in enumerate(ordered):
        dataset = pydicom.dcmread(path)
        pixels = dataset.pixel_array
        if pixels.shape != (rows, columns):
            raise VolumeBuildError(f"pixel data incoerente in {path.name}")
        if applied_rescale:
            slope, intercept = slopes[index]
            volume[:, :, index] = pixels.astype(np.float32) * slope + intercept
        else:
            volume[:, :, index] = pixels
    return volume, applied_rescale


def _write_volume(
    target: Path,
    volume: NDArray[Any],
    volume_format: VolumeFormat,
    affine_lps: NDArray[np.float64],
    origin: Sequence[float],
    row_direction: Sequence[float],
    column_direction: Sequence[float],
    normal: Sequence[float],
    spacing: Sequence[float],
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    suffix = "".join(target.suffixes) or ".tmp"
    handle, temporary_name = tempfile.mkstemp(
        dir=target.parent, prefix=f".{target.name}.", suffix=suffix
    )
    os.close(handle)
    temporary = Path(temporary_name)
    try:
        if volume_format == "nifti":
            affine_ras = _FLIP_LPS_TO_RAS @ affine_lps
            nib.save(nib.Nifti1Image(volume, affine_ras), str(temporary))
        else:
            header = {
                "space": "left-posterior-superior",
                "space directions": [
                    list(np.asarray(row_direction) * spacing[0]),
                    list(np.asarray(column_direction) * spacing[1]),
                    list(np.asarray(normal) * spacing[2]),
                ],
                "space origin": list(origin),
                "kinds": ["domain", "domain", "domain"],
            }
            nrrd.write(str(temporary), np.ascontiguousarray(volume), header)
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_volume(
    sources: Sequence[Path | str],
    output_path: Path | str,
    *,
    volume_format: VolumeFormat | None = None,
    apply_rescale: bool = True,
    allow_irregular: bool = False,
) -> VolumeBuildResult:
    """Costruisce un volume dalla serie e ne scrive provenienza e checksum.

    Solleva :class:`VolumeBuildError` se la geometria è ambigua o irregolare e
    ``allow_irregular`` è falso.
    """
    target = Path(output_path)
    resolved_format = volume_format or infer_format(target)

    entries: list[tuple[Path, InstanceMetadata]] = []
    for source in sources:
        path = Path(source)
        metadata = extract_metadata(path)
        if metadata is None:
            raise VolumeBuildError(f"file non leggibile o privo di SOPInstanceUID: {path.name}")
        entries.append((path, metadata))
    if not entries:
        raise VolumeBuildError("nessuna istanza da convertire")

    analyzed = geometry.analyze_geometry([metadata for _, metadata in entries])
    if analyzed.normal is None:
        raise VolumeBuildError("geometria non determinabile: orientamento mancante")
    if analyzed.slice_spacing is None or len(analyzed.ordered_instance_uids) < 1:
        raise VolumeBuildError("geometria non determinabile: posizioni insufficienti")
    if analyzed.irregular and not allow_irregular:
        codes = ", ".join(sorted({issue.code for issue in analyzed.issues}))
        raise VolumeBuildError(f"serie irregolare ({codes}); usare allow_irregular per forzare")

    by_uid = {metadata.sop_instance_uid: (path, metadata) for path, metadata in entries}
    ordered = [by_uid[uid] for uid in analyzed.ordered_instance_uids]

    rows, columns = _validate_grid(ordered)
    orientation = _reference_orientation(ordered)
    row_direction = orientation[3:6]
    column_direction = orientation[0:3]
    reference_metadata = ordered[0][1]
    assert reference_metadata.pixel_spacing is not None
    row_spacing = float(reference_metadata.pixel_spacing[0])
    column_spacing = float(reference_metadata.pixel_spacing[1])
    slice_spacing = analyzed.slice_spacing
    origin = ordered[0][1].image_position_patient
    assert origin is not None

    shape = (rows, columns, len(ordered))
    volume, applied_rescale = _load_volume(ordered, shape, apply_rescale)

    affine_lps = _lps_affine(
        origin,
        row_direction,
        column_direction,
        analyzed.normal,
        row_spacing,
        column_spacing,
        slice_spacing,
    )
    _write_volume(
        target,
        volume,
        resolved_format,
        affine_lps,
        origin,
        row_direction,
        column_direction,
        analyzed.normal,
        (row_spacing, column_spacing, slice_spacing),
    )

    affine_file = (
        _as_affine_tuple(_FLIP_LPS_TO_RAS @ affine_lps)
        if resolved_format == "nifti"
        else _as_affine_tuple(affine_lps)
    )
    provenance_path = target.parent / f"{target.name}.provenance.json"
    checksum = _sha256(target)
    provenance: dict[str, Any] = {
        "created_at": datetime.now(UTC).isoformat(),
        "format": resolved_format,
        "source_count": len(ordered),
        "ordered_sop_instance_uids": list(analyzed.ordered_instance_uids),
        "slice_index_map": list(analyzed.ordered_instance_uids),
        "shape": list(shape),
        "spacing": [row_spacing, column_spacing, slice_spacing],
        "origin_lps": list(origin),
        "normal_lps": list(analyzed.normal),
        "affine_lps": [list(row) for row in _as_affine_tuple(affine_lps)],
        "affine_file": [list(row) for row in affine_file],
        "dtype": str(volume.dtype),
        "applied_rescale": applied_rescale,
        "irregular": analyzed.irregular,
        "checksum_sha256": checksum,
        "geometry": geometry.geometry_to_dict(analyzed),
    }
    provenance_path.write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    return VolumeBuildResult(
        path=target,
        provenance_path=provenance_path,
        format=resolved_format,
        shape=shape,
        spacing=(row_spacing, column_spacing, slice_spacing),
        origin=(float(origin[0]), float(origin[1]), float(origin[2])),
        normal=(
            float(analyzed.normal[0]),
            float(analyzed.normal[1]),
            float(analyzed.normal[2]),
        ),
        affine_lps=_as_affine_tuple(affine_lps),
        affine_file=affine_file,
        slice_index_map=analyzed.ordered_instance_uids,
        applied_rescale=applied_rescale,
        dtype=str(volume.dtype),
        irregular=analyzed.irregular,
        checksum_sha256=checksum,
    )


__all__ = [
    "VolumeBuildError",
    "VolumeBuildResult",
    "VolumeFormat",
    "build_volume",
    "default_volume_path",
    "infer_format",
]
