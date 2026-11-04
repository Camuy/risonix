"""Test smoke degli endpoint di base."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version_endpoint() -> None:
    response = client.get("/api/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "mri-api"
    assert body["version"] == "0.1.0"
    assert "env" in body


def test_openapi_available() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Risonix MRI API"
