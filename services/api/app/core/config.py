"""Configurazione applicativa basata su variabili d'ambiente."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_LOG_LEVELS = {"critical", "error", "warning", "info", "debug"}


class Settings(BaseSettings):
    """Impostazioni del servizio, sovrascrivibili con prefisso ``MRI_``.

    La validazione avviene all'avvio (fail-fast): valori non ammessi impediscono
    l'avvio del servizio con un errore esplicito.
    """

    model_config = SettingsConfigDict(env_prefix="MRI_", env_file=".env", extra="ignore")

    service_name: str = "mri-api"
    version: str = "0.1.0"
    env: str = "development"
    data_dir: str = "/data"
    db_path: str = "/data/database/mri.sqlite3"
    log_level: str = "info"
    log_format: Literal["json", "text"] = "json"
    deidentify: bool = False
    deidentify_salt: str = "risonix"
    deidentify_remap_uids: bool = False

    #: Origin di sviluppo ammessi dal browser (in prod il frontend è same-origin
    #: via Nginx e la lista può restare vuota). Vedi ``docs/CONFIGURATION.md``.
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, value: str) -> str:
        level = value.lower()
        if level not in _LOG_LEVELS:
            raise ValueError(f"log_level non valido: {value!r} (attesi: {sorted(_LOG_LEVELS)})")
        return level


@lru_cache
def get_settings() -> Settings:
    """Restituisce le impostazioni (singola istanza per processo)."""
    return Settings()
