# syntax=docker/dockerfile:1
#
# Risonix AI — FastAPI + PyTorch/MONAI CPU su Python 3.12 (slim-bookworm).
# Target: `runtime` (default), `dev` (tooling) e `test`. Build per linux/arm64.
# Versioni pinnate (P0-02). Nessun peso di modello incluso o scaricato all'avvio.

ARG PYTHON_IMAGE=python:3.12.16-slim-bookworm

# ---------------------------------------------------------------------------
# base — dipendenze runtime leggere + codice applicativo
# ---------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=4

WORKDIR /app

COPY requirements.txt requirements-ml.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8001

# ---------------------------------------------------------------------------
# dev — tooling di sviluppo (senza runtime ML: più veloce), usato da Makefile/CI
# ---------------------------------------------------------------------------
FROM base AS dev

USER root
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
# runtime — immagine di esecuzione (default) con PyTorch + MONAI (CPU)
# ---------------------------------------------------------------------------
FROM base AS runtime
RUN pip install --no-cache-dir -r requirements-ml.txt
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
