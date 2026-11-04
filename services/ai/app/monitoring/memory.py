"""Monitoraggio della memoria del processo.

Predisposto per la Fase 5 (budget di memoria e observability dell'inferenza).
Legge il consumo del cgroup v2 quando disponibile (container Linux), con
fallback su ``resource.getrusage`` (portabile su macOS per lo sviluppo).
"""

from __future__ import annotations

import resource
import sys
from pathlib import Path

_CGROUP_V2_CURRENT = Path("/sys/fs/cgroup/memory.current")


def current_memory_mb() -> float:
    """Consumo di memoria del processo in MiB."""
    if _CGROUP_V2_CURRENT.is_file():
        try:
            return int(_CGROUP_V2_CURRENT.read_text().strip()) / (1024 * 1024)
        except (OSError, ValueError):
            pass

    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return peak / (1024 * 1024)
    return peak / 1024
