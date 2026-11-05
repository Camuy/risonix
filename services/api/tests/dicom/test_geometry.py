"""Test del motore geometrico (P1-04)."""

from __future__ import annotations

from pathlib import Path

from app.dicom import geometry, metadata
from app.dicom.metadata import InstanceMetadata
from tests.support.dicom_factory import write_mr_slice

DEFAULT_ORIENTATION = ["1.0", "0.0", "0.0", "0.0", "1.0", "0.0"]


def _slice(
    tmp_path: Path,
    *,
    name: str,
    uid: str,
    instance_number: int,
    image_position: tuple[float, float, float],
    image_orientation: list[str] | None = None,
    has_pixels: bool = True,
) -> InstanceMetadata:
    path = write_mr_slice(
        tmp_path / name,
        sop_instance_uid=uid,
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=instance_number,
        image_position=image_position,
        image_orientation=image_orientation or DEFAULT_ORIENTATION,
        has_pixels=has_pixels,
    )
    item = metadata.extract_metadata(path)
    assert item is not None
    return item


def test_slice_normal_is_unit_cross_product() -> None:
    assert geometry.slice_normal([1.0, 0.0, 0.0, 0.0, 1.0, 0.0]) == (0.0, 0.0, 1.0)
    assert geometry.slice_normal([1.0, 0.0, 0.0]) is None


def test_orders_by_position_not_instance_number(tmp_path: Path) -> None:
    instances = [
        _slice(tmp_path, name="c", uid="1.2.3.10", instance_number=3, image_position=(0, 0, 2)),
        _slice(tmp_path, name="a", uid="1.2.3.11", instance_number=1, image_position=(0, 0, 0)),
        _slice(tmp_path, name="b", uid="1.2.3.12", instance_number=2, image_position=(0, 0, 1)),
    ]

    result = geometry.analyze_geometry(instances)

    assert result.ordered_instance_uids == ("1.2.3.11", "1.2.3.12", "1.2.3.10")
    assert result.slice_spacing == 1.0
    assert result.irregular is False
    assert result.orientation_consistent is True


def test_projection_follows_normal_direction(tmp_path: Path) -> None:
    orientation = ["0.0", "1.0", "0.0", "1.0", "0.0", "0.0"]
    instances = [
        _slice(
            tmp_path,
            name="a",
            uid="1.2.3.20",
            instance_number=1,
            image_position=(0, 0, 0),
            image_orientation=orientation,
        ),
        _slice(
            tmp_path,
            name="b",
            uid="1.2.3.21",
            instance_number=2,
            image_position=(0, 0, 1),
            image_orientation=orientation,
        ),
        _slice(
            tmp_path,
            name="c",
            uid="1.2.3.22",
            instance_number=3,
            image_position=(0, 0, 2),
            image_orientation=orientation,
        ),
    ]

    result = geometry.analyze_geometry(instances)

    assert result.normal == (0.0, 0.0, -1.0)
    assert result.ordered_instance_uids == ("1.2.3.22", "1.2.3.21", "1.2.3.20")
    assert result.slice_spacing == 1.0


def test_detects_slice_gap(tmp_path: Path) -> None:
    positions = [0.0, 1.0, 2.0, 3.0, 6.0]
    instances = [
        _slice(
            tmp_path,
            name=f"s{i}",
            uid=f"1.2.3.{30 + i}",
            instance_number=i + 1,
            image_position=(0, 0, z),
        )
        for i, z in enumerate(positions)
    ]

    result = geometry.analyze_geometry(instances)

    assert result.gap_count == 1
    assert result.slice_spacing == 1.0
    assert result.irregular is True
    assert "slice_gap" in {issue.code for issue in result.issues}


def test_detects_duplicate_positions(tmp_path: Path) -> None:
    instances = [
        _slice(tmp_path, name="a", uid="1.2.3.40", instance_number=1, image_position=(0, 0, 0)),
        _slice(tmp_path, name="b", uid="1.2.3.41", instance_number=2, image_position=(0, 0, 0)),
        _slice(tmp_path, name="c", uid="1.2.3.42", instance_number=3, image_position=(0, 0, 1)),
    ]

    result = geometry.analyze_geometry(instances)

    assert result.duplicate_positions == (0.0,)
    assert result.irregular is True
    assert "duplicate_slice" in {issue.code for issue in result.issues}


def test_flags_flipped_orientation(tmp_path: Path) -> None:
    flipped = ["-1.0", "0.0", "0.0", "0.0", "1.0", "0.0"]
    instances = [
        _slice(tmp_path, name="a", uid="1.2.3.50", instance_number=1, image_position=(0, 0, 0)),
        _slice(
            tmp_path,
            name="b",
            uid="1.2.3.51",
            instance_number=2,
            image_position=(0, 0, 1),
            image_orientation=flipped,
        ),
    ]

    result = geometry.analyze_geometry(instances)

    assert result.orientation_consistent is False
    assert result.irregular is True
    assert "flipped_orientation" in {issue.code for issue in result.issues}


def test_missing_position_is_unplaced(tmp_path: Path) -> None:
    instances = [
        _slice(tmp_path, name="a", uid="1.2.3.60", instance_number=1, image_position=(0, 0, 0)),
        _slice(
            tmp_path,
            name="report",
            uid="1.2.3.61",
            instance_number=2,
            image_position=(0, 0, 1),
            has_pixels=False,
        ),
    ]

    result = geometry.analyze_geometry(instances)

    assert result.unplaced_instance_uids == ("1.2.3.61",)
    assert result.ordered_instance_uids == ("1.2.3.60",)
    assert "missing_position" in {issue.code for issue in result.issues}


def test_anisotropic_spacing_uses_normal_projection(tmp_path: Path) -> None:
    instances = [
        _slice(
            tmp_path,
            name=f"s{i}",
            uid=f"1.2.3.{70 + i}",
            instance_number=i + 1,
            image_position=(0, 0, z),
        )
        for i, z in enumerate([0.0, 2.0, 4.0])
    ]

    result = geometry.analyze_geometry(instances)

    assert result.slice_spacing == 2.0
    assert result.gap_count == 0
    assert result.irregular is False


def test_empty_series(tmp_path: Path) -> None:
    result = geometry.analyze_geometry([])

    assert result.ordered_instance_uids == ()
    assert result.normal is None
    assert result.irregular is True


def test_order_instances_returns_metadata(tmp_path: Path) -> None:
    instances = [
        _slice(tmp_path, name="b", uid="1.2.3.81", instance_number=2, image_position=(0, 0, 1)),
        _slice(tmp_path, name="a", uid="1.2.3.80", instance_number=1, image_position=(0, 0, 0)),
    ]

    ordered = geometry.order_instances(instances)

    assert [item.sop_instance_uid for item in ordered] == ["1.2.3.80", "1.2.3.81"]


def test_geometry_to_dict(tmp_path: Path) -> None:
    instances = [
        _slice(tmp_path, name="a", uid="1.2.3.90", instance_number=1, image_position=(0, 0, 0)),
        _slice(tmp_path, name="b", uid="1.2.3.91", instance_number=2, image_position=(0, 0, 1)),
    ]

    payload = geometry.geometry_to_dict(geometry.analyze_geometry(instances))

    assert payload["normal"] == [0.0, 0.0, 1.0]
    assert payload["slice_spacing"] == 1.0
    assert payload["ordered_instance_uids"] == ["1.2.3.90", "1.2.3.91"]
    assert payload["irregular"] is False
