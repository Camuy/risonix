"""Job runner in-process per operazioni non bloccanti (P1-07)."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from app.repositories import JobRepository

logger = logging.getLogger(__name__)

#: Handler di un job: riceve la sessione e il payload, restituisce un risultato JSON-friendly.
JobHandler = Callable[[Session, dict[str, Any]], dict[str, Any]]

#: Stati terminali di un job.
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


class UnknownJobTypeError(KeyError):
    """Nessun handler registrato per il tipo di job richiesto."""


class JobRunner:
    """Esegue gli handler in un pool di thread, tracciando lo stato su SQLite.

    Scelta deliberata per la Fase 1: nessuna infrastruttura esterna (Redis,
    Celery). Il runner è sufficiente per un deployment single-node e mantiene la
    coda persistente nel database (lo stato sopravvive al riavvio).
    """

    def __init__(self, session_factory: sessionmaker[Session], *, max_workers: int = 2) -> None:
        self._session_factory = session_factory
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="mri-job")
        self._handlers: dict[str, JobHandler] = {}
        self._lock = threading.Lock()
        self._closed = False

    def register(self, job_type: str, handler: JobHandler) -> None:
        """Registra (o sostituisce) l'handler di un tipo di job."""
        with self._lock:
            self._handlers[job_type] = handler

    def submit(self, job_type: str, payload: dict[str, Any]) -> int:
        """Accoda un job e restituisce il suo id. Solleva se il tipo è sconosciuto."""
        with self._lock:
            handler = self._handlers.get(job_type)
        if handler is None:
            raise UnknownJobTypeError(job_type)

        with self._session_factory() as session:
            job = JobRepository(session).create(
                job_type=job_type, status="queued", payload=dict(payload)
            )
            session.commit()
            job_id = job.id

        self._executor.submit(self._run, job_id, handler, payload)
        return job_id

    def _run(self, job_id: int, handler: JobHandler, payload: dict[str, Any]) -> None:
        self._set_status(job_id, status="running", progress=0.0)
        try:
            with self._session_factory() as session:
                result = handler(session, payload)
                self._complete(session, job_id, result)
                session.commit()
        except Exception as exc:  # noqa: BLE001 - l'errore va tracciato sul job
            logger.exception("job %s (%s) fallito", job_id, payload.get("source_path", ""))
            self._set_status(job_id, status="failed", error=str(exc))

    def _set_status(
        self,
        job_id: int,
        *,
        status: str,
        progress: float | None = None,
        error: str | None = None,
    ) -> None:
        with self._session_factory() as session:
            JobRepository(session).update_status(
                job_id, status=status, progress=progress, error=error
            )
            session.commit()

    def _complete(self, session: Session, job_id: int, result: dict[str, Any]) -> None:
        job = JobRepository(session).get(job_id)
        if job is None:
            return
        job.status = "completed"
        job.progress = 1.0
        job.error = None
        job.payload = {**job.payload, "result": result}
        job.updated_at = datetime.now(UTC)

    def wait(self, job_id: int, *, timeout: float = 30.0, interval: float = 0.05) -> str:
        """Attende la fine del job e restituisce lo stato finale (utile per i test)."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._session_factory() as session:
                job = JobRepository(session).get(job_id)
                status = job.status if job is not None else None
            if status is None:
                raise KeyError(job_id)
            if status in TERMINAL_STATUSES:
                return status
            time.sleep(interval)
        raise TimeoutError(f"job {job_id} non terminato entro {timeout}s")

    def shutdown(self, *, wait: bool = True) -> None:
        """Arresta il pool di thread."""
        with self._lock:
            if self._closed:
                return
            self._closed = True
        self._executor.shutdown(wait=wait, cancel_futures=True)


__all__ = ["JobHandler", "JobRunner", "TERMINAL_STATUSES", "UnknownJobTypeError"]
