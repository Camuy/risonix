"""Factory di DICOM sintetici con geometria nota (supporto test P1-01…P1-09)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import UID, ExplicitVRLittleEndian, MRImageStorage, generate_uid

DICOMDIR_SOP_CLASS_UID = "1.2.840.10008.1.3.10"

DEFAULT_ORIENTATION = ["1.0", "0.0", "0.0", "0.0", "1.0", "0.0"]


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


__all__ = [
    "DICOMDIR_SOP_CLASS_UID",
    "make_mr_dataset",
    "pydicom",
    "write_dicomdir",
    "write_mr_slice",
    "write_plain_text",
]
