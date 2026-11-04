# Roadmap — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) |
| Ultima modifica | 2026-11-04 |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) |

Lo sviluppo è **incrementale, per fasi**. Ogni fase produce software funzionante
e testabile e si chiude quando soddisfa il *Definition of Done* (§15 della
specifica master). Il dettaglio operativo vive nelle **issue GitHub**,
raggruppate per milestone (`Phase 0` … `Phase 7`, più la milestone
`Release 1.0`).

---

## Vista d'insieme

| Fase | Milestone | Obiettivo | Deliverable |
| ---- | --------- | --------- | ----------- |
| 0 | Phase 0 - Environment & Architecture | Ambiente e architettura | Ambiente Docker ARM64 riproducibile |
| 1 | Phase 1 - DICOM Foundation | Fondamenta DICOM | Import e indicizzazione dataset reali |
| 2 | Phase 2 - DICOM Workstation | Workstation DICOM | Viewer multi-viewport funzionante |
| 3 | Phase 3 - MPR & 3D | MPR e 3D | Geometria spaziale verificata |
| 4 | Phase 4 - Segmentation Lab | Segmentation Lab | Segmentazioni persistenti e allineate |
| 5 | Phase 5 - AI Engine | AI Engine | Inferenza CPU modulare e misurabile |
| 6 | Phase 6 - Quantitative Research | Ricerca quantitativa | Metriche, esperimenti, export |
| 7 | Phase 7 - Optimization & Release | Ottimizzazione e release | MRI Explorer 1.0 |

---

## Dettaglio per fase

### Phase 0 — Environment & Architecture

> Deliverable: **ambiente Docker ARM64 riproducibile**.

| Issue | Titolo |
| ----- | ------ |
| P0-01 | Scaffolding repository e documentazione di progetto |
| P0-02 | Matrice di compatibilità e pinning dipendenze ARM64 |
| P0-03 | Docker Compose: profili, limiti risorse, volumi, healthcheck e shutdown |
| P0-04 | Container frontend: React + TypeScript + Vite (dev) e Nginx (prod) |
| P0-05 | Container backend: FastAPI + Uvicorn modulare |
| P0-06 | Container AI: PyTorch + MONAI CPU opzionale |
| P0-07 | Servizio Orthanc opzionale (profilo dicom) |
| P0-08 | Tooling di sviluppo in Docker: Makefile, lint, format, typecheck, test |
| P0-09 | CI GitHub Actions: build ARM64, lint, typecheck e test |
| P0-10 | Configurazione ambiente, `.env.example` e gestione segreti |

### Phase 1 — DICOM Foundation

> Deliverable: **import e indicizzazione dataset reali**.

| Issue | Titolo |
| ----- | ------ |
| P1-01 | Import DICOM: scansione ricorsiva e parsing DICOMDIR |
| P1-02 | Raggruppamento Study/Series e classificazione delle serie |
| P1-03 | Estrazione e normalizzazione dei metadati |
| P1-04 | Motore geometrico: orientamento, ordinamento slice e validazione |
| P1-05 | Costruzione volume NIfTI/NRRD con geometria preservata |
| P1-06 | Schema SQLite, migrazioni e repository layer |
| P1-07 | API di import e gestione studi/serie con job non bloccanti |
| P1-08 | De-identificazione opzionale e sanitizzazione dei log |
| P1-09 | Test DICOM: generatore sintetico, unit test e validazione delle 9 serie |

### Phase 2 — DICOM Workstation

> Deliverable: **viewer multi-viewport funzionante**.

| Issue | Titolo |
| ----- | ------ |
| P2-01 | App shell e design system della workstation dark |
| P2-02 | Integrazione Cornerstone3D e loader delle immagini |
| P2-03 | Series explorer con thumbnail e categorizzazione |
| P2-04 | Rendering dello stack e navigazione dell'immagine |
| P2-05 | Layout multi-viewport e sincronizzazione crosshair |
| P2-06 | Strumenti di misura, annotazioni ed etichette di orientamento |
| P2-07 | Pannello metadati e controlli laterali |
| P2-08 | Prestazioni frontend: lazy loading, disposal e cache limitate |

### Phase 3 — MPR & 3D

> Deliverable: **geometria spaziale verificata**.

| Issue | Titolo |
| ----- | ------ |
| P3-01 | Servizio di preparazione volume e generazione MPR |
| P3-02 | Viewer MPR con crosshair sincronizzati |
| P3-03 | Integrazione VTK.js e scene manager 3D |
| P3-04 | Volume rendering e surface reconstruction (separati) |
| P3-05 | Export mesh (STL/OBJ/PLY) ed export volumi (NIfTI/NRRD) |
| P3-06 | Validazione geometrica MPR e 3D su phantom noti |

### Phase 4 — Segmentation Lab

> Deliverable: **segmentazioni persistenti e allineate**.

| Issue | Titolo |
| ----- | ------ |
| P4-01 | Modello dati segmentazione, storage NIfTI/NRRD e API CRUD |
| P4-02 | Editing manuale: brush/eraser e maschera 3D |
| P4-03 | Region growing, threshold, morfologia e interpolazione tra slice |
| P4-04 | Undo/redo, visibilità, colori e label anatomiche |
| P4-05 | Persistenza e validazione dell'allineamento spaziale |
| P4-06 | Generazione della superficie 3D dalle maschere |

### Phase 5 — AI Engine

> Deliverable: **inferenza CPU modulare e misurabile** (servizio opzionale).

| Issue | Titolo |
| ----- | ------ |
| P5-01 | Interfaccia model adapter e schema del model registry |
| P5-02 | Model registry: storage, API e installazione con licenza |
| P5-03 | Pipeline di inferenza CPU asincrona e memory-aware |
| P5-04 | Primo adapter di modello e report di validazione |
| P5-05 | Workflow di segmentazione AI-assistita nel frontend |
| P5-06 | Resilienza: viewer operativo con servizio AI spento |

### Phase 6 — Quantitative Research

> Deliverable: **metriche, esperimenti, export**.

| Issue | Titolo |
| ----- | ------ |
| P6-01 | Motore di misura quantitativa |
| P6-02 | Metriche di valutazione delle segmentazioni |
| P6-03 | Experiment tracking: modello dati e API |
| P6-04 | Radiomics come estensione opzionale (PyRadiomics) |
| P6-05 | Export dei risultati di ricerca in CSV e JSON |
| P6-06 | Research workspace UI |

### Phase 7 — Optimization & Release

> Deliverable: **MRI Explorer 1.0**.

| Issue | Titolo |
| ----- | ------ |
| P7-01 | Benchmark e profiling sul target M1 Pro |
| P7-02 | Ottimizzazione di caching e rendering guidata dai benchmark |
| P7-03 | Validazione limiti risorse Docker e build ARM64 |
| P7-04 | Backup, restore e verifica della persistenza dei dati |
| P7-05 | Completamento documentazione e profilo Compose di produzione |
| P7-06 | Release MRI Explorer 1.0 — checklist Definition of Done |

---

## Dipendenze tra fasi

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 6 ──► Phase 7 ──► Release 1.0
                                            └──► Phase 5 ──┘
```

Il dettaglio delle dipendenze puntuali è tracciato nei campi *Bloccata da* /
*Blocca* delle singole issue GitHub.
