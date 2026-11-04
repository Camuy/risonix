"""Schemi Pydantic del servizio AI."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Stato del servizio e consumo di memoria corrente."""

    status: str
    memory_mb: float


class VersionResponse(BaseModel):
    """Metadati sul servizio in esecuzione."""

    service: str
    version: str
    env: str


class ModelInfo(BaseModel):
    """Descrizione di un adapter presente nel registry (non caricato)."""

    name: str
    loaded: bool
    description: str
