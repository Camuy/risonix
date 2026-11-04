# syntax=docker/dockerfile:1
#
# Risonix backend — FastAPI + Uvicorn su Python 3.12 (slim-bookworm).
# Target: `runtime` (default), `dev` (tooling) e `test`. Build per linux/arm64.
# Versioni pinnate (P0-02).

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
# dev — tooling di sviluppo (lint/format/typecheck/test), usato da Makefile/CI
# ---------------------------------------------------------------------------
FROM base AS dev

USER root
COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY pyproject.toml ./
COPY tests ./tests
RUN chown -R appuser:appuser /app
USER appuser

# ---------------------------------------------------------------------------
# test — esegue la suite pytest in fase di build
# ---------------------------------------------------------------------------
FROM dev AS test
RUN python -m pytest

# ---------------------------------------------------------------------------
# runtime — immagine di esecuzione (default)
# ---------------------------------------------------------------------------
FROM base AS runtime
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
