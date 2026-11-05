"""Fixture condivise per i test di persistenza (P1-06)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.migrate import upgrade_to_head
from app.db.session import create_db_engine, create_session_factory


@pytest.fixture()
def db_path(tmp_path: Path) -> Path:
    """Percorso di un database SQLite temporaneo (non ancora migrato)."""
    return tmp_path / "database" / "mri.sqlite3"


@pytest.fixture()
def engine(db_path: Path) -> Iterator[Engine]:
    """Engine su un database migrato fino all'ultima revisione."""
    upgrade_to_head(db_path)
    engine = create_db_engine(db_path)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def session(engine: Engine) -> Iterator[Session]:
    """Sessione con rollback finale, indipendente per ogni test."""
    factory: sessionmaker[Session] = create_session_factory(engine)
    with factory() as session:
        yield session
        session.rollback()
