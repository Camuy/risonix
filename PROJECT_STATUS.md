# Project Status — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato complessivo | **Pre-alpha** — Fasi 0, 1 e 2 completate; Fase 3 in corso (P3-01, P3-02, P3-03 completate) |
| Ultima modifica | 2026-11-05 |
| Riferimento | [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md) |

Documento di governo con lo **stato corrente**, le **decisioni prese** e le
**funzionalità implementate**. Va aggiornato come parte dei deliverable di ogni
fase.

---

## 1. Stato attuale

- Repository inizializzato con `.gitignore` e `README.md`.
- Container frontend React/TypeScript/Vite (dev) + Nginx (prod) — issue P0-04.
- Servizio backend `mri-api` FastAPI+Uvicorn, modulare, con `/health` e
  `/api/version` — issue P0-05.
- Servizio AI `mri-ai` (PyTorch + MONAI CPU, opzionale, profilo `ai`) con
  registry/adapter e nessun peso caricato all'avvio — issue P0-06.
- Servizio Orthanc opzionale (profilo `dicom`), storage persistente in
  `data/orthanc/`, DICOMweb e autenticazione — issue P0-07.
- Struttura di progetto e documentazione di governo create (issue P0-01).
- Matrice di compatibilità ARM64 e **versioni pinnate** in
  [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) (issue P0-02); rischio R1 chiuso.
- `compose.yaml` con profili `default`/`ai`/`dicom`/`full`/`prod`, healthcheck,
  limiti di risorsa, volumi persistenti e logging (issue P0-03).
- Dati locali e PHI **non** versionati; pesi dei modelli **non** versionati.
- Configurazione d'ambiente documentata (`.env.example` + `docs/CONFIGURATION.md`),
  validazione fail-fast e servizi solo su localhost — issue P0-10.
- Tooling di sviluppo in Docker (`Makefile`: lint/format/typecheck/test, hook
  pre-commit), documentato in `docs/DEVELOPMENT.md` — issue P0-08.
- CI GitHub Actions (`.github/workflows/ci.yml`): qualità, validazione Compose,
  scansione segreti e build immagini `linux/arm64` — issue P0-09.
- Fondamenta DICOM: scansione (DICOMDIR/ZIP), raggruppamento studio/serie,
  metadati normalizzati, geometria validata, volumi NIfTI/NRRD — issue
  P1-01…P1-05.
- Persistenza SQLite + Alembic e livello repository — issue P1-06.
- API REST di import/consultazione con job asincroni — issue P1-07.
- De-identificazione opzionale e sanitizzazione dei log — issue P1-08.
- Phantom sintetico a 9 serie e validazione end-to-end — issue P1-09.
- App shell della workstation (layout a pannelli, viewport, toolbar, status bar)
  e design system dark con token — issue P2-01.
- Integrazione Cornerstone3D (rendering engine + tool group) e loader immagini
  DICOM via endpoint `GET /api/instances/{id}/file`, con rendering dello stack e
  rilascio delle risorse — issue P2-02.
- Series explorer con thumbnail (lazy) e categorizzazione correggibile
  manualmente, con override persistito per `SeriesInstanceUID` — issue P2-03.
- Rendering e navigazione dello stack (rotellina, tastiera, slider), rotazione,
  inversione toni, reset e fit coordinati, coordinate fisiche a schermo — issue
  P2-04.
- Layout multi-viewport 1 / 2H / 2V / 4 con crosshair e navigazione sincronizzati
  per `FrameOfReferenceUID` — issue P2-05.
- Strumenti di misura (lunghezza, angolo, polilinea, mano libera, sonda-sfera),
  annotazioni modificabili/cancellabili ed etichette di orientamento L/R, A/P,
  S/I — issue P2-06.
- Pannello proprietà con metadati della serie, slice corrente e sezione
  predisposta per la segmentazione — issue P2-07.
- Prestazioni frontend: lazy loading delle viste (code-splitting di
  Cornerstone3D), prefetch delle slice adiacenti, cache immagini limitata,
  riduzione dei re-render (coordinate senza re-render) e baseline del bundle —
  issue P2-08.
- Servizio volumi e base volume client: router `/api/volumes` (list/get/download
  NIfTI/NRRD con geometria completa e affinità LPS), volume streaming
  Cornerstone dagli imageId dello stack (allineato al volume su disco),
  `addVolumesToViewports` e comunicazione dei limiti dello spacing anisotropo —
  issue P3-01.
- Viewer MPR (assiale/coronale/sagittale) con crosshair world-space
  sincronizzato tramite `CrosshairsTool` nativo in un tool group dedicato,
  navigazione per coordinate (drag + scroll su tasto/rotellina), pan/zoom e
  indicazione dello spacing anisotropo; layout MPR nella toolbar — issue P3-02.
- Scena 3D VTK.js isolata dal viewer MPR: scene manager (render window, camera,
  attori, resize, disposal) con bounding box orientato dell'estensione del
  volume, gizmo di orientamento anatomico, rotazione/zoom/pan e tre piani di
  clipping lungo gli assi paziente; layout 3D nella toolbar, caricato in modo
  lazy con rilascio completo delle risorse WebGL — issue P3-03.

Legenda: ✅ fatto · 🚧 in corso · ⬜ non iniziato

| Fase | Stato | Note |
| ---- | ----- | ---- |
| Phase 0 — Environment & Architecture | ✅ | Repo, documenti, pinning ARM64, Compose, container frontend/backend/AI/Orthanc, config, tooling e CI |
| Phase 1 — DICOM Foundation | ✅ | Scanner/grouping/metadati/geometria/volumi, persistenza, API+jobs, de-id, validazione phantom 9 serie |
| Phase 2 — DICOM Workstation | ✅ | App shell e design system (P2-01); Cornerstone3D e loader (P2-02); series explorer (P2-03); navigazione stack (P2-04); multi-viewport e crosshair (P2-05); misure e annotazioni (P2-06); pannello proprietà (P2-07); prestazioni e code-splitting (P2-08) |
| Phase 3 — MPR & 3D | 🚧 | Servizio volumi e base volume client (P3-01); viewer MPR con crosshair sincronizzati (P3-02); integrazione VTK.js e scene manager 3D (P3-03) |
| Phase 4 — Segmentation Lab | ⬜ | |
| Phase 5 — AI Engine | ⬜ | |
| Phase 6 — Quantitative Research | ⬜ | |
| Phase 7 — Optimization & Release | ⬜ | |
| Release 1.0 | ⬜ | |

---

## 2. Funzionalità implementate

| # | Funzionalità | Stato | Riferimento |
| - | ------------ | ----- | ----------- |
| F1 | Struttura repo (`apps/`, `services/`, `packages/`, `infrastructure/`, `data/`, `scripts/`, `docs/`) | ✅ | P0-01 |
| F2 | Specifica master `MASTER_SPECIFICATION.md` | ✅ | P0-01 |
| F3 | Documenti di governo (`ARCHITECTURE`, `ROADMAP`, `DEPENDENCIES`, `VALIDATION`) | ✅ | P0-01 |
| F4 | `.gitignore` esteso: struttura dati tracciata, PHI/pesi mai versionati | ✅ | P0-01 |
| F5 | Link del README ai documenti di progetto | ✅ | P0-01 |
| F6 | Container frontend/backend/AI + Compose | ✅ | P0-03…P0-06 |
| F7 | CI GitHub Actions | ✅ | P0-09 |
| F8 | `.env.example` e gestione segreti | ✅ | P0-10 |
| F9 | Matrice di compatibilità ARM64 e versioni pinnate | ✅ | P0-02 |
| F10 | `compose.yaml`: profili, limiti risorse, volumi, healthcheck, shutdown | ✅ | P0-03 |
| F11 | Orthanc opzionale (profilo `dicom`), storage persistente, DICOMweb | ✅ | P0-07 |
| F12 | Tooling di sviluppo in Docker (Makefile: lint/format/typecheck/test/hooks) | ✅ | P0-08 |
| F13 | Scanner DICOM (ricorsivo, DICOMDIR, ZIP con difesa zip-slip) | ✅ | P1-01 |
| F14 | Raggruppamento studio/serie e classificazione delle istanze | ✅ | P1-02 |
| F15 | Metadati DICOM normalizzati (rescale, spacing, orientamento) | ✅ | P1-03 |
| F16 | Motore geometrico (ordinamento, spacing, gap, orientamento) | ✅ | P1-04 |
| F17 | Volume builder NIfTI/NRRD con provenienza e checksum | ✅ | P1-05 |
| F18 | Persistenza SQLite + Alembic e livello repository | ✅ | P1-06 |
| F19 | API REST import/consultazione + job asincroni | ✅ | P1-07 |
| F20 | De-identificazione opzionale e sanitizzazione log | ✅ | P1-08 |
| F21 | Phantom sintetico 9 serie + validazione end-to-end | ✅ | P1-09 |
| F22 | App shell e design system della workstation (pannelli, viewport, toolbar, status bar) | ✅ | P2-01 |
| F23 | Integrazione Cornerstone3D e loader immagini (viewport stack, endpoint file DICOM, disposal) | ✅ | P2-02 |
| F24 | Series explorer con thumbnail lazy e categorizzazione manuale persistita | ✅ | P2-03 |
| F25 | Navigazione stack, rotazione, inversione, reset/fit e coordinate fisiche | ✅ | P2-04 |
| F26 | Layout multi-viewport 1/2H/2V/4 e sincronizzazione crosshair | ✅ | P2-05 |
| F27 | Misure, annotazioni e etichette di orientamento | ✅ | P2-06 |
| F28 | Pannello proprietà metadati, slice corrente e sezione segmentazione | ✅ | P2-07 |
| F29 | Prestazioni frontend: code-splitting, prefetch, cache limitata e baseline | ✅ | P2-08 |
| F30 | Servizio volumi: API list/get/download NIfTI/NRRD, volume streaming client allineato e limiti di spacing | ✅ | P3-01 |
| F31 | Viewer MPR assiale/coronale/sagittale con crosshair world-space sincronizzato e layout dedicato | ✅ | P3-02 |
| F32 | Scena 3D VTK.js: scene manager, bounding box del volume, gizmo di orientamento, piani di clipping e layout dedicato | ✅ | P3-03 |

---

## 3. Decisioni prese (registro)

| # | Decisione | Riferimento |
| - | --------- | ----------- |
| D1 | Servizi indipendenti orchestrati con Docker Compose | ARCHITECTURE D1 |
| D2 | Immagini `linux/arm64` obbligatorie | ARCHITECTURE D2 |
| D3 | SQLite solo metadati; dati su filesystem | ARCHITECTURE D3 |
| D4 | Import da filesystem; Orthanc opzionale | ARCHITECTURE D4 |
| D5 | AI su CPU, asincrona, opzionale | ARCHITECTURE D5 |
| D6 | Geometria DICOM validata prima di ogni AI | ARCHITECTURE D6 |
| D7 | Motore imaging anatomia-agnostico | ARCHITECTURE D7 |
| D8 | Sicurezza per costruzione (localhost, no telemetria) | ARCHITECTURE D8 |
| — | Struttura dati tracciata via `.gitkeep`, contenuti ignorati | `.gitignore` |

---

## 4. Decisioni aperte

| # | Tema | Impatto | Riferimento |
| - | ---- | ------- | ----------- |
| ~~R1~~ | ~~Compatibilità ARM64 di PyTorch/MONAI/SimpleITK~~ | **Chiusa** (P0-02) | DEPENDENCIES §4 |
| R2 | Licenza del progetto (e impatto AGPL di Orthanc) | Governo | DEPENDENCIES §7 |
| R3 | Soglie definitive di performance | Non bloccante | VALIDATION §5 |
| R4 | Necessità effettiva di Orthanc nel flusso reale | Non bloccante | ARCHITECTURE D4 |
| R5 | Parsing NIfTI lato client (fallback del volume) | Non bloccante | VALIDATION §10.1 |

---

## 5. Rischi noti

Vedi §17 di [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md#17-rischi-e-decisioni-aperte).
**R1 (ARM64) è chiuso** con la issue P0-02 (matrice e pinning in
[`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md)). Restano aperti la licenza del
progetto e il budget di memoria con AI attiva.

---

## 6. Prossimi passi immediati

1. Proseguire la **Phase 3 — MPR & 3D**: volume rendering/surface
   reconstruction (P3-04) ed export mesh/volumi (P3-05), costruiti sulla base
   geometrica dei volumi (P3-01), dell'MPR (P3-02) e della scena 3D (P3-03).
2. Aggiornare i tempi di build osservati in CI (`docs/DEVELOPMENT.md` §5) e
   raccogliere la baseline di memoria/FPS sul target M1 Pro (P2-08 → P7-01).

---

## 7. Come contribuire / eseguire

- Quickstart: vedi [`README.md`](README.md#quickstart) (attivo al termine della
  Fase 0).
- Convenzioni: §16 di [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md#16-convenzioni-di-progetto).
- Il lavoro è tracciato nelle issue GitHub per milestone (`Phase 0` … `Phase 7`).
