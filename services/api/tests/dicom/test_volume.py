"""Test del volume builder NIfTI/NRRD (P1-05)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import nibabel as nib
import nrrd
import numpy as np
import pytest

from app.dicom import volume
from tests.support.dicom_factory import write_mr_slice

DEFAULT_ORIENTATION = ["1.0", "0.0", "0.0", "0.0", "1.0", "0.0"]


def _slice(
    tmp_path: Path,
    *,
    uid: str,
    instance_number: int,
    z: float,
    value: int,
    rows: int = 4,
    cols: int = 4,
    image_position: tuple[float, float, float] | None = None,
    rescale: tuple[float, float] | None = None,
) -> Path:
    extra = None
    if rescale is not None:
        extra = {"RescaleSlope": str(rescale[0]), "RescaleIntercept": str(rescale[1])}
    return write_mr_slice(
        tmp_path / uid,
        sop_instance_uid=uid,
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=instance_number,
        rows=rows,
        cols=cols,
        image_position=image_position if image_position is not None else (0.0, 0.0, z),
        image_orientation=DEFAULT_ORIENTATION,
        pixel_bytes=int(value).to_bytes(2, "little") * rows * cols,
        extra=extra,
    )


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_build_nifti_preserves_slice_order(tmp_path: Path) -> None:
    sources = [
        _slice(tmp_path, uid="1.2.3.1", instance_number=1, z=0.0, value=10),
        _slice(tmp_path, uid="1.2.3.3", instance_number=3, z=2.0, value=20),
        _slice(tmp_path, uid="1.2.3.2", instance_number=2, z=1.0, value=30),
    ]

    result = volume.build_volume(sources, tmp_path / "out" / "series.nii.gz")

    assert result.slice_index_map == ("1.2.3.1", "1.2.3.2", "1.2.3.3")
    image = nib.load(str(result.path))
    data = np.asanyarray(image.dataobj)  # type: ignore[attr-defined]
    assert data.shape == (4, 4, 3)
    assert data.dtype == np.uint16
    assert np.all(data[:, :, 0] == 10)
    assert np.all(data[:, :, 1] == 30)
    assert np.all(data[:, :, 2] == 20)


def test_lps_affine_maps_voxels_to_patient_space(tmp_path: Path) -> None:
    sources = [
        _slice(
            tmp_path,
            uid="1.2.3.10",
            instance_number=1,
            z=0.0,
            value=1,
            image_position=(10.0, 20.0, 30.0),
        ),
        _slice(
            tmp_path,
            uid="1.2.3.11",
            instance_number=2,
            z=2.0,
            value=1,
            image_position=(10.0, 20.0, 32.0),
        ),
    ]

    result = volume.build_volume(sources, tmp_path / "out" / "series.nii.gz")

    affine_lps = np.asarray(result.affine_lps)
    assert result.origin == (10.0, 20.0, 30.0)
    assert result.normal == (0.0, 0.0, 1.0)
    assert list(affine_lps @ np.array([0, 0, 1, 1]))[:3] == pytest.approx([10.0, 20.0, 32.0])
    assert list(affine_lps @ np.array([1, 0, 0, 1]))[:3] == pytest.approx([10.0, 21.0, 30.0])

    affine_file = np.asarray(result.affine_file)
    assert list(affine_file @ np.array([0, 0, 0, 1]))[:3] == pytest.approx([-10.0, -20.0, 30.0])


def test_rescale_is_applied(tmp_path: Path) -> None:
    sources = [
        _slice(tmp_path, uid="1.2.3.20", instance_number=1, z=0.0, value=10, rescale=(2.0, -100.0)),
        _slice(tmp_path, uid="1.2.3.21", instance_number=2, z=1.0, value=10, rescale=(2.0, -100.0)),
    ]

    result = volume.build_volume(sources, tmp_path / "out" / "series.nii.gz")

    assert result.applied_rescale is True
    assert result.dtype == "float32"
    data = np.asanyarray(nib.load(str(result.path)).dataobj)  # type: ignore[attr-defined]
    assert np.allclose(data, -80.0)


def test_original_dicom_files_are_not_modified(tmp_path: Path) -> None:
    sources = [
        _slice(tmp_path, uid="1.2.3.30", instance_number=1, z=0.0, value=1),
        _slice(tmp_path, uid="1.2.3.31", instance_number=2, z=1.0, value=2),
    ]
    before = {path: _sha256(path) for path in sources}

    volume.build_volume(sources, tmp_path / "out" / "series.nii.gz")

    assert {path: _sha256(path) for path in sources} == before


def test_irregular_series_is_refused_unless_forced(tmp_path: Path) -> None:
    sources = [
        _slice(tmp_path, uid=f"1.2.3.{40 + i}", instance_number=i + 1, z=z, value=i)
        for i, z in enumerate([0.0, 1.0, 2.0, 5.0])
    ]

    with pytest.raises(volume.VolumeBuildError):
        volume.build_volume(sources, tmp_path / "out" / "series.nii.gz")

    result = volume.build_volume(sources, tmp_path / "out" / "series.nii.gz", allow_irregular=True)
    assert result.irregular is True
    assert result.shape == (4, 4, 4)


def test_nrrd_round_trip(tmp_path: Path) -> None:
    sources = [
        _slice(
            tmp_path,
            uid="1.2.3.50",
            instance_number=1,
            z=0.0,
            value=5,
            image_position=(1.0, 2.0, 3.0),
        ),
        _slice(
            tmp_path,
            uid="1.2.3.51",
            instance_number=2,
            z=1.0,
            value=6,
            image_position=(1.0, 2.0, 4.0),
        ),
    ]

    result = volume.build_volume(sources, tmp_path / "out" / "series.nrrd")

    assert result.format == "nrrd"
    data, header = nrrd.read(str(result.path))
    assert data.shape == (4, 4, 2)
    assert list(header["space origin"]) == pytest.approx([1.0, 2.0, 3.0])
    directions = np.asarray(header["space directions"])
    assert directions[2] == pytest.approx([0.0, 0.0, 1.0])


def test_provenance_is_written_with_checksum(tmp_path: Path) -> None:
    sources = [
        _slice(tmp_path, uid="1.2.3.60", instance_number=1, z=0.0, value=1),
        _slice(tmp_path, uid="1.2.3.61", instance_number=2, z=1.0, value=2),
    ]

    result = volume.build_volume(sources, tmp_path / "out" / "series.nii.gz")

    provenance = json.loads(result.provenance_path.read_text(encoding="utf-8"))
    assert provenance["checksum_sha256"] == result.checksum_sha256 == _sha256(result.path)
    assert provenance["ordered_sop_instance_uids"] == ["1.2.3.60", "1.2.3.61"]
    assert provenance["format"] == "nifti"


def test_format_inference_and_default_path(tmp_path: Path) -> None:
    assert volume.infer_format("a/b/series.nrrd") == "nrrd"
    assert volume.infer_format("a/b/series.nii.gz") == "nifti"
    with pytest.raises(volume.VolumeBuildError):
        volume.infer_format("a/b/series.dcm")

    path = volume.default_volume_path(tmp_path, "1.2/3 4", "nifti")
    assert path == tmp_path / "processed" / "1.2_3_4.nii.gz"


def test_missing_geometry_is_refused(tmp_path: Path) -> None:
    source = write_mr_slice(
        tmp_path / "no-pixels",
        sop_instance_uid="1.2.3.70",
        study_uid="1.1",
        series_uid="1.1.1",
        has_pixels=False,
    )

    with pytest.raises(volume.VolumeBuildError):
        volume.build_volume([source], tmp_path / "out" / "series.nii.gz")
