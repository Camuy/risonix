"""Test del raggruppamento Study/Series e della classificazione (P1-02)."""

from __future__ import annotations

from pathlib import Path

from pydicom.uid import BasicTextSRStorage, GrayscaleSoftcopyPresentationStateStorage

from app.dicom import scanner, study
from tests.support.dicom_factory import write_mr_slice


def _write_series(
    root: Path,
    *,
    study_uid: str,
    series_uid: str,
    count: int,
    series_number: int = 1,
    modality: str = "MR",
) -> None:
    for index in range(count):
        write_mr_slice(
            root / f"{series_uid.replace('.', '_')}_{index}",
            study_uid=study_uid,
            series_uid=series_uid,
            series_number=series_number,
            modality=modality,
            instance_number=index + 1,
            image_position=(0.0, 0.0, float(index)),
        )


def test_groups_multiple_studies_and_series(tmp_path: Path) -> None:
    _write_series(tmp_path, study_uid="1.1", series_uid="1.1.1", count=3, series_number=1)
    _write_series(tmp_path, study_uid="1.1", series_uid="1.1.2", count=2, series_number=2)
    _write_series(tmp_path, study_uid="1.2", series_uid="1.2.1", count=4, series_number=1)

    report = scanner.scan_directory(tmp_path)
    grouped = study.group_scan(report)

    assert len(grouped.studies) == 2
    by_uid = {s.study_instance_uid: s for s in grouped.studies}
    assert len(by_uid["1.1"].series) == 2
    assert len(by_uid["1.2"].series) == 1
    assert [s.series_instance_uid for s in by_uid["1.1"].series] == ["1.1.1", "1.1.2"]


def test_instances_are_ordered_by_instance_number(tmp_path: Path) -> None:
    series_dir = tmp_path
    write_mr_slice(
        series_dir / "c",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=3,
        image_position=(0.0, 0.0, 2.0),
    )
    write_mr_slice(
        series_dir / "a",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=1,
        image_position=(0.0, 0.0, 0.0),
    )
    write_mr_slice(
        series_dir / "b",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=2,
        image_position=(0.0, 0.0, 1.0),
    )

    grouped = study.group_scan(scanner.scan_directory(tmp_path))

    numbers = [i.instance_number for i in grouped.studies[0].series[0].instances]
    assert numbers == [1, 2, 3]


def test_non_imaging_series_are_not_images(tmp_path: Path) -> None:
    _write_series(tmp_path, study_uid="1.1", series_uid="1.1.1", count=2, series_number=1)
    write_mr_slice(
        tmp_path / "report",
        study_uid="1.1",
        series_uid="1.1.2",
        series_number=2,
        modality="SR",
        sop_class_uid=BasicTextSRStorage,
        has_pixels=False,
    )
    write_mr_slice(
        tmp_path / "prstate",
        study_uid="1.1",
        series_uid="1.1.3",
        series_number=3,
        modality="PR",
        sop_class_uid=GrayscaleSoftcopyPresentationStateStorage,
        has_pixels=False,
    )

    grouped = study.group_scan(scanner.scan_directory(tmp_path))
    series = {s.series_instance_uid: s for s in grouped.studies[0].series}

    assert series["1.1.1"].kind == "image"
    assert series["1.1.2"].kind == "report"
    assert series["1.1.3"].kind == "support"
    assert len(grouped.studies[0].image_series) == 1


def test_duplicates_are_reported_and_not_counted_twice(tmp_path: Path) -> None:
    duplicate_uid = "1.2.3.4.5"
    write_mr_slice(
        tmp_path / "first",
        study_uid="1.1",
        series_uid="1.1.1",
        sop_instance_uid=duplicate_uid,
        instance_number=1,
    )
    write_mr_slice(
        tmp_path / "copy",
        study_uid="1.1",
        series_uid="1.1.1",
        sop_instance_uid=duplicate_uid,
        instance_number=1,
    )
    write_mr_slice(
        tmp_path / "other",
        study_uid="1.1",
        series_uid="1.1.1",
        instance_number=2,
    )

    grouped = study.group_scan(scanner.scan_directory(tmp_path))
    study_group = grouped.studies[0]

    assert len(study_group.duplicates) == 1
    duplicate = study_group.duplicates[0]
    assert duplicate.sop_instance_uid == duplicate_uid
    assert len(duplicate.paths) == 2
    assert duplicate.kept in duplicate.paths
    # Il duplicato non incrementa il numero di istanze della serie.
    assert study_group.series[0].instance_count == 2


def test_unreadable_file_is_collected(tmp_path: Path) -> None:
    report = scanner.ScanReport(root=str(tmp_path), kind="directory")
    report.dicom_files = [
        scanner.DICOMFile(
            path=str(tmp_path / "missing.dcm"),
            sop_instance_uid="1.2.3",
            sop_class_uid=None,
            source="recursive",
        )
    ]

    grouped = study.group_scan(report)

    assert not grouped.studies
    assert len(grouped.unreadable) == 1


def test_group_report_to_dict_summarizes(tmp_path: Path) -> None:
    _write_series(tmp_path, study_uid="1.1", series_uid="1.1.1", count=2, series_number=1)
    write_mr_slice(
        tmp_path / "support",
        study_uid="1.1",
        series_uid="1.1.2",
        series_number=2,
        modality="PR",
        sop_class_uid=GrayscaleSoftcopyPresentationStateStorage,
        has_pixels=False,
    )

    payload = study.group_report_to_dict(study.group_scan(scanner.scan_directory(tmp_path)))

    assert payload["study_count"] == 1
    assert payload["series_count"] == 2
    assert payload["image_series_count"] == 1
    assert payload["duplicate_count"] == 0
    assert payload["studies"][0]["series"][0]["kind"] == "image"
