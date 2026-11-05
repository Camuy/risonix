"""Estrazione e normalizzazione dei metadati DICOM (P1-03).

Il modello :class:`InstanceMetadata` mappa i campi rilevanti documentati nella
specifica (identità, studio, serie, acquisizione, geometria, parametri pixel).
Ogni attributo mancante o anomalo è **esplicitamente marcato assente** tramite
:attr:`InstanceMetadata.missing_fields` invece di causare un errore.

Il modulo non registra mai valori dei metadati: i campi possono contenere PHI
(es. ``StudyDescription``) e non devono finire nei log.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from datetime import datetime
from pathlib import Path
from typing import Any

from app.dicom.headers import as_float, as_float_tuple, as_int, as_text, read_dataset

#: Tag DICOM letti per comporre i metadati normalizzati (nessun pixel data).
METADATA_TAGS = [
    "SOPInstanceUID",
    "SOPClassUID",
    "StudyInstanceUID",
    "StudyDescription",
    "StudyDate",
    "SeriesInstanceUID",
    "SeriesNumber",
    "SeriesDescription",
    "Modality",
    "BodyPartExamined",
    "Manufacturer",
    "ManufacturerModelName",
    "MagneticFieldStrength",
    "SequenceName",
    "ScanningSequence",
    "RepetitionTime",
    "EchoTime",
    "InversionTime",
    "FlipAngle",
    "Rows",
    "Columns",
    "PixelSpacing",
    "SliceThickness",
    "SpacingBetweenSlices",
    "ImagePositionPatient",
    "ImageOrientationPatient",
    "SliceLocation",
    "InstanceNumber",
    "PhotometricInterpretation",
    "SamplesPerPixel",
    "BitsAllocated",
    "BitsStored",
    "PixelRepresentation",
    "RescaleSlope",
    "RescaleIntercept",
    "WindowCenter",
    "WindowWidth",
]

#: Lunghezza attesa dei campi geometrici multi-valore (per scartare valori anomali).
_EXPECTED_LENGTHS = {
    "pixel_spacing": 2,
    "image_position_patient": 3,
    "image_orientation_patient": 6,
}


@dataclass(frozen=True)
class InstanceMetadata:
    """Modello normalizzato dei metadati di una singola istanza DICOM."""

    sop_instance_uid: str
    sop_class_uid: str | None

    study_instance_uid: str | None
    study_description: str | None
    study_date: str | None

    series_instance_uid: str | None
    series_number: int | None
    series_description: str | None
    modality: str | None
    body_part_examined: str | None

    manufacturer: str | None
    manufacturer_model_name: str | None
    magnetic_field_strength: float | None
    sequence_name: str | None
    scanning_sequence: str | None
    repetition_time: float | None
    echo_time: float | None
    inversion_time: float | None
    flip_angle: float | None

    rows: int | None
    columns: int | None
    pixel_spacing: tuple[float, ...] | None
    slice_thickness: float | None
    spacing_between_slices: float | None
    image_position_patient: tuple[float, ...] | None
    image_orientation_patient: tuple[float, ...] | None
    slice_location: float | None
    instance_number: int | None

    photometric_interpretation: str | None
    samples_per_pixel: int | None
    bits_allocated: int | None
    bits_stored: int | None
    pixel_representation: int | None
    rescale_slope: float | None
    rescale_intercept: float | None
    window_center: tuple[float, ...] | None
    window_width: tuple[float, ...] | None

    @property
    def missing_fields(self) -> frozenset[str]:
        """Nomi dei campi esplicitamente assenti (valore ``None``)."""
        return frozenset(field.name for field in fields(self) if getattr(self, field.name) is None)

    def rescale(self) -> tuple[float, float]:
        """Fattori ``(slope, intercept)`` effettivi, con default identità."""
        slope = self.rescale_slope if self.rescale_slope is not None else 1.0
        intercept = self.rescale_intercept if self.rescale_intercept is not None else 0.0
        return slope, intercept


def _normalize_date(value: Any) -> str | None:
    text = as_text(value)
    if text is None:
        return None
    try:
        return datetime.strptime(text, "%Y%m%d").date().isoformat()
    except ValueError:
        return text


def _normalized_floats(value: Any, field_name: str) -> tuple[float, ...] | None:
    floats = as_float_tuple(value)
    expected = _EXPECTED_LENGTHS.get(field_name)
    if floats is None or (expected is not None and len(floats) != expected):
        return None
    return floats


def extract_metadata(path: str | Path) -> InstanceMetadata | None:
    """Estrae i metadati normalizzati da un file DICOM.

    Restituisce ``None`` se il file non è leggibile o non possiede un
    ``SOPInstanceUID``.
    """
    target = Path(path)
    dataset = read_dataset(target, METADATA_TAGS)
    if dataset is None:
        return None
    sop_instance_uid = as_text(getattr(dataset, "SOPInstanceUID", None))
    if not sop_instance_uid:
        return None

    modality = as_text(getattr(dataset, "Modality", None))

    return InstanceMetadata(
        sop_instance_uid=sop_instance_uid,
        sop_class_uid=as_text(getattr(dataset, "SOPClassUID", None)),
        study_instance_uid=as_text(getattr(dataset, "StudyInstanceUID", None)),
        study_description=as_text(getattr(dataset, "StudyDescription", None)),
        study_date=_normalize_date(getattr(dataset, "StudyDate", None)),
        series_instance_uid=as_text(getattr(dataset, "SeriesInstanceUID", None)),
        series_number=as_int(getattr(dataset, "SeriesNumber", None)),
        series_description=as_text(getattr(dataset, "SeriesDescription", None)),
        modality=modality.upper() if modality else None,
        body_part_examined=as_text(getattr(dataset, "BodyPartExamined", None)),
        manufacturer=as_text(getattr(dataset, "Manufacturer", None)),
        manufacturer_model_name=as_text(getattr(dataset, "ManufacturerModelName", None)),
        magnetic_field_strength=as_float(getattr(dataset, "MagneticFieldStrength", None)),
        sequence_name=as_text(getattr(dataset, "SequenceName", None)),
        scanning_sequence=as_text(getattr(dataset, "ScanningSequence", None)),
        repetition_time=as_float(getattr(dataset, "RepetitionTime", None)),
        echo_time=as_float(getattr(dataset, "EchoTime", None)),
        inversion_time=as_float(getattr(dataset, "InversionTime", None)),
        flip_angle=as_float(getattr(dataset, "FlipAngle", None)),
        rows=as_int(getattr(dataset, "Rows", None)),
        columns=as_int(getattr(dataset, "Columns", None)),
        pixel_spacing=_normalized_floats(getattr(dataset, "PixelSpacing", None), "pixel_spacing"),
        slice_thickness=as_float(getattr(dataset, "SliceThickness", None)),
        spacing_between_slices=as_float(getattr(dataset, "SpacingBetweenSlices", None)),
        image_position_patient=_normalized_floats(
            getattr(dataset, "ImagePositionPatient", None), "image_position_patient"
        ),
        image_orientation_patient=_normalized_floats(
            getattr(dataset, "ImageOrientationPatient", None), "image_orientation_patient"
        ),
        slice_location=as_float(getattr(dataset, "SliceLocation", None)),
        instance_number=as_int(getattr(dataset, "InstanceNumber", None)),
        photometric_interpretation=as_text(getattr(dataset, "PhotometricInterpretation", None)),
        samples_per_pixel=as_int(getattr(dataset, "SamplesPerPixel", None)),
        bits_allocated=as_int(getattr(dataset, "BitsAllocated", None)),
        bits_stored=as_int(getattr(dataset, "BitsStored", None)),
        pixel_representation=as_int(getattr(dataset, "PixelRepresentation", None)),
        rescale_slope=as_float(getattr(dataset, "RescaleSlope", None)),
        rescale_intercept=as_float(getattr(dataset, "RescaleIntercept", None)),
        window_center=as_float_tuple(getattr(dataset, "WindowCenter", None)),
        window_width=as_float_tuple(getattr(dataset, "WindowWidth", None)),
    )


def metadata_to_dict(metadata: InstanceMetadata) -> dict[str, Any]:
    """Serializza i metadati in una struttura JSON-friendly (nessun PHI mascherato)."""
    return {field.name: getattr(metadata, field.name) for field in fields(metadata)} | {
        "missing_fields": sorted(metadata.missing_fields)
    }


__all__ = ["METADATA_TAGS", "InstanceMetadata", "extract_metadata", "metadata_to_dict"]
