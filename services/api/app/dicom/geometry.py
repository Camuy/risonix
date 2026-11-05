"""Motore geometrico per l'ordinamento e la validazione delle serie DICOM (P1-04).

L'ordinamento delle slice si basa sulla **geometria fisica** (normale della
serie e proiezione di ``ImagePositionPatient`` su di essa), non sul nome file o
su ``InstanceNumber``. Un errore qui invalida tutte le fasi successive.

Il motore preserva orientamento originale e coordinate: ogni valore restituito
è una copia normalizzata dei dati di partenza, mai una riproiezione.

Limiti documentati
------------------
* Lo spacing è calcolato solo **lungo la normale** della serie. In presenza di
  spacing anisotropo (in-plane ≠ through-plane) o di acquisizioni non parallele
  (interleaved, spiral, multi-eco) lo spacing risultante è una stima e la serie
  viene marcata come irregolare.
* L'ordinamento è crescente lungo la normale: per una visualizzazione coerente
  con l'orientamento radiologico serve un successivo flip nel volume builder.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median
from typing import Any

import numpy as np
from numpy.typing import NDArray

from app.dicom.metadata import InstanceMetadata

#: Tolleranza (mm) sotto la quale due posizioni sono considerate coincidenti.
POSITION_EPSILON = 1e-3
#: Tolleranza sulla coerenza dei coseni direttori (prodotto scalare).
ORIENTATION_EPSILON = 1e-3
#: Un intervallo superiore a ``spacing * GAP_FACTOR`` è considerato un gap.
GAP_FACTOR = 1.5
#: Deviazione relativa ammessa tra uno spacing e lo spacing mediano.
DEFAULT_SPACING_TOLERANCE = 0.2

Vector3 = tuple[float, float, float]


@dataclass(frozen=True)
class GeometryIssue:
    """Anomalia geometrica rilevata, con codice stabile e dettaglio leggibile."""

    code: str
    detail: str


@dataclass(frozen=True)
class SliceSample:
    """Proiezione di una slice lungo la normale della serie."""

    sop_instance_uid: str
    position: Vector3
    distance: float
    instance_number: int | None


@dataclass(frozen=True)
class SeriesGeometry:
    """Esito dell'analisi geometrica di una serie."""

    ordered_instance_uids: tuple[str, ...]
    normal: Vector3 | None
    slice_spacing: float | None
    spacing_values: tuple[float, ...]
    duplicate_positions: tuple[float, ...]
    gap_count: int
    orientation_consistent: bool
    irregular: bool
    issues: tuple[GeometryIssue, ...]
    unplaced_instance_uids: tuple[str, ...]

    @property
    def ordered_count(self) -> int:
        return len(self.ordered_instance_uids)


def slice_normal(orientation: Sequence[float]) -> Vector3 | None:
    """Normale unitaria della slice dal vettore ``ImageOrientationPatient`` (6 valori)."""
    if len(orientation) != 6:
        return None
    row: NDArray[np.float64] = np.asarray(orientation[:3], dtype=np.float64)
    column: NDArray[np.float64] = np.asarray(orientation[3:], dtype=np.float64)
    normal = np.cross(row, column)
    length = float(np.linalg.norm(normal))
    if length <= POSITION_EPSILON:
        return None
    unit = normal / length
    return (float(unit[0]), float(unit[1]), float(unit[2]))


def _project(position: Sequence[float], normal: Vector3) -> float:
    vector: NDArray[np.float64] = np.asarray(position, dtype=np.float64)
    axis: NDArray[np.float64] = np.asarray(normal, dtype=np.float64)
    return float(np.dot(vector, axis))


def _dot(first: Vector3, second: Vector3) -> float:
    return float(np.dot(np.asarray(first), np.asarray(second)))


def _fallback_order(instances: Sequence[InstanceMetadata]) -> tuple[str, ...]:
    ordered = sorted(
        instances,
        key=lambda instance: (
            instance.instance_number if instance.instance_number is not None else 1 << 30,
            instance.sop_instance_uid,
        ),
    )
    return tuple(instance.sop_instance_uid for instance in ordered)


def _base_normal(instances: Sequence[InstanceMetadata]) -> Vector3 | None:
    for instance in instances:
        orientation = instance.image_orientation_patient
        if orientation is None:
            continue
        candidate = slice_normal(orientation)
        if candidate is not None:
            return candidate
    return None


def _collect_samples(
    instances: Sequence[InstanceMetadata],
    normal: Vector3,
    issues: list[GeometryIssue],
) -> tuple[list[SliceSample], list[str], bool]:
    samples: list[SliceSample] = []
    unplaced: list[str] = []
    orientation_consistent = True

    for instance in instances:
        position = instance.image_position_patient
        orientation = instance.image_orientation_patient
        if position is None or len(position) != 3:
            unplaced.append(instance.sop_instance_uid)
            issues.append(
                GeometryIssue(
                    "missing_position",
                    f"{instance.sop_instance_uid}: ImagePositionPatient assente",
                )
            )
            continue
        if orientation is None:
            issues.append(
                GeometryIssue(
                    "instance_missing_orientation",
                    f"{instance.sop_instance_uid}: ImageOrientationPatient assente, "
                    "proiettata sull'orientamento di serie",
                )
            )
            instance_normal = normal
        else:
            candidate = slice_normal(orientation)
            if candidate is None:
                orientation_consistent = False
                issues.append(
                    GeometryIssue(
                        "invalid_orientation",
                        f"{instance.sop_instance_uid}: ImageOrientationPatient degenere",
                    )
                )
                instance_normal = normal
            else:
                instance_normal = candidate
                alignment = _dot(candidate, normal)
                if alignment < 0.0:
                    orientation_consistent = False
                    issues.append(
                        GeometryIssue(
                            "flipped_orientation",
                            f"{instance.sop_instance_uid}: orientamento opposto alla serie",
                        )
                    )
                elif alignment < 1.0 - ORIENTATION_EPSILON:
                    orientation_consistent = False
                    issues.append(
                        GeometryIssue(
                            "inconsistent_orientation",
                            f"{instance.sop_instance_uid}: orientamento non allineato "
                            "alla normale di serie",
                        )
                    )

        x, y, z = (float(position[0]), float(position[1]), float(position[2]))
        samples.append(
            SliceSample(
                sop_instance_uid=instance.sop_instance_uid,
                position=(x, y, z),
                distance=_project(position, instance_normal),
                instance_number=instance.instance_number,
            )
        )

    samples.sort(
        key=lambda sample: (
            sample.distance,
            sample.instance_number if sample.instance_number is not None else 1 << 30,
        )
    )
    return samples, unplaced, orientation_consistent


def _analyze_spacing(
    samples: Sequence[SliceSample],
    issues: list[GeometryIssue],
    tolerance: float,
) -> tuple[float | None, tuple[float, ...], tuple[float, ...], int]:
    gaps = [
        abs(samples[index + 1].distance - samples[index].distance)
        for index in range(len(samples) - 1)
    ]
    duplicates = tuple(
        sorted(
            {
                round(samples[index].distance, 6)
                for index, gap in enumerate(gaps)
                if gap <= POSITION_EPSILON
            }
        )
    )
    if duplicates:
        issues.append(
            GeometryIssue(
                "duplicate_slice",
                f"{len(duplicates)} posizioni coincidenti lungo la normale",
            )
        )

    positive = [gap for gap in gaps if gap > POSITION_EPSILON]
    if not positive:
        return None, (), duplicates, 0

    spacing = float(median(positive))
    gap_count = sum(1 for gap in positive if gap > spacing * GAP_FACTOR)
    if gap_count:
        issues.append(
            GeometryIssue(
                "slice_gap",
                f"{gap_count} intervalli maggiori di {GAP_FACTOR:.1f}x lo spacing mediano",
            )
        )

    for gap in positive:
        if abs(gap - spacing) > tolerance * spacing:
            issues.append(
                GeometryIssue(
                    "anomalous_spacing",
                    f"intervallo {gap:.3f} mm fuori tolleranza rispetto a {spacing:.3f} mm",
                )
            )
            break

    return spacing, tuple(positive), duplicates, gap_count


def analyze_geometry(
    instances: Sequence[InstanceMetadata],
    *,
    spacing_tolerance: float = DEFAULT_SPACING_TOLERANCE,
) -> SeriesGeometry:
    """Ordina le slice per proiezione sulla normale e valida la geometria."""
    issues: list[GeometryIssue] = []

    if not instances:
        return SeriesGeometry((), None, None, (), (), 0, True, True, (), ())

    normal = _base_normal(instances)
    if normal is None:
        issues.append(
            GeometryIssue(
                "missing_orientation", "nessuna ImageOrientationPatient valida nella serie"
            )
        )
        return SeriesGeometry(
            ordered_instance_uids=_fallback_order(instances),
            normal=None,
            slice_spacing=None,
            spacing_values=(),
            duplicate_positions=(),
            gap_count=0,
            orientation_consistent=False,
            irregular=True,
            issues=tuple(issues),
            unplaced_instance_uids=(),
        )

    samples, unplaced, orientation_consistent = _collect_samples(instances, normal, issues)
    spacing, spacing_values, duplicates, gap_count = _analyze_spacing(
        samples, issues, spacing_tolerance
    )

    anomalies = {issue.code for issue in issues} & {"anomalous_spacing", "slice_gap"}
    irregular = bool(unplaced) or not orientation_consistent or bool(anomalies) or bool(duplicates)

    return SeriesGeometry(
        ordered_instance_uids=tuple(sample.sop_instance_uid for sample in samples),
        normal=normal,
        slice_spacing=spacing,
        spacing_values=spacing_values,
        duplicate_positions=duplicates,
        gap_count=gap_count,
        orientation_consistent=orientation_consistent,
        irregular=irregular,
        issues=tuple(issues),
        unplaced_instance_uids=tuple(unplaced),
    )


def order_instances(
    instances: Sequence[InstanceMetadata],
    *,
    spacing_tolerance: float = DEFAULT_SPACING_TOLERANCE,
) -> tuple[InstanceMetadata, ...]:
    """Restituisce le istanze ordinate geometricamente (posizionate, poi le altre)."""
    geometry = analyze_geometry(instances, spacing_tolerance=spacing_tolerance)
    by_uid = {instance.sop_instance_uid: instance for instance in instances}
    ordered = [by_uid[uid] for uid in geometry.ordered_instance_uids if uid in by_uid]
    ordered.extend(by_uid[uid] for uid in geometry.unplaced_instance_uids if uid in by_uid)
    return tuple(ordered)


def geometry_to_dict(geometry: SeriesGeometry) -> dict[str, Any]:
    """Serializza l'esito geometrico in una struttura JSON-friendly."""
    return {
        "ordered_instance_uids": list(geometry.ordered_instance_uids),
        "normal": list(geometry.normal) if geometry.normal is not None else None,
        "slice_spacing": geometry.slice_spacing,
        "spacing_values": list(geometry.spacing_values),
        "duplicate_positions": list(geometry.duplicate_positions),
        "gap_count": geometry.gap_count,
        "orientation_consistent": geometry.orientation_consistent,
        "irregular": geometry.irregular,
        "unplaced_instance_uids": list(geometry.unplaced_instance_uids),
        "issues": [{"code": issue.code, "detail": issue.detail} for issue in geometry.issues],
    }


__all__ = [
    "DEFAULT_SPACING_TOLERANCE",
    "GAP_FACTOR",
    "ORIENTATION_EPSILON",
    "POSITION_EPSILON",
    "GeometryIssue",
    "SeriesGeometry",
    "SliceSample",
    "analyze_geometry",
    "geometry_to_dict",
    "order_instances",
    "slice_normal",
]
