"""Applicazione programmatica delle migrazioni Alembic (P1-06).

Consente di portare il database allo schema corrente senza invocare la CLI di
Alembic, sia dai test sia dall'avvio dell'applicazione.
"""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

#: Directory delle migrazioni: ``services/api/migrations``.
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def make_alembic_config(db_path: str | Path) -> Config:
    """Costruisce una :class:`Config` Alembic puntata al database indicato."""
    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{Path(db_path)}")
    return config


def upgrade_to_head(db_path: str | Path) -> None:
    """Applica tutte le migrazioni fino alla revisione più recente."""
    command.upgrade(make_alembic_config(db_path), "head")


def downgrade_to_base(db_path: str | Path) -> None:
    """Riporta il database allo stato vuoto (nessuna tabella applicativa)."""
    command.downgrade(make_alembic_config(db_path), "base")


__all__ = [
    "MIGRATIONS_DIR",
    "downgrade_to_base",
    "make_alembic_config",
    "upgrade_to_head",
]
