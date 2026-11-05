"""Repository layer: CRUD tipizzato sopra lo schema SQLite (P1-06)."""

from app.repositories.base import Repository
from app.repositories.catalog import (
    InstanceRepository,
    SeriesRepository,
    StudyRepository,
    repositories,
)
from app.repositories.derived import (
    ProcessingRepository,
    SegmentationRepository,
    VolumeRepository,
    derived_repositories,
)
from app.repositories.jobs import (
    ExperimentRepository,
    JobRepository,
    ModelRepository,
    job_repositories,
)

__all__ = [
    "ExperimentRepository",
    "InstanceRepository",
    "JobRepository",
    "ModelRepository",
    "ProcessingRepository",
    "Repository",
    "SegmentationRepository",
    "SeriesRepository",
    "StudyRepository",
    "VolumeRepository",
    "derived_repositories",
    "job_repositories",
    "repositories",
]
