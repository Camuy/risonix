"""Repository per Study, Series e Instance (P1-06)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Instance, Series, Study
from app.repositories.base import Repository


class StudyRepository(Repository[Study]):
    """Accesso agli studi, indicizzati per ``study_instance_uid``."""

    model = Study

    def get_by_uid(self, study_instance_uid: str) -> Study | None:
        """Recupera lo studio con l'UID indicato."""
        return self.session.scalar(
            select(Study).where(Study.study_instance_uid == study_instance_uid)
        )

    def create(
        self,
        *,
        study_instance_uid: str,
        patient_id: str | None = None,
        patient_name: str | None = None,
        study_date: str | None = None,
        description: str | None = None,
    ) -> Study:
        """Crea uno studio."""
        return self.add(
            Study(
                study_instance_uid=study_instance_uid,
                patient_id=patient_id,
                patient_name=patient_name,
                study_date=study_date,
                description=description,
            )
        )

    def get_or_create(self, study_instance_uid: str, **fields: Any) -> Study:
        """Restituisce lo studio esistente o ne crea uno nuovo."""
        existing = self.get_by_uid(study_instance_uid)
        if existing is not None:
            return existing
        return self.create(study_instance_uid=study_instance_uid, **fields)

    def delete_by_uid(self, study_instance_uid: str) -> bool:
        """Elimina lo studio (e a cascata serie/istanze). ``True`` se esisteva."""
        study = self.get_by_uid(study_instance_uid)
        if study is None:
            return False
        self.delete(study)
        return True


class SeriesRepository(Repository[Series]):
    """Accesso alle serie, indicizzate per ``series_instance_uid``."""

    model = Series

    def get_by_uid(self, series_instance_uid: str) -> Series | None:
        """Recupera la serie con l'UID indicato."""
        return self.session.scalar(
            select(Series).where(Series.series_instance_uid == series_instance_uid)
        )

    def list_for_study(self, study_id: int) -> list[Series]:
        """Serie appartenenti a uno studio, ordinate per numero di serie."""
        return list(
            self.session.scalars(
                select(Series)
                .where(Series.study_fk == study_id)
                .order_by(Series.series_number, Series.id)
            )
        )

    def create(
        self,
        *,
        study_fk: int,
        series_instance_uid: str,
        series_number: int | None = None,
        modality: str | None = None,
        description: str | None = None,
        instance_count: int = 0,
        rows: int | None = None,
        columns: int | None = None,
        pixel_spacing: list[float] | None = None,
        slice_spacing: float | None = None,
        normal: list[float] | None = None,
        origin: list[float] | None = None,
        irregular: bool = False,
        issues: list[dict[str, Any]] | None = None,
    ) -> Series:
        """Crea una serie."""
        return self.add(
            Series(
                study_fk=study_fk,
                series_instance_uid=series_instance_uid,
                series_number=series_number,
                modality=modality,
                description=description,
                instance_count=instance_count,
                rows=rows,
                columns=columns,
                pixel_spacing=pixel_spacing,
                slice_spacing=slice_spacing,
                normal=normal,
                origin=origin,
                irregular=irregular,
                issues=issues if issues is not None else [],
            )
        )

    def delete_by_uid(self, series_instance_uid: str) -> bool:
        """Elimina la serie (e a cascata istanze/volumi). ``True`` se esisteva."""
        series = self.get_by_uid(series_instance_uid)
        if series is None:
            return False
        self.delete(series)
        return True


class InstanceRepository(Repository[Instance]):
    """Accesso alle istanze, indicizzate per ``sop_instance_uid``."""

    model = Instance

    def get_by_uid(self, sop_instance_uid: str) -> Instance | None:
        """Recupera l'istanza con l'UID indicato."""
        return self.session.scalar(
            select(Instance).where(Instance.sop_instance_uid == sop_instance_uid)
        )

    def list_for_series(self, series_id: int) -> list[Instance]:
        """Istanze di una serie, ordinate per indice di slice."""
        return list(
            self.session.scalars(
                select(Instance)
                .where(Instance.series_fk == series_id)
                .order_by(Instance.slice_index, Instance.id)
            )
        )

    def create(
        self,
        *,
        series_fk: int,
        sop_instance_uid: str,
        path: str,
        sop_class_uid: str | None = None,
        kind: str | None = None,
        instance_number: int | None = None,
        slice_index: int | None = None,
        position: list[float] | None = None,
        orientation: list[float] | None = None,
    ) -> Instance:
        """Crea un'istanza."""
        return self.add(
            Instance(
                series_fk=series_fk,
                sop_instance_uid=sop_instance_uid,
                sop_class_uid=sop_class_uid,
                path=path,
                kind=kind,
                instance_number=instance_number,
                slice_index=slice_index,
                position=position,
                orientation=orientation,
            )
        )

    def delete_by_uid(self, sop_instance_uid: str) -> bool:
        """Elimina l'istanza con l'UID indicato. ``True`` se esisteva."""
        instance = self.get_by_uid(sop_instance_uid)
        if instance is None:
            return False
        self.delete(instance)
        return True


def repositories(session: Session) -> tuple[StudyRepository, SeriesRepository, InstanceRepository]:
    """Costruisce i tre repository del catalogo sulla stessa sessione."""
    return StudyRepository(session), SeriesRepository(session), InstanceRepository(session)


__all__ = [
    "InstanceRepository",
    "SeriesRepository",
    "StudyRepository",
    "repositories",
]
