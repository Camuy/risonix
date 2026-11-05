"""Test della de-identificazione DICOM (P1-08)."""

from __future__ import annotations

from pathlib import Path

import pydicom

from app.dicom.deident import (
    DeidPolicy,
    deidentify_dataset,
    deidentify_file,
    pseudonymize,
)
from tests.support.dicom_factory import write_mr_slice

_PHI = {
    "PatientName": "Doe^John",
    "PatientID": "12345",
    "PatientBirthDate": "19800101",
    "InstitutionName": "Ospedale Test",
    "AccessionNumber": "ACC-1",
}


def _write_phi_slice(path: Path) -> Path:
    return write_mr_slice(path, extra=dict(_PHI))


def test_deidentify_dataset_removes_phi(tmp_path: Path) -> None:
    source = _write_phi_slice(tmp_path / "study" / "slice.dcm")
    dataset = pydicom.dcmread(source)

    cleaned = deidentify_dataset(dataset)

    assert cleaned.PatientName == "ANONYMOUS"
    assert cleaned.PatientID == "ANONYMOUS"
    assert not hasattr(cleaned, "PatientBirthDate")
    assert not hasattr(cleaned, "InstitutionName")
    assert not hasattr(cleaned, "AccessionNumber")
    assert cleaned.PatientIdentityRemoved == "YES"
    assert "DeidentificationMethod" in cleaned

    assert dataset.PatientName == "Doe^John"
    assert dataset.PatientID == "12345"


def test_deidentify_file_leaves_original_intact(tmp_path: Path) -> None:
    source = _write_phi_slice(tmp_path / "incoming" / "slice.dcm")
    destination = tmp_path / "derived" / "deidentified" / "slice.dcm"

    returned = deidentify_file(source, destination)

    assert returned == destination
    assert destination.exists()
    anonymous = pydicom.dcmread(destination)
    assert anonymous.PatientName == "ANONYMOUS"
    original = pydicom.dcmread(source)
    assert original.PatientName == "Doe^John"
    assert original.PatientID == "12345"


def test_remap_uids_is_deterministic(tmp_path: Path) -> None:
    source = _write_phi_slice(tmp_path / "slice.dcm")
    dataset = pydicom.dcmread(source)
    policy = DeidPolicy(salt="fixed", remap_uids=True)

    first = deidentify_dataset(dataset, policy)
    second = deidentify_dataset(dataset, policy)

    assert first.StudyInstanceUID != dataset.StudyInstanceUID
    assert first.StudyInstanceUID == second.StudyInstanceUID
    assert first.SOPInstanceUID == first.file_meta.MediaStorageSOPInstanceUID


def test_pseudonymize_is_stable_and_salted() -> None:
    assert pseudonymize("abc", salt="s1") == pseudonymize("abc", salt="s1")
    assert pseudonymize("abc", salt="s1") != pseudonymize("abc", salt="s2")
