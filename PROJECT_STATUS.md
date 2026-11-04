# Project Status — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato complessivo | **Pre-alpha** — Fase 0 in corso |
| Ultima modifica | 2026-11-04 |
| Riferimento | [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md) |

Documento di governo con lo **stato corrente**, le **decisioni prese** e le
**funzionalità implementate**. Va aggiornato come parte dei deliverable di ogni
fase.

---

## 1. Stato attuale

- Repository inizializzato con `.gitignore` e `README.md`.
- **Nessun servizio implementato.** L'ambiente Docker è in costruzione (Fase 0).
- Struttura di progetto e documentazione di governo create (issue P0-01).
- Dati locali e PHI **non** versionati; pesi dei modelli **non** versionati.

Legenda: ✅ fatto · 🚧 in corso · ⬜ non iniziato

| Fase | Stato | Note |
| ---- | ----- | ---- |
| Phase 0 — Environment & Architecture | 🚧 | Scaffolding e documenti fatti; container/compose/CI da fare |
| Phase 1 — DICOM Foundation | ⬜ | |
| Phase 2 — DICOM Workstation | ⬜ | |
| Phase 3 — MPR & 3D | ⬜ | |
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
| F6 | Container frontend/backend/AI + Compose | ⬜ | P0-03…P0-06 |
| F7 | CI GitHub Actions | ⬜ | P0-09 |
| F8 | `.env.example` e gestione segreti | ⬜ | P0-10 |

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
| R1 | Compatibilità ARM64 di PyTorch/MONAI/SimpleITK | Blocca fasi 1/5 | DEPENDENCIES §4 |
| R2 | Licenza del progetto (e impatto AGPL di Orthanc) | Governo | DEPENDENCIES §5 |
| R3 | Soglie definitive di performance | Non bloccante | VALIDATION §5 |
| R4 | Necessità effettiva di Orthanc nel flusso reale | Non bloccante | ARCHITECTURE D4 |

---

## 5. Rischi noti

Vedi §17 di [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md#17-rischi-e-decisioni-aperte).
Principale: **R1 (ARM64)**, da chiudere con la issue P0-02 prima di procedere
oltre la Fase 0.

---

## 6. Prossimi passi immediati

1. P0-02 — matrice di compatibilità e pinning dipendenze ARM64.
2. P0-03 — Docker Compose con profili, limiti, volumi, healthcheck.
3. P0-04…P0-06 — container frontend, backend, AI.
4. P0-07 — Orthanc opzionale.
5. P0-08 — tooling di sviluppo in Docker.
6. P0-09 — CI GitHub Actions.
7. P0-10 — `.env.example` e gestione segreti.

---

## 7. Come contribuire / eseguire

- Quickstart: vedi [`README.md`](README.md#quickstart) (attivo al termine della
  Fase 0).
- Convenzioni: §16 di [`MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md#16-convenzioni-di-progetto).
- Il lavoro è tracciato nelle issue GitHub per milestone (`Phase 0` … `Phase 7`).
