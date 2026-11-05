"""Test dell'estrazione e normalizzazione dei metadati (P1-03)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.dicom import metadata
from tests.support.dicom_factory import write_mr_slice, write_plain_text


def _full_slice(tmp_path: Path) -> Path:
    return write_mr_slice(
        tmp_path / "slice",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=1,
        rows=16,
        cols=16,
        pixel_spacing=(0.5, 0.5),
        slice_thickness=2.0,
        image_position=(1.0, 2.0, 3.0),
        series_description="T1",
        modality="MR",
        extra={
            "StudyDate": "20240115",
            "BodyPartExamined": "KNEE",
            "MagneticFieldStrength": 3.0,
            "ScanningSequence": "GR",
            "RepetitionTime": 1500.0,
            "EchoTime": 30.0,
            "RescaleSlope": 2.0,
            "RescaleIntercept": -100.0,
        },
    )


def test_extracts_and_normalizes_known_fields(tmp_path: Path) -> None:
    result = metadata.extract_metadata(_full_slice(tmp_path))

    assert result is not None
    assert result.rows == 16
    assert result.columns == 16
    assert result.pixel_spacing == (0.5, 0.5)
    assert result.slice_thickness == 2.0
    assert result.image_position_patient == (1.0, 2.0, 3.0)
    assert len(result.image_orientation_patient or ()) == 6
    assert result.modality == "MR"
    assert result.study_date == "2024-01-15"
    assert result.repetition_time == 1500.0
    assert result.echo_time == 30.0


def test_rescale_defaults_to_identity_when_absent(tmp_path: Path) -> None:
    path = write_mr_slice(
        tmp_path / "slice", study_uid="1.1", series_uid="1.1.1", instance_number=1
    )
    result = metadata.extract_metadata(path)

    assert result is not None
    assert result.rescale() == (1.0, 0.0)
    assert "rescale_slope" in result.missing_fields
    assert "rescale_intercept" in result.missing_fields


def test_rescale_values_are_normalized(tmp_path: Path) -> None:
    result = metadata.extract_metadata(_full_slice(tmp_path))

    assert result is not None
    assert result.rescale() == (2.0, -100.0)
    assert "rescale_slope" not in result.missing_fields


def test_missing_attributes_are_marked_not_crashing(tmp_path: Path) -> None:
    write_mr_slice(
        tmp_path / "plain",
        study_uid="1.1",
        series_uid="1.1.1",
        modality="SR",
        has_pixels=False,
    )
    result = metadata.extract_metadata(tmp_path / "plain")

    assert result is not None
    for field in ("rows", "columns", "pixel_spacing", "image_position_patient"):
        assert field in result.missing_fields
    assert result.rows is None


def test_anomalous_multivalue_is_discarded(tmp_path: Path) -> None:
    path = write_mr_slice(
        tmp_path / "slice",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=1,
        extra={"PixelSpacing": ["1.0", "2.0", "3.0"]},
    )
    result = metadata.extract_metadata(path)

    assert result is not None
    assert result.pixel_spacing is None
    assert "pixel_spacing" in result.missing_fields


@pytest.mark.filterwarnings("ignore:Invalid value for VR CS")
def test_modality_is_uppercased(tmp_path: Path) -> None:
    path = write_mr_slice(
        tmp_path / "slice",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=1,
        modality="mr",
    )
    result = metadata.extract_metadata(path)

    assert result is not None
    assert result.modality == "MR"


def test_unreadable_file_returns_none(tmp_path: Path) -> None:
    write_plain_text(tmp_path / "notes.txt")
    assert metadata.extract_metadata(tmp_path / "notes.txt") is None
    assert metadata.extract_metadata(tmp_path / "missing.dcm") is None


def test_metadata_to_dict_reports_missing(tmp_path: Path) -> None:
    result = metadata.extract_metadata(_full_slice(tmp_path))
    assert result is not None

    payload = metadata.metadata_to_dict(result)

    assert payload["modality"] == "MR"
    assert "missing_fields" in payload
    assert "window_center" in payload["missing_fields"]
    assert "rows" not in payload["missing_fields"]
