"""Factory dell'applicazione FastAPI."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .core.config import Settings, get_settings
from .core.logging import configure_logging
from .db.migrate import upgrade_to_head
from .db.session import create_db_engine, create_session_factory
from .dicom.volume import VolumeFormat
from .jobs import JobRunner
from .routers import health, instances, jobs, series, studies, version
from .services.import_service import import_study


def _make_import_handler(settings: Settings):
    """Costruisce l'handler che esegue un import nella sessione del worker."""

    def handler(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
        requested = payload.get("deidentify")
        deidentify = settings.deidentify if requested is None else bool(requested)
        result = import_study(
            session,
            payload["source_path"],
            data_dir=settings.data_dir,
            build_volumes=bool(payload.get("build_volumes", True)),
            volume_format=cast(VolumeFormat, payload.get("volume_format", "nifti")),
            allow_irregular=bool(payload.get("allow_irregular", False)),
            deidentify=deidentify,
            deidentify_salt=settings.deidentify_salt,
            deidentify_remap_uids=settings.deidentify_remap_uids,
        )
        return result.to_dict()

    return handler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Prepara database, sessioni e runner dei job all'avvio del servizio."""
    settings: Settings = app.state.settings
    upgrade_to_head(settings.db_path)
    engine = create_db_engine(settings.db_path)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.job_runner = JobRunner(app.state.session_factory)
    app.state.job_runner.register(studies.IMPORT_JOB_TYPE, _make_import_handler(settings))
    try:
        yield
    finally:
        app.state.job_runner.shutdown()
        engine.dispose()


def create_app() -> FastAPI:
    """Costruisce l'istanza FastAPI con router, database e job runner."""
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title="Risonix MRI API",
        version=settings.version,
        description="Backend FastAPI di Risonix MRI Explorer.",
        lifespan=lifespan,
    )
    app.state.settings = settings

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(version.router, prefix="/api")
    app.include_router(studies.router)
    app.include_router(series.router)
    app.include_router(instances.router)
    app.include_router(jobs.router)
    return app


app = create_app()
