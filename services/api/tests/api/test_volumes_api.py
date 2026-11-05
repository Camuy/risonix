"""Test degli endpoint dei volumi derivati e del download (P3-01)."""

from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

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


def _import_series(client: TestClient, source_path: str, *, volume_format: str = "nifti") -> None:
    response = client.post(
        "/api/studies/import",
        json={"source_path": source_path, "volume_format": volume_format},
    )
    assert response.status_code == 202
    job = _wait_for_job(client, response.json()["job_id"])
    assert job["status"] == "completed"
    assert job["payload"]["result"]["volumes"] == 1


def _series_id(client: TestClient) -> int:
    study = client.get("/api/studies").json()[0]
    return client.get(f"/api/studies/{study['id']}").json()["series"][0]["id"]


def test_list_and_filter_volumes(client: TestClient, dicom_series: Path) -> None:
    _import_series(client, str(dicom_series))
    series_id = _series_id(client)

    listed = client.get("/api/volumes")
    assert listed.status_code == 200
    volumes = listed.json()
    assert len(volumes) == 1
    assert volumes[0]["series_fk"] == series_id

    filtered = client.get("/api/volumes", params={"series_id": series_id}).json()
    assert [item["id"] for item in filtered] == [volumes[0]["id"]]
    assert client.get("/api/volumes", params={"series_id": 9999}).json() == []


def test_get_volume_detail_exposes_affine(client: TestClient, dicom_series: Path) -> None:
    _import_series(client, str(dicom_series))
    volume_id = client.get("/api/volumes").json()[0]["id"]

    detail = client.get(f"/api/volumes/{volume_id}").json()
    assert detail["shape"] == [8, 8, 3]
    assert len(detail["affine_lps"]) == 4
    assert all(len(row) == 4 for row in detail["affine_lps"])
    assert len(detail["spacing"]) == 3
    assert detail["dtype"] is not None


def test_download_nifti_volume(client: TestClient, dicom_series: Path) -> None:
    _import_series(client, str(dicom_series))
    volume = client.get("/api/volumes").json()[0]

    response = client.get(f"/api/volumes/{volume['id']}/download")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/gzip"
    assert response.content[:2] == b"\x1f\x8b"
    assert volume["checksum_sha256"] is not None


def test_download_nrrd_volume(client: TestClient, dicom_series: Path) -> None:
    _import_series(client, str(dicom_series), volume_format="nrrd")
    volume = client.get("/api/volumes").json()[0]
    assert volume["volume_format"] == "nrrd"

    response = client.get(f"/api/volumes/{volume['id']}/download")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.content.startswith(b"NRRD")


def test_unknown_volume_returns_404(client: TestClient) -> None:
    assert client.get("/api/volumes/9999").status_code == 404
    assert client.get("/api/volumes/9999/download").status_code == 404


def test_openapi_documents_volume_routes(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/volumes" in paths
    assert "/api/volumes/{volume_id}" in paths
    assert "/api/volumes/{volume_id}/download" in paths
