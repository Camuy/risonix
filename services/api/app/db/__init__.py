"""Persistenza SQLite: modelli, sessioni, migrazioni e backup (P1-06).

Questo package contiene **solo metadati e riferimenti**: i file DICOM e i
volumi/maschere restano sul filesystem (``data/``). Nessun array immagine è mai
salvato nel database.
"""

from app.db.base import Base
from app.db.session import create_db_engine, create_session_factory, session_scope

__all__ = ["Base", "create_db_engine", "create_session_factory", "session_scope"]
