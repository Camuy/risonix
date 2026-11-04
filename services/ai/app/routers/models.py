"""Endpoint di ispezione del registry dei modelli (nessun peso caricato)."""

from fastapi import APIRouter

from ..models.schemas import ModelInfo
from ..registry import registry

router = APIRouter(tags=["models"])


@router.get("/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    """Elenca gli adapter disponibili; nessun modello viene istanziato o caricato."""
    return [
        ModelInfo(name=name, loaded=False, description=registry.get(name).description)
        for name in registry.names()
    ]
