# Risonix — Makefile di sviluppo (P0-08).
#
# Tutto gira in Docker: non sono richieste installazioni native di Node.js o
# Python. Vedi docs/DEVELOPMENT.md.

SHELL := /bin/sh

COMPOSE := docker compose
TOOLS := docker compose -f compose.tools.yaml

.DEFAULT_GOAL := help

.PHONY: help
help: ## Mostra i target disponibili
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Stack applicativo
# ---------------------------------------------------------------------------
.PHONY: bootstrap
bootstrap: ## Crea `.env` da `.env.example` se assente
	@test -f .env || cp .env.example .env

.PHONY: up down logs ps config
up: bootstrap ## Avvia lo stack base (profilo default) in background
	$(COMPOSE) up -d

down: ## Ferma e rimuove lo stack
	$(COMPOSE) down

logs: ## Segue i log dello stack
	$(COMPOSE) logs -f

ps: ## Stato dei container
	$(COMPOSE) ps

config: ## Valida compose.yaml
	$(COMPOSE) config -q

# ---------------------------------------------------------------------------
# Qualità: lint / format / typecheck / test (aggregati)
# ---------------------------------------------------------------------------
.PHONY: lint format typecheck test
lint: frontend-lint api-lint ai-lint ## Lint di frontend, API e AI
format: frontend-format api-format ai-format ## Formattazione di frontend, API e AI
typecheck: frontend-typecheck api-typecheck ai-typecheck ## Typecheck di frontend, API e AI
test: api-test ai-test ## Test backend e AI (frontend senza test in Phase 0)

# ---------------------------------------------------------------------------
# Frontend (React/TypeScript/Vite)
# ---------------------------------------------------------------------------
.PHONY: frontend-lint frontend-format frontend-typecheck
frontend-lint:
	$(TOOLS) run --rm --build frontend-tools npm run lint

frontend-format:
	$(TOOLS) run --rm --build frontend-tools npm run format

frontend-typecheck:
	$(TOOLS) run --rm --build frontend-tools npm run typecheck

.PHONY: frontend-install
frontend-install: ## Reinstalla node_modules nel volume (dopo un cambio di lock)
	$(TOOLS) run --rm --build frontend-tools npm ci

# ---------------------------------------------------------------------------
# Backend API (FastAPI)
# ---------------------------------------------------------------------------
.PHONY: api-lint api-format api-typecheck api-test
api-lint:
	$(TOOLS) run --rm --build api-tools ruff check .

api-format:
	$(TOOLS) run --rm --build api-tools ruff format .

api-typecheck:
	$(TOOLS) run --rm --build api-tools mypy app tests

api-test:
	$(TOOLS) run --rm --build api-tools python -m pytest

# ---------------------------------------------------------------------------
# Servizio AI (PyTorch + MONAI)
# ---------------------------------------------------------------------------
.PHONY: ai-lint ai-format ai-typecheck ai-test
ai-lint:
	$(TOOLS) run --rm --build ai-tools ruff check .

ai-format:
	$(TOOLS) run --rm --build ai-tools ruff format .

ai-typecheck:
	$(TOOLS) run --rm --build ai-tools mypy app tests

ai-test:
	$(TOOLS) run --rm --build ai-tools python -m pytest

# ---------------------------------------------------------------------------
# Hook pre-commit (in Docker, nessuna dipendenza nativa)
# ---------------------------------------------------------------------------
.PHONY: hooks
hooks: ## Installa l'hook pre-commit in .git/hooks
	install -m 0755 scripts/hooks/pre-commit .git/hooks/pre-commit
	@echo "pre-commit installato: esegue 'make lint' e 'make typecheck'"
