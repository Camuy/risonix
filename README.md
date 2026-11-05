# MRI Explorer · Risonix

**Piattaforma locale di imaging biomedico e ricerca** per la visualizzazione, la segmentazione e l'analisi quantitativa di esami RM, con architettura estendibile ad altri distretti anatomici.

> Progetto di ricerca, didattica e analisi di immagini biomediche.
> **Non è un dispositivo medico** e non fornisce diagnosi cliniche validate.

[![Status](https://img.shields.io/badge/status-pre--alpha-inactive)](#stato-del-progetto)
[![CI](https://github.com/Camuy/risonix/actions/workflows/ci.yml/badge.svg)](https://github.com/Camuy/risonix/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-linux%2Farm64-blue)](#requisiti)
[![Docker](https://img.shields.io/badge/runtime-Docker-2496ED?logo=docker&logoColor=white)](#quickstart)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](docs/DEPENDENCIES.md)

---

## Panoramica

MRI Explorer è una workstation di imaging biomedicale **self-hosted**, accessibile da browser, pensata per girare interamente in **Docker** su un Apple MacBook Pro con chip **M1 Pro** (10 core, 16 GB di memoria unificata).

L'obiettivo è offrire un ambiente unico e riproducibile per:

1. Importare e gestire studi di imaging medico (DICOM).
2. Esplorare dataset DICOM complessi.
3. Visualizzare acquisizioni RM.
4. Eseguire ricostruzioni multiplanari (MPR).
5. Ricostruire e visualizzare strutture anatomiche 3D.
6. Creare e gestire segmentazioni anatomiche.
7. Eseguire segmentazione e analisi assistite da AI.
8. Effettuare misure quantitative.
9. Sviluppare e valutare modelli AI biomedicali.
10. Gestire esperimenti di ricerca riproducibili.

Il dataset di riferimento iniziale è un esame **RM del ginocchio** con più serie DICOM, ma il motore di imaging è **anatomia-agnostico**: le funzionalità specifiche per distretto (ginocchio, spalla, colonna, encefalo, anca, ...) sono implementate come moduli/estensioni indipendenti.

La specifica tecnica completa è in [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md) (introdotta nella *Phase 0*).

---

## Stato del progetto

**Pre-alpha** — Fasi 0, 1 e 2 complete: ambiente Docker riproducibile, fondamenta
DICOM (import, geometria, volumi, API REST) e workstation DICOM (viewer
multi-viewport Cornerstone3D, misure, annotazioni). In corso la *Phase 3 — MPR &
3D*: servizio volumi e base volume client completati (P3-01).

- Stato corrente, decisioni e funzionalità: [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
- Pianificazione incrementale: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Decisioni architetturali: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Principi del prodotto

- Visualizzazione di immagini mediche di alta qualità.
- Gestione **corretta** della geometria DICOM (prima di qualsiasi AI).
- Accuratezza scientifica e riproducibilità.
- Performance ed efficienza di memoria su hardware limitato.
- Modularità e servizi indipendenti.
- Tecnologie open source, dati in locale, nessun lock-in.
- Nessuna dipendenza applicativa installata nativamente su macOS.

---

## Architettura (target)

Applicazione composta da servizi Docker indipendenti, orchestrati con Docker Compose.

| Servizio      | Responsabilità                                                                 | Porta (dev/prod) | Profilo   |
| ------------- | ------------------------------------------------------------------------------ | ---------------- | --------- |
| `mri-frontend`| React + TypeScript + Cornerstone3D + VTK.js (Nginx in produzione)               | 5173 / 3000      | `default` |
| `mri-api`     | FastAPI: import DICOM, metadati, geometria, volumi, segmentazioni, job AI       | 8000             | `default` |
| `mri-ai`      | PyTorch + MONAI: model registry, inferenza CPU, valutazione                     | 8001             | `ai`      |
| `orthanc`     | Archivio DICOM opzionale (DICOMweb, Q/R)                                        | 8042             | `dicom`   |
| `nginx`       | Reverse proxy per il profilo di produzione                                      | 80               | `prod`    |

Profili Compose e contenuto:

| Profilo   | Servizi avviati                          | Comando |
| --------- | ---------------------------------------- | ------- |
| `default` | `mri-frontend` + `mri-api`               | `docker compose up` |
| `ai`      | `+ mri-ai`                               | `docker compose --profile default --profile ai up` |
| `dicom`   | `+ orthanc`                              | `docker compose --profile default --profile dicom up` |
| `full`    | `default` + `ai` + `dicom`               | `docker compose --profile full up` |
| `prod`    | `mri-frontend-prod` (Nginx) + `mri-api` + `nginx` | `COMPOSE_PROFILES=prod docker compose up` |

Il profilo attivo per il comando senza `--profile` è impostato in `.env`
(`COMPOSE_PROFILES=default`). Il servizio AI **non** parte di default: la
piattaforma resta utilizzabile quando `mri-ai` è spento.

Tutti i servizi hanno **healthcheck**, **limiti di risorsa** e **policy di
shutdown** definiti in `compose.yaml`; i dati persistenti risiedono in `data/`
(bind mount) e sopravvivono al riavvio dei container.

Limiti di risorsa iniziali per container:

| Servizio | Memoria | CPU |
| -------- | ------- | --- |
| Frontend | 256 MB  | 0.5 |
| API      | 1.5 GB  | 2   |
| AI       | 4 GB    | 4   |
| Orthanc  | 512 MB  | 1   |

---

## Stack tecnologico

- **Frontend:** React, TypeScript, Vite, Cornerstone3D, VTK.js, Nginx.
- **Backend:** Python, FastAPI, Uvicorn, Pydantic, pydicom, SimpleITK, NumPy, SciPy, scikit-image, NiBabel, pandas, pynrrd, trimesh.
- **AI:** PyTorch, MONAI (Core/Label), model zoo; inferenza CPU.
- **DICOM infra:** import da filesystem (DICOMDIR + scansione ricorsiva); Orthanc opzionale.
- **Database:** SQLite (solo metadati e riferimenti; i file DICOM restano su filesystem).

Le versioni esatte vengono **pinnate dopo validazione di compatibilità ARM64** (vedi `docs/DEPENDENCIES.md`).

---

## Requisiti

- **Host:** Apple MacBook Pro, Apple M1 Pro, 10 core, 16 GB RAM, ≥ 30 GB disco libero.
- **Runtime:** Docker Desktop (unico prerequisito applicativo). Nessuna installazione nativa di Node.js, Python, PyTorch, MONAI, SimpleITK.
- **Architettura container:** `linux/arm64` obbligatoria. Emulazione QEMU ammessa solo se giustificata e misurata.

> Nota: i container Linux su macOS **non** accedono a Metal/MPS. L'inferenza AI gira su **CPU**. Il backend AI è progettato per poter essere spostato su un server GPU esterno in futuro senza modificare frontend o motore di imaging.

---

## Quickstart

> ⚠️ **Stato: pre-alpha.** Fasi 0, 1 e 2 complete. Lo stack base è eseguibile;
> import, consultazione e viewer DICOM (multi-viewport, misure) sono attivi.

```bash
# 1. Clonare il repository
git clone https://github.com/Camuy/risonix.git
cd risonix

# 2. Creare il file di configurazione locale
cp .env.example .env

# 3. Avviare lo stack base (frontend + API) — profilo `default`
docker compose up --build

# 4. (Opzionale) importare un esame DICOM già presente in `data/`, poi aprire
#    il viewer su http://localhost:5173
curl -fsS -X POST http://localhost:8000/api/studies/import \
  -H 'Content-Type: application/json' \
  -d '{"source_path":"DICOMDIR"}'

# 5. (Opzionale) abilitare il servizio AI — profilo `ai`
docker compose --profile default --profile ai up --build

# 6. (Opzionale) abilitare Orthanc — profilo `dicom`
docker compose --profile default --profile dicom up --build

# 7. (Opzionale) tutta la piattaforma (base + AI + Orthanc) — profilo `full`
docker compose --profile full up --build

# 8. (Opzionale) profilo di produzione locale (React su Nginx + reverse proxy)
COMPOSE_PROFILES=prod docker compose up --build
```

- Frontend (dev): http://localhost:5173
- API + OpenAPI: http://localhost:8000/docs
- AI service: http://localhost:8001
- Orthanc: http://localhost:8042

> **Tooling.** I comandi di sviluppo (lint, format, typecheck, test) girano in
> Docker tramite il `Makefile`: `make help`, `make up`, `make lint`, `make test`.
> Dettagli in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

### Archivio DICOM opzionale (Orthanc — profilo `dicom`)

Orthanc **non** è richiesto dallo stack base: parte solo con il profilo `dicom`
(oppure `full`).

```bash
# Avvio con Orthanc, insieme allo stack base
docker compose --profile default --profile dicom up -d

# Solo Orthanc (senza frontend/API)
docker compose --profile dicom up -d orthanc
```

- **HTTP / DICOMweb:** http://localhost:8042 — radice DICOMweb: `/dicom-web`
  (es. `GET /dicom-web/studies`). Server DICOM (C-STORE/C-FIND) su `4242`.
- **Credenziali:** default `orthanc` / `orthanc`, sovrascrivibili in `.env` con
  `MRI_ORTHANC_USER` e `MRI_ORTHANC_PASSWORD`.
- **Persistenza:** i dati risiedono in `data/orthanc/` (bind mount) e
  sopravvivono a `docker compose restart`.
- **Sicurezza:** accesso remoto disabilitato (`RemoteAccessAllowed=false`),
  autenticazione attiva, porte esposte solo su `127.0.0.1`.
- **Configurazione:** `infrastructure/orthanc/orthanc.json` (montata in sola
  lettura); le variabili `ORTHANC__*` in `compose.yaml` hanno precedenza.

---

## Struttura del repository (target)

```
risonix/
├── apps/
│   └── frontend/                 # React + Cornerstone3D + VTK.js
├── services/
│   ├── api/                      # FastAPI
│   └── ai/                       # PyTorch + MONAI
├── packages/
│   ├── imaging-core/             # motore imaging condiviso (geometria, volumi)
│   ├── segmentation-core/        # modello e operazioni di segmentazione
│   └── shared-types/             # tipi/contratti condivisi
├── infrastructure/
│   ├── docker/                   # Dockerfile, compose, nginx
│   └── orthanc/                  # configurazione Orthanc
├── data/                         # dati locali (gitignored, PHI)
│   ├── incoming/ original/ processed/ segmentations/
│   ├── exports/ models/ database/ cache/
│   └── research/experiments/ research/metrics/
├── scripts/
├── docs/
└── MASTER_SPECIFICATION.md
```

---

## Roadmap

Lo sviluppo è incrementale, per fasi, ognuna delle quali produce software funzionante e testabile.

| Fase | Obiettivo                                    | Deliverable                              |
| ---- | -------------------------------------------- | ---------------------------------------- |
| 0    | Ambiente e architettura                      | Ambiente Docker ARM64 riproducibile      |
| 1    | Fondamenta DICOM                              | Import e indicizzazione dataset reali    |
| 2    | Workstation DICOM                             | Viewer multi-viewport funzionante        |
| 3    | MPR e 3D                                      | Geometria spaziale verificata            |
| 4    | Segmentation Lab                              | Segmentazioni persistenti e allineate    |
| 5    | AI Engine                                     | Inferenza CPU modulare e misurabile      |
| 6    | Ricerca quantitativa                          | Metriche, esperimenti, export            |
| 7    | Ottimizzazione e release                      | MRI Explorer 1.0                         |

Il dettaglio operativo è tracciato nelle **issue GitHub** (milestone `Phase 0` … `Phase 7`) e sarà mantenuto in `docs/ROADMAP.md`.

---

## Documentazione

| Documento                    | Contenuto                                             |
| ---------------------------- | ----------------------------------------------------- |
| `MASTER_SPECIFICATION.md`    | Specifica tecnica principale del progetto             |
| `docs/ARCHITECTURE.md`       | Decisioni architetturali e motivazioni                |
| `docs/ROADMAP.md`            | Piano di sviluppo incrementale                        |
| `docs/DEPENDENCIES.md`       | Registro dipendenze, versioni e licenze               |
| `docs/CONFIGURATION.md`      | Variabili d'ambiente, segreti e binding localhost     |
| `docs/DEVELOPMENT.md`        | Tooling di sviluppo (Makefile in Docker) e convenzioni |
| `docs/VALIDATION.md`         | Procedure di test e validazione                       |
| `PROJECT_STATUS.md`          | Stato corrente, decisioni e funzionalità implementate |
| `PRODUCT.md`                 | Registro di prodotto: utenti, principi, accessibilità |
| `DESIGN.md`                  | Design system della workstation (token visivi, tipografia, componenti) |

---

## Sicurezza e privacy

- Servizi esposti solo su **localhost**; nessuna esposizione pubblica.
- Le immagini DICOM **non** vengono mai trasmesse a servizi esterni; nessuna inferenza cloud.
- Nessuna telemetria/analytics di default.
- Nessun dato reale di paziente, credenziale o segreto nel repository.
- De-identificazione DICOM opzionale; log sanitizzati.

---

## Licenza

Da definire in *Phase 0* (`docs/DEPENDENCIES.md`), insieme al registro delle licenze di tutte le dipendenze (open source, con attenzione a uso commerciale e di ricerca).

---

## Disclaimer

MRI Explorer è uno strumento per **ricerca, formazione e analisi di immagini biomediche**. Gli output dell'AI e le misure derivanti dalle immagini **non** costituiscono diagnosi cliniche validate e non devono essere usati per decisioni cliniche.
