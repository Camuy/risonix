"""Validazione del phantom sintetico a geometria nota (P1-09)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.dicom import geometry, metadata, scanner, study, volume
from tests.support.dicom_factory import KNEE_PROTOCOL, generate_phantom


def _instances(directory: Path) -> list[metadata.InstanceMetadata]:
    items = [metadata.extract_metadata(path) for path in sorted(directory.glob("*.dcm"))]
    return [item for item in items if item is not None]


def test_phantom_groups_into_nine_image_series(tmp_path: Path) -> None:
    phantom = generate_phantom(tmp_path / "phantom")

    grouped = study.group_scan(scanner.scan_path(phantom.root))

    assert len(grouped.studies) == 1
    found = grouped.studies[0]
    assert found.study_instance_uid == phantom.study_instance_uid
    assert len(found.series) == len(KNEE_PROTOCOL) == 9
    assert all(series.is_image for series in found.series)
    assert sum(series.instance_count for series in found.series) == phantom.instance_count
    assert {series.series_number for series in found.series} == {
        plan.series_number for plan in KNEE_PROTOCOL
    }
    assert {series.series_description for series in found.series} == {
        plan.description for plan in KNEE_PROTOCOL
    }


def test_phantom_geometry_matches_expected(tmp_path: Path) -> None:
    phantom = generate_phantom(tmp_path / "phantom")

    for expected in phantom.series:
        instances = _instances(expected.directory)
        assert len(instances) == expected.slice_count

        analyzed = geometry.analyze_geometry(instances)

        assert analyzed.irregular is False
        assert analyzed.orientation_consistent is True
        assert len(analyzed.ordered_instance_uids) == expected.slice_count
        assert analyzed.slice_spacing == pytest.approx(expected.slice_spacing)
        assert analyzed.normal == pytest.approx(expected.normal)


def test_phantom_volumes_preserve_geometry(tmp_path: Path) -> None:
    phantom = generate_phantom(tmp_path / "phantom")
    output_dir = tmp_path / "volumes"

    for expected in phantom.series:
        sources = sorted(expected.directory.glob("*.dcm"))
        built = volume.build_volume(sources, output_dir / f"series_{expected.series_number}.nii.gz")

        assert built.shape == (expected.rows, expected.cols, expected.slice_count)
        assert built.spacing == pytest.approx(
            (expected.row_spacing, expected.column_spacing, expected.slice_spacing)
        )
        assert built.normal == pytest.approx(expected.normal)
        assert built.irregular is False
        assert built.path.exists() and built.provenance_path.exists()
