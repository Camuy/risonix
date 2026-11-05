"""Repository per Job, Model ed Experiment (P1-06)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Experiment, Job, Model
from app.repositories.base import Repository


class JobRepository(Repository[Job]):
    """Accesso ai job asincroni e al loro stato."""

    model = Job

    def list_by_status(self, status: str) -> list[Job]:
        """Job con lo stato indicato, dal più recente."""
        return list(
            self.session.scalars(select(Job).where(Job.status == status).order_by(Job.id.desc()))
        )

    def create(
        self,
        *,
        job_type: str,
        status: str = "pending",
        progress: float = 0.0,
        payload: dict[str, Any] | None = None,
    ) -> Job:
        """Crea un job."""
        return self.add(
            Job(
                job_type=job_type,
                status=status,
                progress=progress,
                payload=payload if payload is not None else {},
            )
        )

    def update_status(
        self,
        job_id: int,
        *,
        status: str,
        progress: float | None = None,
        error: str | None = None,
    ) -> Job | None:
        """Aggiorna stato, progresso ed errore di un job. ``None`` se assente."""
        job = self.get(job_id)
        if job is None:
            return None
        job.status = status
        if progress is not None:
            job.progress = progress
        job.error = error
        job.updated_at = datetime.now(UTC)
        self.session.flush()
        return job


class ModelRepository(Repository[Model]):
    """Accesso ai modelli AI registrati."""

    model = Model

    def get_by_name_version(self, name: str, version: str | None) -> Model | None:
        """Modello con nome e versione indicati."""
        statement = select(Model).where(Model.name == name)
        if version is None:
            statement = statement.where(Model.version.is_(None))
        else:
            statement = statement.where(Model.version == version)
        return self.session.scalar(statement)

    def create(
        self,
        *,
        name: str,
        version: str | None = None,
        license: str | None = None,
        checksum: str | None = None,
        adapter: str | None = None,
        extra_metadata: dict[str, Any] | None = None,
    ) -> Model:
        """Registra un modello."""
        return self.add(
            Model(
                name=name,
                version=version,
                license=license,
                checksum=checksum,
                adapter=adapter,
                extra_metadata=extra_metadata if extra_metadata is not None else {},
            )
        )


class ExperimentRepository(Repository[Experiment]):
    """Accesso agli esperimenti di ricerca."""

    model = Experiment

    def create(
        self,
        *,
        name: str,
        config: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
        outputs: dict[str, Any] | None = None,
        metrics: dict[str, Any] | None = None,
    ) -> Experiment:
        """Registra un esperimento."""
        return self.add(
            Experiment(
                name=name,
                config=config if config is not None else {},
                inputs=inputs if inputs is not None else {},
                outputs=outputs if outputs is not None else {},
                metrics=metrics if metrics is not None else {},
            )
        )


def job_repositories(
    session: Session,
) -> tuple[JobRepository, ModelRepository, ExperimentRepository]:
    """Costruisce i repository di job/modelli/esperimenti sulla stessa sessione."""
    return JobRepository(session), ModelRepository(session), ExperimentRepository(session)


__all__ = [
    "ExperimentRepository",
    "JobRepository",
    "ModelRepository",
    "job_repositories",
]
