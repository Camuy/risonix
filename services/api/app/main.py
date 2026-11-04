"""Factory dell'applicazione FastAPI."""

from fastapi import FastAPI

from .core.config import get_settings
from .core.logging import configure_logging
from .routers import health, version


def create_app() -> FastAPI:
    """Costruisce l'istanza FastAPI con router e logging configurati."""
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title="Risonix MRI API",
        version=settings.version,
        description="Backend FastAPI di Risonix MRI Explorer.",
    )
    app.include_router(health.router)
    app.include_router(version.router, prefix="/api")
    return app


app = create_app()
