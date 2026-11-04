# syntax=docker/dockerfile:1
#
# Risonix AI — FastAPI + PyTorch/MONAI CPU su Python 3.12 (slim-bookworm).
# Target: `runtime` (default) e `test`. Build per linux/arm64. Versioni pinnate (P0-02).
# Nessun peso di modello è incluso nell'immagine né scaricato all'avvio.

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
# test — dipendenze di sviluppo + suite pytest (senza runtime ML: più veloce)
# ---------------------------------------------------------------------------
FROM base AS test
USER root
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY tests ./tests
COPY pyproject.toml ./
USER appuser
RUN python -m pytest

# ---------------------------------------------------------------------------
# runtime — immagine di esecuzione (default) con PyTorch + MONAI (CPU)
# ---------------------------------------------------------------------------
FROM base AS runtime
RUN pip install --no-cache-dir -r requirements-ml.txt
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
