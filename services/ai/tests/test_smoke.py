"""Test smoke del servizio AI (senza runtime ML: torch/monai non sono importati)."""

from fastapi.testclient import TestClient

from app.main import app
from app.monitoring.memory import current_memory_mb

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["memory_mb"] > 0


def test_version_endpoint() -> None:
    response = client.get("/api/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "mri-ai"
    assert body["version"] == "0.1.0"
    assert "env" in body


def test_models_registry_lists_without_loading() -> None:
    response = client.get("/api/models")
    assert response.status_code == 200
    models = response.json()
    assert any(item["name"] == "segmentation" for item in models)
    assert all(item["loaded"] is False for item in models)


def test_memory_monitor_returns_positive() -> None:
    assert current_memory_mb() > 0


def test_openapi_available() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Risonix AI API"
