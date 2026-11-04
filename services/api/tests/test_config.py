"""Test della validazione della configurazione (fail-fast, P0-10)."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_defaults_are_safe() -> None:
    settings = Settings()
    assert settings.log_format == "json"
    assert settings.log_level == "info"


def test_log_level_is_normalized_to_lowercase() -> None:
    assert Settings(log_level="DEBUG").log_level == "debug"


def test_invalid_log_level_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(log_level="verbose")


def test_invalid_log_format_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings.model_validate({"log_format": "xml"})
