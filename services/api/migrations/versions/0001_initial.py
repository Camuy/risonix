"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-05 00:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "study",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("study_instance_uid", sa.String(length=128), nullable=False),
        sa.Column("patient_id", sa.String(length=128), nullable=True),
        sa.Column("patient_name", sa.String(length=256), nullable=True),
        sa.Column("study_date", sa.String(length=32), nullable=True),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_study_study_instance_uid", "study", ["study_instance_uid"], unique=True)

    op.create_table(
        "series",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("study_fk", sa.Integer(), nullable=False),
        sa.Column("series_instance_uid", sa.String(length=128), nullable=False),
        sa.Column("series_number", sa.Integer(), nullable=True),
        sa.Column("modality", sa.String(length=16), nullable=True),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("instance_count", sa.Integer(), nullable=False),
        sa.Column("rows", sa.Integer(), nullable=True),
        sa.Column("columns", sa.Integer(), nullable=True),
        sa.Column("pixel_spacing", sa.JSON(), nullable=True),
        sa.Column("slice_spacing", sa.Float(), nullable=True),
        sa.Column("normal", sa.JSON(), nullable=True),
        sa.Column("origin", sa.JSON(), nullable=True),
        sa.Column("irregular", sa.Boolean(), nullable=False),
        sa.Column("issues", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["study_fk"], ["study.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_series_study_fk", "series", ["study_fk"])
    op.create_index("ix_series_series_instance_uid", "series", ["series_instance_uid"], unique=True)
    op.create_index("ix_series_modality", "series", ["modality"])

    op.create_table(
        "instance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("series_fk", sa.Integer(), nullable=False),
        sa.Column("sop_instance_uid", sa.String(length=128), nullable=False),
        sa.Column("sop_class_uid", sa.String(length=128), nullable=True),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=True),
        sa.Column("instance_number", sa.Integer(), nullable=True),
        sa.Column("slice_index", sa.Integer(), nullable=True),
        sa.Column("position", sa.JSON(), nullable=True),
        sa.Column("orientation", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["series_fk"], ["series.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_instance_series_fk", "instance", ["series_fk"])
    op.create_index("ix_instance_sop_instance_uid", "instance", ["sop_instance_uid"], unique=True)
    op.create_index("ix_instance_kind", "instance", ["kind"])

    op.create_table(
        "volume",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("series_fk", sa.Integer(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("provenance_path", sa.Text(), nullable=True),
        sa.Column("volume_format", sa.String(length=16), nullable=False),
        sa.Column("shape", sa.JSON(), nullable=True),
        sa.Column("spacing", sa.JSON(), nullable=True),
        sa.Column("origin", sa.JSON(), nullable=True),
        sa.Column("normal", sa.JSON(), nullable=True),
        sa.Column("affine_lps", sa.JSON(), nullable=True),
        sa.Column("dtype", sa.String(length=32), nullable=True),
        sa.Column("irregular", sa.Boolean(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["series_fk"], ["series.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_volume_series_fk", "volume", ["series_fk"])
    op.create_index("ix_volume_checksum_sha256", "volume", ["checksum_sha256"])

    op.create_table(
        "processing",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("series_fk", sa.Integer(), nullable=True),
        sa.Column("volume_fk", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["series_fk"], ["series.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["volume_fk"], ["volume.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_processing_series_fk", "processing", ["series_fk"])
    op.create_index("ix_processing_volume_fk", "processing", ["volume_fk"])
    op.create_index("ix_processing_kind", "processing", ["kind"])
    op.create_index("ix_processing_status", "processing", ["status"])

    op.create_table(
        "segmentation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("volume_fk", sa.Integer(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("label", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=16), nullable=True),
        sa.Column("anatomy", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["volume_fk"], ["volume.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_segmentation_volume_fk", "segmentation", ["volume_fk"])

    op.create_table(
        "model",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.Column("license", sa.String(length=128), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("adapter", sa.String(length=128), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_model_name", "model", ["name"])

    op.create_table(
        "job",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_job_job_type", "job", ["job_type"])
    op.create_index("ix_job_status", "job", ["status"])

    op.create_table(
        "experiment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("outputs", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("experiment")
    op.drop_index("ix_job_status", table_name="job")
    op.drop_index("ix_job_job_type", table_name="job")
    op.drop_table("job")
    op.drop_index("ix_model_name", table_name="model")
    op.drop_table("model")
    op.drop_index("ix_segmentation_volume_fk", table_name="segmentation")
    op.drop_table("segmentation")
    op.drop_index("ix_processing_status", table_name="processing")
    op.drop_index("ix_processing_kind", table_name="processing")
    op.drop_index("ix_processing_volume_fk", table_name="processing")
    op.drop_index("ix_processing_series_fk", table_name="processing")
    op.drop_table("processing")
    op.drop_index("ix_volume_checksum_sha256", table_name="volume")
    op.drop_index("ix_volume_series_fk", table_name="volume")
    op.drop_table("volume")
    op.drop_index("ix_instance_kind", table_name="instance")
    op.drop_index("ix_instance_sop_instance_uid", table_name="instance")
    op.drop_index("ix_instance_series_fk", table_name="instance")
    op.drop_table("instance")
    op.drop_index("ix_series_modality", table_name="series")
    op.drop_index("ix_series_series_instance_uid", table_name="series")
    op.drop_index("ix_series_study_fk", table_name="series")
    op.drop_table("series")
    op.drop_index("ix_study_study_instance_uid", table_name="study")
    op.drop_table("study")
