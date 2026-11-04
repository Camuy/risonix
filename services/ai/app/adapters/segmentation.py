"""Adapter di esempio per la segmentazione 3D (scheletro, Fase 5)."""

from __future__ import annotations

from typing import Any

from .base import ModelAdapter


class SegmentationAdapter(ModelAdapter):
    """Adapter di segmentazione basato su MONAI/PyTorch (CPU).

    Nessun peso viene caricato all'avvio e nessun download automatico avviene:
    il caricamento richiede un percorso di pesi configurato esplicitamente.
    """

    name = "segmentation"
    description = "Segmentazione 3D MONAI/PyTorch su CPU (nessun peso caricato all'avvio)."

    def __init__(self, weights_path: str | None = None) -> None:
        super().__init__()
        self._weights_path = weights_path
        self._model: Any | None = None

    def load(self) -> None:
        """Carica i pesi; importa torch/monai solo a questo punto."""
        if self._loaded:
            return
        if not self._weights_path:
            raise RuntimeError(
                "Percorso dei pesi non configurato: nessun download automatico di modelli."
            )
        import monai  # noqa: F401  # import lazy (non richiesto all'avvio)
        import torch  # noqa: F401  # import lazy (non richiesto all'avvio)

        # Il caricamento effettivo dei pesi è previsto nella Fase 5.
        self._loaded = True

    def predict(self, payload: Any) -> Any:
        """Esegue l'inferenza (disponibile dalla Fase 5)."""
        if not self._loaded:
            raise RuntimeError("Adapter non caricato: chiamare load() prima di predict().")
        raise NotImplementedError("Inferenza disponibile a partire dalla Fase 5.")
