"""Test del servizio di import (P1-07)."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydicom.uid import generate_uid
from sqlalchemy.orm import Session

from app.repositories import SeriesRepository, StudyRepository, VolumeRepository
from app.services.import_service import ImportValidationError, import_study, validate_source
from tests.support.dicom_factory import write_mr_slice


def _write_series(
    root: Path, *, count: int = 3, study_uid: str | None = None, series_uid: str | None = None
) -> tuple[str, str]:
    study_uid = study_uid or generate_uid()
    series_uid = series_uid or generate_uid()
    for index in range(count):
        write_mr_slice(
            root / f"slice_{index:03d}.dcm",
            study_uid=study_uid,
            series_uid=series_uid,
            instance_number=index + 1,
            image_position=(0.0, 0.0, float(index) * 2.0),
        )
    return study_uid, series_uid


def test_import_builds_catalog_and_volume(session: Session, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    source = data_dir / "incoming" / "serie_a"
    study_uid, series_uid = _write_series(source)

    result = import_study(session, source, data_dir=data_dir)

    assert result.studies == 1
    assert result.series == 1
    assert result.instances == 3
    assert result.volumes == 1

    study = StudyRepository(session).get_by_uid(study_uid)
    assert study is not None
    series = SeriesRepository(session).get_by_uid(series_uid)
    assert series is not None
    assert series.instance_count == 3
    volumes = VolumeRepository(session).list_for_series(series.id)
    assert len(volumes) == 1
    assert Path(volumes[0].path).exists()
    assert volumes[0].checksum_sha256 is not None


def test_import_is_idempotent(session: Session, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    source = data_dir / "incoming" / "serie_b"
    _write_series(source)

    import_study(session, source, data_dir=data_dir)
    second = import_study(session, source, data_dir=data_dir)

    assert second.studies == 0
    assert second.series == 0
    assert second.instances == 0
    assert second.volumes == 0


def test_import_can_skip_volumes(session: Session, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    source = data_dir / "incoming" / "serie_c"
    _, series_uid = _write_series(source)

    result = import_study(session, source, data_dir=data_dir, build_volumes=False)

    assert result.volumes == 0
    series = SeriesRepository(session).get_by_uid(series_uid)
    assert series is not None
    assert VolumeRepository(session).list_for_series(series.id) == []


def test_validate_source_accepts_relative_inside_data_dir(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    (data_dir / "incoming" / "x").mkdir(parents=True)
    resolved = validate_source("incoming/x", data_dir)
    assert resolved.is_dir()


def test_validate_source_rejects_outside_data_dir(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    other = tmp_path / "other"
    other.mkdir()
    with pytest.raises(ImportValidationError):
        validate_source(other, data_dir)


def test_validate_source_rejects_missing(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    with pytest.raises(ImportValidationError):
        validate_source("incoming/assente", data_dir)
