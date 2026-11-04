"""Configurazione del servizio AI (variabili d'ambiente con prefisso ``MRI_``)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Impostazioni del servizio AI."""

    model_config = SettingsConfigDict(env_prefix="MRI_", env_file=".env", extra="ignore")

    service_name: str = "mri-ai"
    version: str = "0.1.0"
    env: str = "development"
    data_dir: str = "/data"
    models_dir: str = "/data/models"
    log_level: str = "info"
    log_format: str = "json"


@lru_cache
def get_settings() -> Settings:
    """Restituisce le impostazioni (singola istanza per processo)."""
    return Settings()
