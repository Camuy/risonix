"""Fixture per i test dell'API (P1-07)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydicom.uid import generate_uid

from app.core.config import get_settings
from app.main import create_app
from tests.support.dicom_factory import write_mr_slice


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    """Data dir isolata con una sottocartella ``incoming``."""
    root = tmp_path / "data"
    (root / "incoming").mkdir(parents=True)
    return root


@pytest.fixture()
def dicom_series(data_dir: Path) -> Path:
    """Serie MR di tre slice scritta in ``incoming/serie_a``."""
    study_uid = generate_uid()
    series_uid = generate_uid()
    target = data_dir / "incoming" / "serie_a"
    for index in range(3):
        write_mr_slice(
            target / f"slice_{index:03d}.dcm",
            study_uid=study_uid,
            series_uid=series_uid,
            instance_number=index + 1,
            image_position=(0.0, 0.0, float(index) * 2.0),
            series_description="T1",
        )
    return target


@pytest.fixture()
def client(data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """TestClient con lifespan attivo su un database temporaneo."""
    monkeypatch.setenv("MRI_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MRI_DB_PATH", str(data_dir / "database" / "mri.sqlite3"))
    get_settings.cache_clear()
    app = create_app()
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        get_settings.cache_clear()
