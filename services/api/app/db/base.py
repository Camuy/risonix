"""Base declarativa SQLAlchemy 2.0 per lo schema SQLite (P1-06)."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base comune a tutti i modelli ORM di Risonix."""
