"""Repository per Volume, Segmentation e Processing (P1-06)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Processing, Segmentation, Volume
from app.repositories.base import Repository


class VolumeRepository(Repository[Volume]):
    """Accesso ai volumi derivati."""

    model = Volume

    def list_for_series(self, series_id: int) -> list[Volume]:
        """Volumi generati da una serie."""
        return list(
            self.session.scalars(
                select(Volume).where(Volume.series_fk == series_id).order_by(Volume.id)
            )
        )

    def get_by_checksum(self, checksum_sha256: str) -> Volume | None:
        """Volume con il checksum indicato (se già costruito)."""
        return self.session.scalar(select(Volume).where(Volume.checksum_sha256 == checksum_sha256))

    def create(
        self,
        *,
        series_fk: int,
        path: str,
        volume_format: str,
        provenance_path: str | None = None,
        shape: list[int] | None = None,
        spacing: list[float] | None = None,
        origin: list[float] | None = None,
        normal: list[float] | None = None,
        affine_lps: list[list[float]] | None = None,
        dtype: str | None = None,
        irregular: bool = False,
        checksum_sha256: str | None = None,
    ) -> Volume:
        """Registra un volume derivato."""
        return self.add(
            Volume(
                series_fk=series_fk,
                path=path,
                volume_format=volume_format,
                provenance_path=provenance_path,
                shape=shape,
                spacing=spacing,
                origin=origin,
                normal=normal,
                affine_lps=affine_lps,
                dtype=dtype,
                irregular=irregular,
                checksum_sha256=checksum_sha256,
            )
        )


class SegmentationRepository(Repository[Segmentation]):
    """Accesso alle maschere di segmentazione."""

    model = Segmentation

    def list_for_volume(self, volume_id: int) -> list[Segmentation]:
        """Maschere associate a un volume."""
        return list(
            self.session.scalars(
                select(Segmentation)
                .where(Segmentation.volume_fk == volume_id)
                .order_by(Segmentation.id)
            )
        )

    def create(
        self,
        *,
        volume_fk: int,
        path: str,
        name: str,
        label: int | None = None,
        color: str | None = None,
        anatomy: dict[str, Any] | None = None,
    ) -> Segmentation:
        """Registra una maschera di segmentazione."""
        return self.add(
            Segmentation(
                volume_fk=volume_fk,
                path=path,
                name=name,
                label=label,
                color=color,
                anatomy=anatomy if anatomy is not None else {},
            )
        )


class ProcessingRepository(Repository[Processing]):
    """Accesso ai record di elaborazione."""

    model = Processing

    def list_for_series(self, series_id: int) -> list[Processing]:
        """Elaborazioni registrate per una serie."""
        return list(
            self.session.scalars(
                select(Processing).where(Processing.series_fk == series_id).order_by(Processing.id)
            )
        )

    def create(
        self,
        *,
        kind: str,
        status: str,
        series_fk: int | None = None,
        volume_fk: int | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> Processing:
        """Registra un'elaborazione."""
        return self.add(
            Processing(
                kind=kind,
                status=status,
                series_fk=series_fk,
                volume_fk=volume_fk,
                parameters=parameters if parameters is not None else {},
            )
        )


def derived_repositories(
    session: Session,
) -> tuple[VolumeRepository, SegmentationRepository, ProcessingRepository]:
    """Costruisce i repository dei dati derivati sulla stessa sessione."""
    return (
        VolumeRepository(session),
        SegmentationRepository(session),
        ProcessingRepository(session),
    )


__all__ = [
    "ProcessingRepository",
    "SegmentationRepository",
    "VolumeRepository",
    "derived_repositories",
]
