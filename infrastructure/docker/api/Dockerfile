# syntax=docker/dockerfile:1
#
# Risonix backend — FastAPI + Uvicorn su Python 3.12 (slim-bookworm).
# Target: `runtime` (default) e `test`. Build per linux/arm64. Versioni pinnate (P0-02).

ARG PYTHON_IMAGE=python:3.12.16-slim-bookworm

# ---------------------------------------------------------------------------
# base — dipendenze runtime + codice applicativo
# ---------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# ---------------------------------------------------------------------------
# test — dipendenze di sviluppo + suite pytest (usato in CI / verifica locale)
# ---------------------------------------------------------------------------
FROM base AS test
USER root
COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY tests ./tests
COPY pyproject.toml ./
USER appuser
RUN python -m pytest

# ---------------------------------------------------------------------------
# runtime — immagine di esecuzione (default)
# ---------------------------------------------------------------------------
FROM base AS runtime
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
