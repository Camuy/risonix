"""Test della validazione della configurazione (fail-fast, P0-10)."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_defaults_are_safe() -> None:
    settings = Settings()
    assert settings.log_format == "json"
    assert settings.log_level == "info"
    assert settings.models_dir == "/data/models"


def test_log_level_is_normalized_to_lowercase() -> None:
    assert Settings(log_level="WARNING").log_level == "warning"


def test_invalid_log_level_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(log_level="loud")


def test_invalid_log_format_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings.model_validate({"log_format": "xml"})
