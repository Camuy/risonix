"""Dipendenze FastAPI condivise dai router (P1-07).

Lo stato applicativo (engine, factory di sessioni, job runner) è costruito nel
lifespan di :func:`app.main.create_app` e recuperato da ``request.app.state``.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.jobs import JobRunner


def get_app_settings(request: Request) -> Settings:
    """Impostazioni applicative."""
    return request.app.state.settings


def get_session(request: Request) -> Iterator[Session]:
    """Sessione SQLAlchemy legata alla richiesta (chiusa a fine richiesta)."""
    factory = request.app.state.session_factory
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_job_runner(request: Request) -> JobRunner:
    """Runner dei job asincroni."""
    return request.app.state.job_runner


#: Alias ``Annotated`` per l'iniezione delle dipendenze nei router.
SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
JobRunnerDep = Annotated[JobRunner, Depends(get_job_runner)]


__all__ = [
    "JobRunnerDep",
    "SessionDep",
    "SettingsDep",
    "get_app_settings",
    "get_job_runner",
    "get_session",
]
