"""Test delle migrazioni Alembic (P1-06)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine, inspect

from app.db import models  # noqa: F401  (registra le tabelle su Base.metadata)
from app.db.base import Base
from app.db.migrate import downgrade_to_base, upgrade_to_head
from app.db.session import create_db_engine

EXPECTED_TABLES = {
    "study",
    "series",
    "instance",
    "volume",
    "processing",
    "segmentation",
    "model",
    "job",
    "experiment",
}


def _application_tables(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names()) - {"alembic_version"}


def test_migrations_apply_from_scratch(db_path: Path) -> None:
    upgrade_to_head(db_path)
    engine = create_db_engine(db_path)
    try:
        assert _application_tables(engine) == EXPECTED_TABLES
    finally:
        engine.dispose()


def test_migrated_schema_matches_metadata(db_path: Path) -> None:
    upgrade_to_head(db_path)
    engine = create_db_engine(db_path)
    try:
        inspector = inspect(engine)
        for table_name, table in Base.metadata.tables.items():
            migrated_columns = {column["name"] for column in inspector.get_columns(table_name)}
            assert migrated_columns == set(table.columns.keys()), table_name
    finally:
        engine.dispose()


def test_downgrade_removes_application_tables(db_path: Path) -> None:
    upgrade_to_head(db_path)
    downgrade_to_base(db_path)
    engine = create_db_engine(db_path)
    try:
        assert _application_tables(engine) == set()
    finally:
        engine.dispose()


def test_no_image_blob_columns(db_path: Path) -> None:
    upgrade_to_head(db_path)
    engine = create_db_engine(db_path)
    try:
        inspector = inspect(engine)
        blob_like = {"pixel_data", "pixels", "data", "array", "image"}
        for table_name in _application_tables(engine):
            for column in inspector.get_columns(table_name):
                assert column["name"].lower() not in blob_like
                assert column["type"].__class__.__name__ != "LargeBinary"
    finally:
        engine.dispose()


def test_upgrade_creates_database_and_directory(tmp_path: Path) -> None:
    db = tmp_path / "db" / "mri.sqlite3"
    upgrade_to_head(db)
    assert db.exists()
    assert (tmp_path / "db").is_dir()
