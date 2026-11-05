"""Test end-to-end dell'import di un phantom a 9 serie (P1-09)."""

from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from tests.support.dicom_factory import KNEE_PROTOCOL, generate_phantom

_TERMINAL = {"completed", "failed", "cancelled"}


def _wait_for_job(client: TestClient, job_id: int, *, timeout: float = 30.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in _TERMINAL:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} non terminato entro {timeout}s")


def test_e2e_import_of_nine_series_phantom(client: TestClient, data_dir: Path) -> None:
    phantom = generate_phantom(data_dir / "incoming" / "phantom")

    accepted = client.post(
        "/api/studies/import",
        json={"source_path": "incoming/phantom", "volume_format": "nifti"},
    )
    assert accepted.status_code == 202

    job = _wait_for_job(client, accepted.json()["job_id"])
    assert job["status"] == "completed"

    result = job["payload"]["result"]
    assert result["studies"] == 1
    assert result["series"] == 9
    assert result["volumes"] == 9
    assert result["instances"] == phantom.instance_count

    summaries = client.get("/api/studies").json()
    assert len(summaries) == 1 and summaries[0]["series_count"] == 9

    detail = client.get(f"/api/studies/{summaries[0]['id']}").json()
    series_list = detail["series"]
    assert len(series_list) == 9
    assert {item["description"] for item in series_list} == {
        plan.description for plan in KNEE_PROTOCOL
    }

    for series in series_list:
        instances = client.get(f"/api/series/{series['id']}/instances").json()
        assert [item["slice_index"] for item in instances] == list(range(series["instance_count"]))

        volumes = client.get(f"/api/series/{series['id']}/volumes").json()
        assert len(volumes) == 1
        assert Path(volumes[0]["path"]).exists()
        assert volumes[0]["shape"][2] == series["instance_count"]
