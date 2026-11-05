"""Test del backup di base del database (P1-06)."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import Engine, func, inspect, select

from app.db.backup import backup_database
from app.db.models import Study
from app.db.session import create_db_engine, session_scope
from app.repositories import StudyRepository


def test_backup_creates_readable_copy(engine: Engine, db_path: Path) -> None:
    with session_scope(engine) as session:
        StudyRepository(session).create(study_instance_uid="1.2.3", description="backup me")

    destination = backup_database(db_path)
    assert destination.exists()
    assert destination.parent == db_path.parent / "backups"
    assert destination.suffix == ".bak"

    restored = create_db_engine(destination)
    try:
        assert "study" in inspect(restored).get_table_names()
        with session_scope(restored) as session:
            assert session.scalar(select(func.count()).select_from(Study)) == 1
    finally:
        restored.dispose()


def test_backup_to_explicit_directory(engine: Engine, db_path: Path, tmp_path: Path) -> None:
    with session_scope(engine) as session:
        StudyRepository(session).create(study_instance_uid="1.2.4")
    target = tmp_path / "snapshots"
    destination = backup_database(db_path, target)
    assert destination.parent == target


def test_backup_missing_database_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        backup_database(tmp_path / "absent.sqlite3")
