"""Repository CRUD generico su SQLAlchemy (P1-06)."""

from __future__ import annotations

from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.db.base import Base


class Repository[ModelT: Base]:
    """CRUD minimale e tipizzato per un modello ORM.

    Le sessioni sono iniettate: il repository non gestisce commit/rollback, così
    più repository possono condividere la stessa transazione.
    """

    model: type[ModelT]

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, entity: ModelT) -> ModelT:
        """Aggiunge l'entità alla sessione e assegna la chiave primaria."""
        self.session.add(entity)
        self.session.flush()
        return entity

    def get(self, entity_id: int) -> ModelT | None:
        """Recupera un'entità per chiave primaria."""
        return self.session.get(self.model, entity_id)

    def list(self, *, limit: int | None = None, offset: int = 0) -> list[ModelT]:
        """Elenca le entità ordinate per chiave primaria."""
        primary_key = inspect(self.model).primary_key[0]
        statement = select(self.model).order_by(primary_key).offset(offset)
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def count(self) -> int:
        """Numero di righe della tabella."""
        return int(self.session.scalar(select(func.count()).select_from(self.model)) or 0)

    def delete(self, entity: ModelT) -> None:
        """Elimina fisicamente l'entità."""
        self.session.delete(entity)
        self.session.flush()


__all__ = ["Repository"]
