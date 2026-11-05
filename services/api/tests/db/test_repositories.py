"""Test CRUD dei repository (P1-06)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Instance, Series, Study
from app.repositories import (
    ExperimentRepository,
    InstanceRepository,
    JobRepository,
    ModelRepository,
    ProcessingRepository,
    SegmentationRepository,
    SeriesRepository,
    StudyRepository,
    VolumeRepository,
)


def _make_tree(session: Session) -> tuple[StudyRepository, SeriesRepository, InstanceRepository]:
    studies = StudyRepository(session)
    series = SeriesRepository(session)
    instances = InstanceRepository(session)

    study = studies.create(
        study_instance_uid="1.2.3.1",
        patient_id="anon-001",
        study_date="2026-01-01",
        description="Test study",
    )
    first = series.create(
        study_fk=study.id,
        series_instance_uid="1.2.3.1.1",
        series_number=1,
        modality="MR",
        instance_count=2,
        rows=2,
        columns=2,
        pixel_spacing=[1.0, 1.0],
        slice_spacing=3.0,
        normal=[0.0, 0.0, 1.0],
        origin=[0.0, 0.0, 0.0],
    )
    instances.create(
        series_fk=first.id,
        sop_instance_uid="1.2.3.1.1.1",
        path="/data/original/s1.dcm",
        kind="image",
        slice_index=0,
        position=[0.0, 0.0, 0.0],
        orientation=[1, 0, 0, 0, 1, 0],
    )
    instances.create(
        series_fk=first.id,
        sop_instance_uid="1.2.3.1.1.2",
        path="/data/original/s2.dcm",
        kind="image",
        slice_index=1,
        position=[0.0, 0.0, 3.0],
        orientation=[1, 0, 0, 0, 1, 0],
    )
    session.commit()
    return studies, series, instances


def test_study_crud(session: Session) -> None:
    studies = StudyRepository(session)
    study = studies.create(study_instance_uid="1.9", description="desc")
    session.commit()
    assert study.id is not None
    assert studies.get_by_uid("1.9") is not None
    assert studies.get(study.id) is not None
    assert studies.count() == 1

    same = studies.get_or_create("1.9", description="ignored")
    assert same.id == study.id
    assert studies.count() == 1

    assert studies.delete_by_uid("1.9") is True
    session.commit()
    assert studies.get_by_uid("1.9") is None
    assert studies.delete_by_uid("1.9") is False


def test_series_and_instance_lookup(session: Session) -> None:
    _, series_repo, instances = _make_tree(session)
    study = session.scalar(select(Study).where(Study.study_instance_uid == "1.2.3.1"))
    assert study is not None

    stored_series = series_repo.get_by_uid("1.2.3.1.1")
    assert stored_series is not None
    assert stored_series.modality == "MR"
    assert stored_series.pixel_spacing == [1.0, 1.0]

    listed = series_repo.list_for_study(study.id)
    assert [s.series_instance_uid for s in listed] == ["1.2.3.1.1"]

    ordered_instances = instances.list_for_series(stored_series.id)
    assert [i.slice_index for i in ordered_instances] == [0, 1]
    assert instances.get_by_uid("1.2.3.1.1.2") is not None


def test_cascade_delete_removes_children(session: Session) -> None:
    studies, _, _ = _make_tree(session)
    studies.delete_by_uid("1.2.3.1")
    session.commit()
    assert session.scalar(select(Series).where(Series.series_instance_uid == "1.2.3.1.1")) is None
    assert session.scalar(select(Instance)) is None


def test_derived_entities(session: Session) -> None:
    _, series_repo, _ = _make_tree(session)
    stored_series = series_repo.get_by_uid("1.2.3.1.1")
    assert stored_series is not None

    volumes = VolumeRepository(session)
    volume = volumes.create(
        series_fk=stored_series.id,
        path="/data/processed/1.2.3.1.1.nii.gz",
        volume_format="nifti",
        shape=[2, 2, 2],
        spacing=[1.0, 1.0, 3.0],
        checksum_sha256="abc123",
    )
    assert volumes.get_by_checksum("abc123") is volume
    assert volumes.list_for_series(stored_series.id) == [volume]

    segmentations = SegmentationRepository(session)
    segmentation = segmentations.create(
        volume_fk=volume.id, path="/data/segmentations/label.nii.gz", name="tumor", label=1
    )
    assert segmentations.list_for_volume(volume.id) == [segmentation]

    processing = ProcessingRepository(session)
    processing.create(kind="convert", status="done", series_fk=stored_series.id)
    assert len(processing.list_for_series(stored_series.id)) == 1
    session.commit()


def test_job_lifecycle(session: Session) -> None:
    jobs = JobRepository(session)
    job = jobs.create(job_type="import", payload={"path": "/data/incoming/x"})
    session.commit()
    assert job.status == "pending"

    updated = jobs.update_status(job.id, status="running", progress=0.5)
    assert updated is not None
    assert updated.progress == 0.5

    failed = jobs.update_status(job.id, status="failed", error="boom")
    assert failed is not None
    assert failed.error == "boom"
    assert [j.id for j in jobs.list_by_status("failed")] == [job.id]
    assert jobs.update_status(999_999, status="running") is None


def test_model_and_experiment(session: Session) -> None:
    models = ModelRepository(session)
    model = models.create(name="unet", version="1.0", extra_metadata={"source": "test"})
    assert models.get_by_name_version("unet", "1.0") is model
    assert models.get_by_name_version("unet", None) is None

    experiments = ExperimentRepository(session)
    experiment = experiments.create(name="exp-1", config={"lr": 0.01}, metrics={"dice": 0.9})
    assert experiment.id is not None
    assert experiments.get(experiment.id) is not None
    session.commit()
