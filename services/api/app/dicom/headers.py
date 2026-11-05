"""Lettura sicura degli header DICOM e coercizione dei valori (condivisi P1).

Un header viene letto con ``stop_before_pixels`` per non toccare i pixel; se il
parse normale fallisce per assenza di preambolo si tenta un parse forzato ma
**validato** dal chiamante sui tag minimi. La coercizione dei valori è
tollerante: un attributo anomalo diventa ``None`` invece di far fallire l'import.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pydicom
from pydicom.dataset import Dataset
from pydicom.errors import InvalidDicomError


def read_dataset(path: str | Path, specific_tags: list[str] | None = None) -> Dataset | None:
    """Legge l'header di ``path`` (senza pixel); ``None`` se non è leggibile."""
    target = Path(path)
    try:
        return pydicom.dcmread(target, stop_before_pixels=True, specific_tags=specific_tags)
    except InvalidDicomError:
        pass
    except (OSError, ValueError):
        return None
    try:
        return pydicom.dcmread(
            target, stop_before_pixels=True, force=True, specific_tags=specific_tags
        )
    except (InvalidDicomError, OSError, ValueError):
        return None


def as_text(value: Any) -> str | None:
    """Normalizza un valore testuale: spazi rimossi, stringa vuota → ``None``."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def as_int(value: Any) -> int | None:
    """Converte in intero; ``None`` se assente o non numerico."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_float(value: Any) -> float | None:
    """Converte in float; ``None`` se assente o non numerico."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def as_float_tuple(value: Any) -> tuple[float, ...] | None:
    """Converte un multi-valore in tupla di float; ``None`` se assente o invalido."""
    if value is None:
        return None
    if isinstance(value, (str, bytes)):
        parts = str(value).replace("\\", " ").split()
    else:
        try:
            parts = list(value)
        except TypeError:
            return None
    try:
        return tuple(float(item) for item in parts)
    except (TypeError, ValueError):
        return None


__all__ = ["as_float", "as_float_tuple", "as_int", "as_text", "read_dataset"]
