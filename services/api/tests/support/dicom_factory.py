"""Factory di DICOM sintetici con geometria nota (supporto test P1-01…P1-09)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import UID, ExplicitVRLittleEndian, MRImageStorage, generate_uid

DICOMDIR_SOP_CLASS_UID = "1.2.840.10008.1.3.10"

DEFAULT_ORIENTATION = ["1.0", "0.0", "0.0", "0.0", "1.0", "0.0"]

#: Coseni direttori (``ImageOrientationPatient``) dei tre piani anatomici.
AXIAL_ORIENTATION = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
CORONAL_ORIENTATION = (1.0, 0.0, 0.0, 0.0, 0.0, 1.0)
SAGITTAL_ORIENTATION = (0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def make_mr_dataset(
    *,
    rows: int = 8,
    cols: int = 8,
    pixel_bytes: bytes | None = None,
    sop_instance_uid: str | None = None,
    sop_class_uid: str = MRImageStorage,
    study_uid: str | None = None,
    series_uid: str | None = None,
    series_number: int = 1,
    instance_number: int = 1,
    modality: str = "MR",
    image_position: tuple[float, float, float] = (0.0, 0.0, 0.0),
    image_orientation: list[str] | None = None,
    pixel_spacing: tuple[float, float] = (1.0, 1.0),
    slice_thickness: float = 1.0,
    series_description: str | None = None,
    body_part: str | None = None,
    transfer_syntax: str = ExplicitVRLittleEndian,
    has_pixels: bool = True,
    extra: dict[str, Any] | None = None,
) -> FileDataset:
    """Costruisce una singola istanza MR sintetica pronta per ``save_as``."""
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = UID(sop_class_uid)
    file_meta.MediaStorageSOPInstanceUID = UID(sop_instance_uid or generate_uid())
    file_meta.TransferSyntaxUID = UID(transfer_syntax)

    ds = FileDataset("", {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.SOPClassUID = sop_class_uid
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = study_uid or generate_uid()
    ds.SeriesInstanceUID = series_uid or generate_uid()
    ds.Modality = modality
    ds.SeriesNumber = series_number
    ds.InstanceNumber = instance_number

    if has_pixels:
        ds.Rows = rows
        ds.Columns = cols
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 16
        ds.BitsStored = 12
        ds.HighBit = 11
        ds.PixelRepresentation = 0
        ds.ImagePositionPatient = [str(v) for v in image_position]
        ds.ImageOrientationPatient = list(image_orientation or DEFAULT_ORIENTATION)
        ds.PixelSpacing = [str(v) for v in pixel_spacing]
        ds.SliceThickness = str(slice_thickness)

    if series_description is not None:
        ds.SeriesDescription = series_description
    if body_part is not None:
        ds.BodyPartExamined = body_part

    if has_pixels:
        ds.PixelData = pixel_bytes or (b"\x00\x00" * rows * cols)
    if extra:
        for key, value in extra.items():
            setattr(ds, key, value)
    return ds


def write_mr_slice(path: Path, **kwargs: Any) -> Path:
    """Scrive una slice MR sintetica in ``path`` e restituisce il percorso."""
    path.parent.mkdir(parents=True, exist_ok=True)
    make_mr_dataset(**kwargs).save_as(path, enforce_file_format=True)
    return path


def write_dicomdir(root: Path, relative_file_ids: list[list[str]]) -> Path:
    """Scrive un DICOMDIR minimale che referenzia file relativi a ``root``."""
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = UID(DICOMDIR_SOP_CLASS_UID)
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset("", {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.FileSetID = "RISONIX_TEST"

    images = []
    for relative in relative_file_ids:
        record = Dataset()
        record.DirectoryRecordType = "IMAGE"
        record.ReferencedFileID = list(relative)
        images.append(record)

    series = Dataset()
    series.DirectoryRecordType = "SERIES"
    series.DirectoryRecordSequence = images

    study = Dataset()
    study.DirectoryRecordType = "STUDY"
    study.DirectoryRecordSequence = [series]

    patient = Dataset()
    patient.DirectoryRecordType = "PATIENT"
    patient.DirectoryRecordSequence = [study]

    ds.DirectoryRecordSequence = [patient]

    target = root / "DICOMDIR"
    ds.save_as(target, enforce_file_format=True)
    return target


def write_plain_text(path: Path, content: str = "not a dicom file\n") -> Path:
    """Scrive un file non-DICOM per i test di robustezza."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


@dataclass(frozen=True)
class SeriesPlan:
    """Descrizione di una serie sintetica con geometria nota."""

    series_number: int
    description: str
    orientation: tuple[float, ...]
    slice_spacing: float
    slice_count: int
    row_spacing: float = 0.5
    column_spacing: float = 0.5
    rows: int = 8
    cols: int = 8
    origin: tuple[float, float, float] = (0.0, 0.0, 0.0)


#: Protocollo RM ginocchio con 9 serie (riferimento del dataset di validazione).
KNEE_PROTOCOL: tuple[SeriesPlan, ...] = (
    SeriesPlan(1, "Localizer", AXIAL_ORIENTATION, slice_spacing=4.0, slice_count=3),
    SeriesPlan(2, "Sag PD FS", SAGITTAL_ORIENTATION, slice_spacing=3.5, slice_count=5),
    SeriesPlan(3, "Sag T2", SAGITTAL_ORIENTATION, slice_spacing=3.5, slice_count=5),
    SeriesPlan(4, "Sag T1", SAGITTAL_ORIENTATION, slice_spacing=3.5, slice_count=5),
    SeriesPlan(5, "Cor PD FS", CORONAL_ORIENTATION, slice_spacing=3.5, slice_count=5),
    SeriesPlan(6, "Cor T2", CORONAL_ORIENTATION, slice_spacing=3.5, slice_count=5),
    SeriesPlan(7, "Ax PD FS", AXIAL_ORIENTATION, slice_spacing=4.0, slice_count=5),
    SeriesPlan(8, "Ax T2", AXIAL_ORIENTATION, slice_spacing=4.0, slice_count=5),
    SeriesPlan(9, "3D Sag T1", SAGITTAL_ORIENTATION, slice_spacing=2.0, slice_count=6),
)


def series_normal(orientation: tuple[float, ...]) -> tuple[float, float, float]:
    """Normale unitaria di una serie (stessa convenzione del motore di P1-04)."""
    rx, ry, rz = orientation[0], orientation[1], orientation[2]
    cx, cy, cz = orientation[3], orientation[4], orientation[5]
    nx = ry * cz - rz * cy
    ny = rz * cx - rx * cz
    nz = rx * cy - ry * cx
    norm = (nx * nx + ny * ny + nz * nz) ** 0.5
    return (nx / norm, ny / norm, nz / norm)


@dataclass(frozen=True)
class GeneratedSeries:
    """Sommario di una serie sintetica scritta su disco."""

    series_instance_uid: str
    series_number: int
    description: str
    orientation: tuple[float, ...]
    normal: tuple[float, float, float]
    slice_spacing: float
    row_spacing: float
    column_spacing: float
    rows: int
    cols: int
    directory: Path
    instance_uids: tuple[str, ...]

    @property
    def slice_count(self) -> int:
        return len(self.instance_uids)


@dataclass(frozen=True)
class GeneratedPhantom:
    """Sommario di un phantom sintetico multi-serie."""

    study_instance_uid: str
    root: Path
    series: tuple[GeneratedSeries, ...]

    @property
    def series_count(self) -> int:
        return len(self.series)

    @property
    def instance_count(self) -> int:
        return sum(len(item.instance_uids) for item in self.series)


def _safe_name(text: str) -> str:
    return "".join(char if char.isalnum() else "_" for char in text).strip("_").lower()


def generate_phantom(
    root: Path,
    *,
    study_uid: str | None = None,
    plans: tuple[SeriesPlan, ...] = KNEE_PROTOCOL,
) -> GeneratedPhantom:
    """Genera un phantom multi-serie con geometria nota in ``root``.

    Ogni serie è regolare (spacing costante lungo la normale) così da poter
    validare ordinamento, spacing e orientamento senza rumore. Le posizioni
    avanzano esattamente lungo la normale, quindi la geometria attesa è
    riproducibile al bit.
    """
    root.mkdir(parents=True, exist_ok=True)
    resolved_study_uid = study_uid or generate_uid()
    generated: list[GeneratedSeries] = []

    for plan in plans:
        normal = series_normal(plan.orientation)
        series_uid = generate_uid()
        directory = root / f"series_{plan.series_number:02d}_{_safe_name(plan.description)}"
        instance_uids: list[str] = []
        for index in range(plan.slice_count):
            instance_uid = generate_uid()
            instance_uids.append(instance_uid)
            position = tuple(
                plan.origin[axis] + normal[axis] * plan.slice_spacing * index for axis in range(3)
            )
            write_mr_slice(
                directory / f"slice_{index:03d}.dcm",
                rows=plan.rows,
                cols=plan.cols,
                sop_instance_uid=instance_uid,
                study_uid=resolved_study_uid,
                series_uid=series_uid,
                series_number=plan.series_number,
                instance_number=index + 1,
                image_position=position,
                image_orientation=[str(v) for v in plan.orientation],
                pixel_spacing=(plan.row_spacing, plan.column_spacing),
                slice_thickness=plan.slice_spacing,
                series_description=plan.description,
                body_part="KNEE",
            )
        generated.append(
            GeneratedSeries(
                series_instance_uid=series_uid,
                series_number=plan.series_number,
                description=plan.description,
                orientation=plan.orientation,
                normal=normal,
                slice_spacing=plan.slice_spacing,
                row_spacing=plan.row_spacing,
                column_spacing=plan.column_spacing,
                rows=plan.rows,
                cols=plan.cols,
                directory=directory,
                instance_uids=tuple(instance_uids),
            )
        )

    return GeneratedPhantom(
        study_instance_uid=resolved_study_uid, root=root, series=tuple(generated)
    )


__all__ = [
    "AXIAL_ORIENTATION",
    "CORONAL_ORIENTATION",
    "DICOMDIR_SOP_CLASS_UID",
    "KNEE_PROTOCOL",
    "SAGITTAL_ORIENTATION",
    "GeneratedPhantom",
    "GeneratedSeries",
    "SeriesPlan",
    "generate_phantom",
    "make_mr_dataset",
    "pydicom",
    "series_normal",
    "write_dicomdir",
    "write_mr_slice",
    "write_plain_text",
]
