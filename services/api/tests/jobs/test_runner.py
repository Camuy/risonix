"""Test del job runner in-process (P1-07)."""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.jobs import JobRunner, UnknownJobTypeError
from app.repositories import JobRepository


@pytest.fixture()
def runner(session_factory: sessionmaker[Session]):
    """Runner con un solo worker, arrestato a fine test."""
    runner = JobRunner(session_factory, max_workers=1)
    try:
        yield runner
    finally:
        runner.shutdown()


def _echo(_session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    return {"echo": payload}


def test_submit_records_result(runner: JobRunner, session_factory: sessionmaker[Session]) -> None:
    runner.register("echo", _echo)
    job_id = runner.submit("echo", {"value": 42})

    assert runner.wait(job_id) == "completed"
    with session_factory() as session:
        job = JobRepository(session).get(job_id)
        assert job is not None
        assert job.status == "completed"
        assert job.progress == 1.0
        assert job.error is None
        assert job.payload["result"] == {"echo": {"value": 42}}


def test_unknown_type_is_rejected(runner: JobRunner) -> None:
    with pytest.raises(UnknownJobTypeError):
        runner.submit("missing", {})


def test_failure_is_recorded(runner: JobRunner, session_factory: sessionmaker[Session]) -> None:
    def _boom(_session: Session, _payload: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("esplosione controllata")

    runner.register("boom", _boom)
    job_id = runner.submit("boom", {})

    assert runner.wait(job_id) == "failed"
    with session_factory() as session:
        job = JobRepository(session).get(job_id)
        assert job is not None
        assert job.status == "failed"
        assert job.error is not None
        assert "esplosione controllata" in job.error


def test_wait_unknown_job_raises(runner: JobRunner) -> None:
    with pytest.raises(KeyError):
        runner.wait(12345)
