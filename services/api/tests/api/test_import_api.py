"""Test end-to-end degli endpoint di import e consultazione (P1-07)."""

from __future__ import annotations

import time
from pathlib import Path

import pydicom
from fastapi.testclient import TestClient
from pydicom.uid import generate_uid

from tests.support.dicom_factory import write_mr_slice

_TERMINAL = {"completed", "failed", "cancelled"}


def _wait_for_job(client: TestClient, job_id: int, *, timeout: float = 15.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        body = response.json()
        if body["status"] in _TERMINAL:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} non terminato entro {timeout}s")


def _start_import(client: TestClient, source_path: str) -> dict:
    response = client.post(
        "/api/studies/import",
        json={"source_path": source_path, "volume_format": "nifti"},
    )
    assert response.status_code == 202
    return response.json()


def test_import_and_inspect_flow(client: TestClient, dicom_series: Path) -> None:
    accepted = _start_import(client, str(dicom_series))
    assert accepted["status"] == "queued"

    job = _wait_for_job(client, accepted["job_id"])
    assert job["status"] == "completed"
    assert job["payload"]["result"]["instances"] == 3
    assert job["payload"]["result"]["volumes"] == 1

    studies = client.get("/api/studies").json()
    assert len(studies) == 1
    study = studies[0]
    assert study["series_count"] == 1

    detail = client.get(f"/api/studies/{study['id']}").json()
    assert len(detail["series"]) == 1
    series = detail["series"][0]
    assert series["instance_count"] == 3
    assert series["modality"] == "MR"

    instances = client.get(f"/api/series/{series['id']}/instances").json()
    assert [item["slice_index"] for item in instances] == [0, 1, 2]

    volumes = client.get(f"/api/series/{series['id']}/volumes").json()
    assert len(volumes) == 1
    assert Path(volumes[0]["path"]).exists()
    assert volumes[0]["shape"][2] == 3

    metadata = client.get(f"/api/instances/{instances[0]['id']}/metadata").json()
    assert metadata["series_instance_uid"] == series["series_instance_uid"]
    assert metadata["rows"] == 8 and metadata["columns"] == 8


def test_import_accepts_relative_path(client: TestClient, dicom_series: Path) -> None:
    accepted = _start_import(client, "incoming/serie_a")
    job = _wait_for_job(client, accepted["job_id"])
    assert job["status"] == "completed"


def test_import_rejects_path_outside_data_dir(client: TestClient, tmp_path: Path) -> None:
    response = client.post("/api/studies/import", json={"source_path": str(tmp_path)})
    assert response.status_code == 400


def test_import_rejects_missing_path(client: TestClient) -> None:
    response = client.post("/api/studies/import", json={"source_path": "incoming/assente"})
    assert response.status_code == 400


def test_unknown_study_returns_404(client: TestClient) -> None:
    assert client.get("/api/studies/9999").status_code == 404


def test_unknown_instance_metadata_returns_404(client: TestClient) -> None:
    assert client.get("/api/instances/9999/metadata").status_code == 404


def test_delete_study_cascades(client: TestClient, dicom_series: Path) -> None:
    accepted = _start_import(client, str(dicom_series))
    _wait_for_job(client, accepted["job_id"])
    study = client.get("/api/studies").json()[0]

    assert client.delete(f"/api/studies/{study['id']}").status_code == 204
    assert client.get(f"/api/studies/{study['id']}").status_code == 404
    assert client.get("/api/studies").json() == []


def test_jobs_can_be_filtered_by_status(client: TestClient, dicom_series: Path) -> None:
    accepted = _start_import(client, str(dicom_series))
    _wait_for_job(client, accepted["job_id"])

    completed = client.get("/api/jobs", params={"status": "completed"}).json()
    assert [job["id"] for job in completed] == [accepted["job_id"]]
    assert client.get("/api/jobs", params={"status": "failed"}).json() == []


def test_openapi_documents_import_route(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/studies/import" in paths
    assert "/api/jobs/{job_id}" in paths


def test_instance_file_returns_original_dicom(client: TestClient, dicom_series: Path) -> None:
    accepted = _start_import(client, str(dicom_series))
    _wait_for_job(client, accepted["job_id"])
    study = client.get("/api/studies").json()[0]
    series = client.get(f"/api/studies/{study['id']}").json()["series"][0]
    instance = client.get(f"/api/series/{series['id']}/instances").json()[0]

    response = client.get(f"/api/instances/{instance['id']}/file")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/dicom"
    assert response.content[128:132] == b"DICM"


def test_unknown_instance_file_returns_404(client: TestClient) -> None:
    assert client.get("/api/instances/9999/file").status_code == 404


def test_cors_allows_dev_origin(client: TestClient) -> None:
    response = client.options(
        "/api/version",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_import_with_deidentification(client: TestClient, data_dir: Path) -> None:
    study_uid = generate_uid()
    series_uid = generate_uid()
    source = data_dir / "incoming" / "phi"
    for index in range(2):
        write_mr_slice(
            source / f"slice_{index}.dcm",
            study_uid=study_uid,
            series_uid=series_uid,
            instance_number=index + 1,
            image_position=(0.0, 0.0, float(index) * 2.0),
            extra={"PatientName": "Doe^John", "PatientID": "999"},
        )

    response = client.post(
        "/api/studies/import",
        json={"source_path": "incoming/phi", "deidentify": True},
    )
    assert response.status_code == 202
    job = _wait_for_job(client, response.json()["job_id"])

    assert job["status"] == "completed"
    assert job["payload"]["result"]["deidentified"] == 2
    derived = data_dir / "derived" / "deidentified"
    copies = sorted(derived.rglob("*.dcm"))
    assert len(copies) == 2
    assert pydicom.dcmread(copies[0]).PatientName == "ANONYMOUS"
    assert pydicom.dcmread(source / "slice_0.dcm").PatientName == "Doe^John"
