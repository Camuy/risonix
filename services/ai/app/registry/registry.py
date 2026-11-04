"""Registry degli adapter di modello disponibili."""

from __future__ import annotations

from collections.abc import Iterator

from ..adapters import SegmentationAdapter
from ..adapters.base import ModelAdapter


class ModelRegistry:
    """Mappa nome → classe di adapter. Non istanzia né carica pesi."""

    def __init__(self) -> None:
        self._adapters: dict[str, type[ModelAdapter]] = {}

    def register(self, adapter_cls: type[ModelAdapter]) -> type[ModelAdapter]:
        """Registra un adapter (decoratore riutilizzabile)."""
        self._adapters[adapter_cls.name] = adapter_cls
        return adapter_cls

    def get(self, name: str) -> type[ModelAdapter]:
        """Restituisce la classe di adapter registrata con il nome dato."""
        try:
            return self._adapters[name]
        except KeyError as exc:
            raise KeyError(f"Adapter sconosciuto: {name}") from exc

    def names(self) -> Iterator[str]:
        """Itera sui nomi degli adapter registrati."""
        return iter(self._adapters)

    def __len__(self) -> int:
        return len(self._adapters)


registry = ModelRegistry()
registry.register(SegmentationAdapter)
