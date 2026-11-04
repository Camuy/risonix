"""Schemi Pydantic esposti dall'API."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Risposta dell'endpoint di healthcheck."""

    status: str


class VersionResponse(BaseModel):
    """Metadati sul servizio in esecuzione."""

    service: str
    version: str
    env: str
