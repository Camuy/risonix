"""Interfaccia degli adapter di modello.

Gli import pesanti (torch/monai) restano confinati nei metodi, così l'avvio del
servizio e gli endpoint di base non richiedono il caricamento del runtime ML.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ModelAdapter(ABC):
    """Adapter di un modello di inferenza CPU."""

    name: str
    description: str = ""

    def __init__(self) -> None:
        self._loaded = False

    @property
    def loaded(self) -> bool:
        """True se i pesi sono stati caricati in memoria."""
        return self._loaded

    @abstractmethod
    def load(self) -> None:
        """Carica i pesi (lazy). Nessun download automatico."""

    @abstractmethod
    def predict(self, payload: Any) -> Any:
        """Esegue l'inferenza su CPU."""
