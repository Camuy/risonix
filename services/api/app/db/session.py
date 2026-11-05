"""Creazione di engine e sessioni SQLAlchemy per SQLite (P1-06)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def _enable_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    """Abilita il rispetto delle foreign key, disattivato di default in SQLite."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_db_engine(db_path: str | Path, *, echo: bool = False) -> Engine:
    """Crea un engine SQLite per il percorso indicato, creando la directory padre."""
    path = Path(db_path)
    if path.name != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    url = "sqlite+pysqlite:///:memory:" if str(db_path) == ":memory:" else f"sqlite:///{path}"
    engine = create_engine(url, echo=echo, future=True)
    event.listen(engine, "connect", _enable_foreign_keys)
    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Restituisce una factory di sessioni legata all'engine."""
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope(engine: Engine) -> Iterator[Session]:
    """Contesto transazionale: commit in uscita, rollback in caso di errore."""
    factory = create_session_factory(engine)
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


__all__ = ["create_db_engine", "create_session_factory", "session_scope"]
