"""Backup di base del database SQLite (P1-06).

Usa l'API di backup di ``sqlite3`` (``Connection.backup``) per produrre una
copia consistente **anche a database in uso**, senza fermare l'applicazione.

Procedura:
1. il backup viene scritto in ``<dir del db>/backups`` (o nella directory
   indicata), con timestamp UTC nel nome;
2. la copia è un file SQLite autonomo, ripristinabile copiandolo al posto del
   database originale a servizio fermo;
3. la rotazione dei backup è a carico dell'operatore (nessuna cancellazione
   automatica: i dati non si perdono mai per un bug di retention).
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path


def backup_database(db_path: str | Path, backup_dir: str | Path | None = None) -> Path:
    """Crea una copia consistente del database e ne restituisce il percorso."""
    source = Path(db_path)
    if not source.exists():
        raise FileNotFoundError(f"database non trovato: {source}")
    if str(backup_dir) == ":memory:" or source == Path(":memory:"):
        raise ValueError("il database in memoria non è soggetto a backup")

    destination_dir = Path(backup_dir) if backup_dir is not None else source.parent / "backups"
    destination_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    destination = destination_dir / f"{source.stem}-{timestamp}{source.suffix}.bak"

    with sqlite3.connect(source) as source_connection:
        with sqlite3.connect(destination) as destination_connection:
            source_connection.backup(destination_connection)
    return destination


__all__ = ["backup_database"]
