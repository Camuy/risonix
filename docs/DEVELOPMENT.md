# Sviluppo e tooling — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) |
| Ultima modifica | 2026-11-05 |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) · [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) |

Questo documento descrive il **flusso di sviluppo**: comandi, convenzioni e hook.
Principio guida: **tutto gira in Docker**. Non sono richieste installazioni
native di Node.js, Python, PyTorch, ecc. sul host; l'unico prerequisito è Docker
Desktop.

---

## 1. Comandi (Makefile)

Dalla radice del repository:

| Comando | Effetto |
| ------- | ------- |
| `make help` | Elenca i target disponibili |
| `make bootstrap` | Crea `.env` da `.env.example` se assente |
| `make up` / `make down` | Avvia / ferma lo stack (profilo `default`) |
| `make logs` / `make ps` | Log / stato dei container |
| `make config` | Valida `compose.yaml` |
| `make lint` | Lint di frontend + API + AI |
| `make format` | Formattazione di frontend + API + AI |
| `make typecheck` | Typecheck TS + mypy (API + AI) |
| `make test` | Test API + AI |
| `make hooks` | Installa l'hook pre-commit |

Target per singolo componente: `frontend-*`, `api-*`, `ai-*` (es.
`make frontend-lint`, `make api-test`).

---

## 2. Come funziona

- Il tooling è definito in [`compose.tools.yaml`](../compose.tools.yaml): tre
  servizi (`frontend-tools`, `api-tools`, `ai-tools`) costruiti dai target `dev`
  dei rispettivi Dockerfile, con le **sorgenti montate in bind mount**.
- Le dipendenze restano **dentro i container** (nessuna duplicazione con il
  host). `node_modules` è un **volume nominato** popolato dall'immagine, così
  non dipende da un `npm install` nativo.
- I comandi girano una tantum (`docker compose run --rm`), senza avviare i
  servizi applicativi.

Esempio diretto, senza Makefile:

```bash
docker compose -f compose.tools.yaml run --rm --build api-tools ruff check .
```

Dopo un cambio di `package-lock.json`:

```bash
make frontend-install
```

---

## 3. Convenzioni

- **Python:** [ruff](https://docs.astral.sh/ruff/) per lint e formattazione,
  `mypy` per il typecheck. Configurazione in `services/*/pyproject.toml`
  (riga max 100, target `py312`).
- **TypeScript/JS:** ESLint (flat config) + Prettier. Configurazione in
  `apps/frontend/eslint.config.js` e `apps/frontend/.prettierrc.json`.
- Codice e identificatori in **inglese**; documentazione e messaggi utente in
  **italiano**.
- Commit in stile [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `infra:`, `ci:`, `test:`, `chore:`).

---

## 4. Hook pre-commit

`make hooks` installa `scripts/hooks/pre-commit` in `.git/hooks/pre-commit`.
L'hook esegue `make lint` e `make typecheck` (in Docker) prima di ogni commit.
Per saltarlo: `git commit --no-verify`.

---

## 5. Riutilizzo in CI

La pipeline GitHub Actions (P0-09) riutilizza **gli stessi comandi** (`make
lint`, `make typecheck`, `make test`, `make config`), così il comportamento in CI
coincide con quello locale. Vedi [`docs/VALIDATION.md`](VALIDATION.md) §6.
