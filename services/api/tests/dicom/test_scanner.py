"""Test dello scanner DICOM e del parsing DICOMDIR (P1-01)."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest
from pydicom.uid import ImplicitVRLittleEndian

from app.dicom import scanner
from tests.support.dicom_factory import write_dicomdir, write_mr_slice, write_plain_text


def _slices(root: Path, series_uid: str, count: int, *, extension: str = "") -> list[Path]:
    paths = []
    for index in range(count):
        target = root / f"SLICE{index}{extension}"
        write_mr_slice(
            target,
            series_uid=series_uid,
            instance_number=index + 1,
            image_position=(0.0, 0.0, float(index)),
        )
        paths.append(target)
    return paths


def test_scan_directory_finds_all_slices(tmp_path: Path) -> None:
    _slices(tmp_path, "1.2.3", 5, extension=".dcm")
    report = scanner.scan_directory(tmp_path)
    assert len(report.dicom_files) == 5
    assert not report.errors
    assert report.dicomdir_path is None


def test_files_without_extension_are_found(tmp_path: Path) -> None:
    _slices(tmp_path / "nested", "1.2.3", 3)
    report = scanner.scan_directory(tmp_path)
    assert len(report.dicom_files) == 3
    assert all(Path(f.path).suffix == "" for f in report.dicom_files)


def test_non_dicom_files_are_skipped(tmp_path: Path) -> None:
    _slices(tmp_path, "1.2.3", 2)
    write_plain_text(tmp_path / "notes.txt")
    write_plain_text(tmp_path / "README")
    report = scanner.scan_directory(tmp_path)
    assert len(report.dicom_files) == 2
    assert len(report.non_dicom) == 2
    assert not report.errors


def test_dicomdir_and_recursive_agree(tmp_path: Path) -> None:
    paths = _slices(tmp_path / "SERIES1", "1.2.3", 4)
    relative = [["SERIES1", p.name] for p in paths]
    write_dicomdir(tmp_path, relative)

    report = scanner.scan_directory(tmp_path)

    assert len(report.dicomdir_files) == 4
    assert len(report.recursive_files) == 4
    assert report.dicomdir_matches_recursive is True
    assert report.dicomdir_path is not None
    assert len(report.dicom_files) == 4


def test_scan_path_follows_dicomdir_file(tmp_path: Path) -> None:
    """Un percorso al solo file ``DICOMDIR`` segue i record e trova le slice."""
    paths = _slices(tmp_path / "SERIES1", "1.2.3", 4)
    relative = [["SERIES1", p.name] for p in paths]
    write_dicomdir(tmp_path, relative)

    report = scanner.scan_path(tmp_path / "DICOMDIR")

    assert report.kind == "dicomdir"
    assert len(report.dicomdir_files) == 4
    assert len(report.recursive_files) == 4
    assert len(report.dicom_files) == 4
    assert report.dicomdir_matches_recursive is True
    assert report.dicomdir_path is not None


def test_dicomdir_missing_file_is_reported(tmp_path: Path) -> None:
    _slices(tmp_path / "SERIES1", "1.2.3", 2)
    write_dicomdir(tmp_path, [["SERIES1", "SLICE0"], ["SERIES1", "MISSING"]])

    report = scanner.scan_directory(tmp_path)

    assert len(report.dicomdir_files) == 1
    assert any("assente" in error.message for error in report.errors)
    # La scansione di fallback resta completa.
    assert len(report.recursive_files) == 2


def test_scan_zip_extracts_and_finds(tmp_path: Path) -> None:
    source = tmp_path / "src"
    _slices(source, "1.2.3", 3)
    archive = tmp_path / "study.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        for item in source.iterdir():
            bundle.write(item, arcname=item.name)

    report = scanner.scan_zip(archive, tmp_path / "staging")

    assert report.kind == "archive"
    assert len(report.dicom_files) == 3
    assert all(f.source == "zip" for f in report.dicom_files)


def test_scan_zip_rejects_path_traversal(tmp_path: Path) -> None:
    archive = tmp_path / "evil.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("../escaped.dcm", b"data")

    with pytest.raises(ValueError):
        scanner.scan_zip(archive, tmp_path / "staging")


def test_instance_without_preamble_is_detected(tmp_path: Path) -> None:
    target = tmp_path / "raw_instance"
    write_mr_slice(
        target,
        series_uid="1.2.3",
        instance_number=1,
        transfer_syntax=ImplicitVRLittleEndian,
    )
    raw = target.read_bytes()
    # Rimuove preambolo (128) + magic "DICM" (4): dataset implicito VR grezzo.
    target.write_bytes(raw[132:])

    report = scanner.scan_directory(tmp_path)

    assert len(report.dicom_files) == 1


def test_report_to_dict_serializes(tmp_path: Path) -> None:
    _slices(tmp_path, "1.2.3", 1)
    payload = scanner.report_to_dict(scanner.scan_directory(tmp_path))
    assert payload["counts"]["dicom"] == 1
    assert payload["kind"] == "directory"
