# MASTER SPECIFICATION — MRI Explorer · Risonix

| Campo        | Valore                                                       |
| ------------ | ------------------------------------------------------------ |
| Versione     | 1.1 (Phase 0)                                                |
| Stato        | Pre-alpha — documento vivo                                   |
| Owner        | Camuy                                                        |
| Ultima modifica | 2026-11-04                                                |
| Documenti collegati | [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md), [`docs/VALIDATION.md`](docs/VALIDATION.md), [`PROJECT_STATUS.md`](PROJECT_STATUS.md) |

> Questo documento è la **specifica tecnica principale** del progetto. Ogni
> decisione implementativa deve essere riconducibile a una sezione di questo
> documento. In caso di conflitto, prevale la versione più recente di questo
> file; le deviazioni vanno esplicitamente motivate in
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 1. Scopo e visione

MRI Explorer (nome in codice **Risonix**) è una **workstation di imaging
biomedico self-hosted**, accessibile da browser, progettata per l'analisi di
esami di Risonanza Magnetica (RM). L'intero stack gira in container **Docker
ARM64** su un Apple MacBook Pro con chip **M1 Pro** (10 core, 16 GB di memoria
unificata).

La piattaforma nasce per **ricerca, didattica e analisi quantitativa di immagini
biomediche** e deve offrire un ambiente:

- **Riproducibile:** stesso risultato a parità di input e versione.
- **Locale:** nessun dato lascia la macchina, nessun servizio cloud.
- **Estendibile:** motore di imaging *anatomia-agnostico*, con estensioni
  specifiche per distretto (ginocchio, spalla, colonna, encefalo, anca, …).
- **Scientificamente corretto:** la **geometria DICOM** è un requisito di prima
  classe, da validare **prima** di qualunque elaborazione AI.
- **Efficiente:** progettata per operare entro i limiti di memoria del target.

### 1.1 Obiettivi funzionali di alto livello

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

---

## 2. Non-obiettivi e disclaimer

- **Non è un dispositivo medico.** Non fornisce diagnosi cliniche validate.
- Gli output AI e le misure derivate **non** devono essere usati per decisioni
  cliniche.
- **Nessuna telemetria/analytics** di default.
- **Nessun dato trasmesso a servizi esterni**, nessuna inferenza cloud.
- **Nessuna dipendenza applicativa installata nativamente su macOS:** Docker
  Desktop è l'unico prerequisito.
- In *Phase 0* **non** si implementano comportamenti clinici: solo ambiente,
  struttura e documentazione.

### 2.1 Assunzioni

- L'host è un MacBook Pro M1 Pro con ≥ 30 GB di disco libero.
- Docker Desktop è installato e aggiornato; i container girano `linux/arm64`.
- L'accesso ai servizi è **solo su localhost**.
- I container Linux su macOS **non** accedono a Metal/MPS: l'inferenza AI gira
  su **CPU**.
- Il dataset di riferimento è un esame **RM del ginocchio** con più serie
  (riferimento: 9 serie), usato come caso di validazione end-to-end.

---

## 3. Glossario

| Termine | Definizione |
| ------- | ----------- |
| **DICOM** | Standard per immagini mediche; file `.dcm` con metadati (tag). |
| **DICOMDIR** | File indice che descrive la gerarchia di un supporto DICOM. |
| **Study / Series / Instance** | Gerarchia DICOM: studio → serie → singola immagine. |
| **PHI** | *Protected Health Information*: dati identificativi del paziente. |
| **MPR** | *Multi-Planar Reconstruction*: ricostruzione di piani assiali/coronali/sagittali da un volume. |
| **Volume** | Griglia 3D di voxel con geometria spaziale (spacing, origin, direzione). |
| **Spacing** | Dimensione fisica del voxel lungo i tre assi (mm). |
| **Segmentation** | Maschera di label per voxel (es. cartilagini, menischi). |
| **NIfTI / NRRD** | Formati di volume/maschera standard per imaging e AI. |
| **Model adapter** | Interfaccia che incapsula un modello AI e la sua inferenza. |
| **Model registry** | Catalogo versionato dei modelli AI disponibili. |
| **Radiomics** | Estrazione di feature quantitative da immagini (estensione opzionale). |
| **Profilo Compose** | Gruppo di servizi attivabili con `docker compose --profile <nome>`. |
| **DoD** | *Definition of Done*: criteri di completamento di una fase. |

---

## 4. Requisiti di sistema e vincoli

### 4.1 Host

| Componente | Valore |
| ---------- | ------ |
| Macchina   | Apple MacBook Pro |
| Chip       | Apple M1 Pro, 10 core |
| Memoria    | 16 GB unificata |
| Disco      | ≥ 30 GB liberi |
| Runtime    | Docker Desktop (unico prerequisito applicativo) |

### 4.2 Vincoli

- **Architettura container:** `linux/arm64` obbligatoria. L'emulazione QEMU è
  ammessa **solo** se giustificata e misurata.
- **Nessuna installazione nativa** di Node.js, Python, PyTorch, MONAI,
  SimpleITK sull'host.
- **Persistenza:** i file DICOM e i volumi restano sul filesystem; il database
  contiene **solo metadati e riferimenti**.
- **Determinismo:** le elaborazioni scientifiche devono essere riproducibili a
  parità di versione delle dipendenze.

---

## 5. Architettura generale

Applicazione composta da servizi Docker indipendenti orchestrati con Docker
Compose. Dettaglio e motivazioni in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### 5.1 Servizi

| Servizio       | Responsabilità                                                          | Porta (dev/prod) | Profilo   |
| -------------- | ----------------------------------------------------------------------- | ---------------- | --------- |
| `mri-frontend` | React + TypeScript + Cornerstone3D + VTK.js (Nginx in produzione)       | 5173 / 3000      | `default` |
| `mri-api`      | FastAPI: import DICOM, metadati, geometria, volumi, segmentazioni, job AI | 8000           | `default` |
| `mri-ai`       | PyTorch + MONAI: model registry, inferenza CPU, valutazione             | 8001             | `ai`      |
| `orthanc`      | Archivio DICOM opzionale (DICOMweb, Q/R)                                | 8042             | `dicom`   |
| `nginx`        | Reverse proxy per il profilo di produzione                              | 80               | `prod`    |

### 5.2 Profili Compose

`default` (frontend + API), `ai`, `dicom`, `full`, `prod`.

- Il servizio AI **non** parte di default: la piattaforma resta operativa con
  `mri-ai` spento (requisito di **resilienza**, vedi Fase 5).
- `full` abilita `default` + `ai` + `dicom`.

### 5.3 Limiti di risorsa per container

| Servizio | Memoria | CPU |
| -------- | ------- | --- |
| Frontend | 256 MB  | 0.5 |
| API      | 1.5 GB  | 2   |
| AI       | 4 GB    | 4   |
| Orthanc  | 512 MB  | 1   |

I limiti sono **obiettivi misurabili** verificati nella Fase 7 (issue P7-03).

### 5.4 Flusso dati (sintesi)

```
filesystem DICOM ──► mri-api (import, parsing, geometria)
                        │
                        ├──► SQLite (metadati/riferimenti)
                        ├──► volumi NIfTI/NRRD (data/processed)
                        └──► API REST/JSON ──► mri-frontend (Cornerstone3D/VTK.js)
                                                 │
mri-ai (profilo ai) ◄── richieste di inferenza ──┘
```

---

## 6. Stack tecnologico

| Livello | Tecnologie |
| ------- | ---------- |
| Frontend | React, TypeScript, Vite, Cornerstone3D, VTK.js, Nginx |
| Backend | Python, FastAPI, Uvicorn, Pydantic, pydicom, SimpleITK, NumPy, SciPy, scikit-image, NiBabel, pandas, pynrrd, trimesh |
| AI | PyTorch, MONAI (Core/Label), model zoo; inferenza CPU |
| DICOM infra | Import da filesystem (DICOMDIR + scansione ricorsiva); Orthanc opzionale |
| Database | SQLite (solo metadati e riferimenti) |
| Runtime | Docker, Docker Compose, `linux/arm64` |

Le versioni esatte sono **pinnate dopo validazione di compatibilità ARM64**, in
[`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) (Fase 0, issue P0-02).

---

## 7. Persistenza e modello dati

### 7.1 Principio

I **file DICOM** e i **volumi/maschere** restano sul filesystem. SQLite
contiene **solo metadati e riferimenti** (path, UID, descrizioni, stato dei job,
riferimenti a segmentazioni ed esperimenti).

### 7.2 Struttura dati locale (`data/`, gitignored)

```
data/
├── incoming/          # file in attesa di import
├── original/          # copia immutabile dei DICOM importati
├── processed/         # volumi derivati (NIfTI/NRRD)
├── segmentations/     # maschere di segmentazione
├── exports/           # export (mesh, volumi, CSV/JSON)
├── models/            # pesi dei modelli AI (mai versionati)
├── database/          # file SQLite
├── cache/             # cache temporanee
└── research/
    ├── experiments/   # definizioni/risultati esperimenti
    └── metrics/       # metriche di valutazione
```

### 7.3 Entità principali (schema logico)

- **Study:** `study_instance_uid`, patient (de-identificato), data, descrizione.
- **Series:** `series_instance_uid`, `study_fk`, modality, descrizione, conteggio
  istanze, parametri geometrici.
- **Instance:** `sop_instance_uid`, `series_fk`, path, posizione, orientamento.
- **Volume:** riferimento a serie, path NIfTI/NRRD, spacing, shape, checksum
  geometrico.
- **Segmentation:** volume di riferimento, label map, nome, colore, metadati
  anatomici.
- **Job:** tipo, stato, progresso, errori (import, conversione, inferenza, export).
- **Model:** nome, versione, license, checksum, adapter, metadati.
- **Experiment:** configurazione, input, output, metriche, timestamp.

Lo schema SQLite definitivo con migrazioni è definito nella Fase 1 (issue P1-06).

---

## 8. Geometria DICOM (requisito di prima classe)

La correttezza geometrica è **prerequisito** di ogni fase successiva.

Regole vincolanti:

1. **Ordinamento slice** basato su `ImagePositionPatient` proiettato
   sull'orientamento (`ImageOrientationPatient`), con fallback su
   `SliceLocation`/`InstanceNumber` solo se documentato.
2. **Spacing** derivato da `PixelSpacing` e dalla distanza tra slice
   (non assumere spacing isotropo).
3. **Direzione** costruita da `ImageOrientationPatient` (due versori) e dal
   prodotto vettoriale; gestione dell'eventuale segno/`rescale`.
4. **Origin** = `ImagePositionPatient` della prima slice ordinata (in coordinate
   paziente, LPS).
5. **Gestione delle gap slice** irregolari: rilevare e segnalare, non
   interpolare silenziosamente.
6. **Rescale slope/intercept** applicati per ottenere valori in unità fisiche
   corrette.
7. **Validazione su phantom noti** (Fase 3, issue P3-06) prima di dichiarare
   corrette le MPR e le superfici 3D.

---

## 9. Requisiti funzionali per fase

La roadmap incrementale produce, a ogni fase, software funzionante e testabile.
Dettaglio operativo in [`docs/ROADMAP.md`](docs/ROADMAP.md) e nelle issue GitHub.

### Fase 0 — Ambiente e architettura

Deliverable: **ambiente Docker ARM64 riproducibile**.

- Scaffolding repository e documentazione di progetto (P0-01).
- Matrice di compatibilità e pinning dipendenze ARM64 (P0-02).
- Docker Compose: profili, limiti risorse, volumi, healthcheck, shutdown (P0-03).
- Container frontend React+TS+Vite dev / Nginx prod (P0-04).
- Container backend FastAPI+Uvicorn modulare (P0-05).
- Container AI PyTorch+MONAI CPU opzionale (P0-06).
- Servizio Orthanc opzionale — profilo `dicom` (P0-07).
- Tooling di sviluppo in Docker: Makefile, lint, format, typecheck, test (P0-08).
- CI GitHub Actions: build ARM64, lint, typecheck, test (P0-09).
- Configurazione ambiente, `.env.example`, gestione segreti (P0-10).

### Fase 1 — Fondamenta DICOM

Deliverable: **import e indicizzazione dataset reali**.

- Import DICOM: scansione ricorsiva e parsing DICOMDIR (P1-01).
- Raggruppamento Study/Series e classificazione delle serie (P1-02).
- Estrazione e normalizzazione dei metadati (P1-03).
- Motore geometrico: orientamento, ordinamento slice, validazione (P1-04).
- Costruzione volume NIfTI/NRRD con geometria preservata (P1-05).
- Schema SQLite, migrazioni e repository layer (P1-06).
- API di import e gestione studi/serie con job non bloccanti (P1-07).
- De-identificazione opzionale e sanitizzazione dei log (P1-08).
- Test DICOM: generatore sintetico, unit test, validazione delle 9 serie (P1-09).

### Fase 2 — DICOM Workstation

Deliverable: **viewer multi-viewport funzionante**.

- App shell e design system dark (P2-01).
- Integrazione Cornerstone3D e loader immagini (P2-02).
- Series explorer con thumbnail e categorizzazione (P2-03).
- Rendering dello stack e navigazione immagine (P2-04).
- Layout multi-viewport e sincronizzazione crosshair (P2-05).
- Strumenti di misura, annotazioni, etichette di orientamento (P2-06).
- Pannello metadati e controlli laterali (P2-07).
- Prestazioni frontend: lazy loading, disposal, cache limitate (P2-08).

### Fase 3 — MPR e 3D

Deliverable: **geometria spaziale verificata**.

- Servizio di preparazione volume e generazione MPR (P3-01).
- Viewer MPR con crosshair sincronizzati (P3-02).
- Integrazione VTK.js e scene manager 3D (P3-03).
- Volume rendering e surface reconstruction separati (P3-04).
- Export mesh (STL/OBJ/PLY) ed export volumi (NIfTI/NRRD) (P3-05).
- Validazione geometrica MPR e 3D su phantom noti (P3-06).

### Fase 4 — Segmentation Lab

Deliverable: **segmentazioni persistenti e allineate**.

- Modello dati segmentazione, storage NIfTI/NRRD, API CRUD (P4-01).
- Editing manuale: brush/eraser e maschera 3D (P4-02).
- Region growing, threshold, morfologia, interpolazione tra slice (P4-03).
- Undo/redo, visibilità, colori, label anatomiche (P4-04).
- Persistenza e validazione dell'allineamento spaziale (P4-05).
- Generazione della superficie 3D dalle maschere (P4-06).

### Fase 5 — AI Engine

Deliverable: **inferenza CPU modulare e misurabile** (servizio opzionale).

- Interfaccia model adapter e schema del model registry (P5-01).
- Model registry: storage, API, installazione con licenza (P5-02).
- Pipeline di inferenza CPU asincrona e memory-aware (P5-03).
- Primo adapter di modello e report di validazione (P5-04).
- Workflow di segmentazione AI-assistita nel frontend (P5-05).
- **Resilienza:** viewer operativo con servizio AI spento (P5-06).

### Fase 6 — Ricerca quantitativa

Deliverable: **metriche, esperimenti, export**.

- Motore di misura quantitativa (P6-01).
- Metriche di valutazione delle segmentazioni (P6-02).
- Experiment tracking: modello dati e API (P6-03).
- Radiomics come estensione opzionale (PyRadiomics) (P6-04).
- Export dei risultati di ricerca in CSV e JSON (P6-05).
- Research workspace UI (P6-06).

### Fase 7 — Ottimizzazione e release

Deliverable: **MRI Explorer 1.0**.

- Benchmark e profiling sul target M1 Pro (P7-01).
- Ottimizzazione caching e rendering guidata dai benchmark (P7-02).
- Validazione limiti risorse Docker e build ARM64 (P7-03).
- Backup, restore e verifica della persistenza (P7-04).
- Completamento documentazione e profilo Compose di produzione (P7-05).
- Release MRI Explorer 1.0 — checklist Definition of Done (P7-06).

---

## 10. Contratti API (panoramica)

L'API è esposta da `mri-api` (FastAPI) con documentazione OpenAPI automatica
(`/docs`). Aree principali:

| Area | Esempi di endpoint | Fase |
| ---- | ------------------ | ---- |
| Import | `POST /studies/import`, `GET /jobs/{id}` | 1 |
| Studi/Serie | `GET /studies`, `GET /series/{uid}` | 1 |
| Volumi | `POST /volumes`, `GET /volumes/{id}` | 1–3 |
| Segmentazioni | `GET/POST/PUT/DELETE /segmentations` | 4 |
| AI | `GET /models`, `POST /inference`, `GET /inference/{id}` | 5 |
| Misure/Metriche | `GET /measurements`, `GET /metrics` | 6 |
| Esperimenti | `GET/POST /experiments` | 6 |
| Export | `POST /exports` | 3–6 |

Convenzioni:

- Formato di interscambio **JSON**; i volumi/maschere via filesystem + riferimenti.
- Job asincroni non bloccanti con stato interrogabile.
- Errori con schema coerente (codice, messaggio, dettagli).
- Servizio AI raggiungibile via rete interna Compose; il frontend degrada in
  modo pulito se l'AI è spento.

---

## 11. AI Engine e model registry

- **Interfaccia `ModelAdapter`:** `load()`, `preprocess()`, `predict()`,
  `postprocess()`, con metadati (input/output shape, spacing atteso, label map).
- **Model registry:** catalogo versionato con nome, versione, license,
  checksum, adapter, requisiti di memoria.
- **Inferenza CPU:** asincrona, memory-aware, con limiti espliciti; nessuna
  dipendenza da GPU.
- **Deployment:** container separato (`mri-ai`, profilo `ai`), sostituibile con
  un backend GPU remoto in futuro senza modificare frontend/motore imaging.
- **Tracciabilità:** ogni output AI salvato con riferimento a modello+versione e
  parametri di inferenza.

---

## 12. Sicurezza e privacy

- Servizi esposti **solo su localhost**.
- **Nessun** dato DICOM verso l'esterno; **nessuna** inferenza cloud.
- **Nessuna** telemetria/analytics di default.
- **Nessun** dato reale di paziente, credenziale o segreto nel repository.
- De-identificazione DICOM **opzionale**; log **sanitizzati**.
- Segreti gestiti via `.env` (gitignored) e `.env.example` come template
  (Fase 0, P0-10).
- I file sotto `data/` e i pesi dei modelli **non** vengono mai versionati
  (garantito da `.gitignore`).

---

## 13. Budget di performance

Obiettivi iniziali (da validare/misurare in Fase 7):

| Metrica | Obiettivo |
| ------- | --------- |
| Avvio stack base (`default`) | < 60 s a container caldi |
| Prima immagine visibile | < 2 s dopo selezione serie |
| Navigazione stack (≥ 100 slice) | interazione fluida su CPU |
| Rendering MPR | aggiornamento crosshair senza stalli percettibili |
| Memoria container API | entro 1.5 GB |
| Memoria container AI | entro 4 GB |

I valori definitivi sono misurati sui benchmark P7-01 e documentati in
[`docs/VALIDATION.md`](docs/VALIDATION.md).

---

## 14. Testing e validazione

Strategia (dettaglio in [`docs/VALIDATION.md`](docs/VALIDATION.md)):

- **Unit test** per parsing, geometria, conversione volumi, API.
- **Test di geometria** su phantom sintetici con valori attesi noti.
- **Test end-to-end** sul dataset RM del ginocchio (9 serie).
- **Test di resilienza:** viewer operativo con `mri-ai` spento.
- **Test di persistenza:** restart dei container senza perdita di dati.
- **CI:** build ARM64 + lint + typecheck + test (Fase 0, P0-09).
- **Regola:** nessuna funzionalità dichiarata "fatta" senza test.

---

## 15. Definition of Done

Una fase è **Done** quando, cumulativamente:

1. Tutti i deliverable della fase sono implementati e tracciati.
2. I criteri di accettazione delle relative issue sono soddisfatti.
3. I test previsti passano in CI su `linux/arm64`.
4. Lint/format/typecheck passano senza errori.
5. La documentazione collegata è aggiornata (README, docs, PROJECT_STATUS).
6. Nessun PHI, segreto o peso di modello è tracciato nel repository.
7. I limiti di risorsa dichiarati sono rispettati o la deviazione è documentata.

La release 1.0 richiede inoltre il soddisfacimento esplicito della checklist DoD
(issue P7-06, milestone *Release 1.0*).

---

## 16. Convenzioni di progetto

- **Lingua documentazione/issue:** italiano. **Codice e identificatori:** inglese.
- **Struttura repository:**

  ```
  risonix/
  ├── apps/frontend/            # React + Cornerstone3D + VTK.js
  ├── services/api/             # FastAPI
  ├── services/ai/              # PyTorch + MONAI
  ├── packages/imaging-core/    # motore imaging condiviso (geometria, volumi)
  ├── packages/segmentation-core/ # modello e operazioni di segmentazione
  ├── packages/shared-types/    # tipi/contratti condivisi
  ├── infrastructure/docker/    # Dockerfile, compose, nginx
  ├── infrastructure/orthanc/   # configurazione Orthanc
  ├── data/                     # dati locali (gitignored, PHI)
  ├── scripts/
  ├── docs/
  └── MASTER_SPECIFICATION.md
  ```

- **Commit:** messaggi concisi e descrittivi; riferire la issue quando utile.
- **Documenti di governo:** aggiornati come parte dei deliverable, non a posteriori.

### 16.1 Ruolo dei documenti

| Documento | Ruolo |
| --------- | ----- |
| `MASTER_SPECIFICATION.md` | Specifica tecnica principale e vincolante |
| `docs/ARCHITECTURE.md` | Decisioni architetturali e motivazioni |
| `docs/ROADMAP.md` | Piano di sviluppo incrementale |
| `docs/DEPENDENCIES.md` | Registro dipendenze, versioni, licenze |
| `docs/VALIDATION.md` | Procedure di test e validazione |
| `PROJECT_STATUS.md` | Stato corrente, decisioni, funzionalità implementate |
| `PRODUCT.md` | Registro di prodotto: utenti, principi, accessibilità |
| `DESIGN.md` | Design system della workstation: token visivi, tipografia, componenti |
| `README.md` | Porta d'ingresso, visione e quickstart |

---

## 17. Rischi e decisioni aperte

| # | Tema | Stato | Note |
| - | ---- | ----- | ---- |
| R1 | Compatibilità ARM64 delle dipendenze (PyTorch, MONAI, SimpleITK) | **Chiuso** (P0-02) | Versioni validate e pinnate in `docs/DEPENDENCIES.md` |
| R2 | Memoria limitata (16 GB) con AI attiva | Aperto | Limiti per container + pipeline memory-aware |
| R3 | Performance rendering 3D su CPU | Aperto | Benchmark Fase 7 |
| R4 | Licenza del progetto | Aperto | Da definire in Fase 0 insieme alle licenze dipendenze |
| R5 | Gestione dataset PHI di riferimento | Aperto | Solo locale, mai versionato; de-identificazione opzionale |
| R6 | Necessità di Orthanc | Aperto | Import da filesystem come default; Orthanc opzionale |

---

## 18. Registro revisioni

| Versione | Data       | Modifica |
| -------- | ---------- | -------- |
| 1.0      | 2026-11-04 | Prima bozza completa dello scheletro e dei requisiti (Phase 0, P0-01) |
| 1.1      | 2026-11-04 | Matrice di compatibilità ARM64 e pinning dipendenze; R1 chiuso (P0-02) |

---

> **Disclaimer.** MRI Explorer è uno strumento per ricerca, formazione e analisi
> di immagini biomediche. Gli output AI e le misure derivate dalle immagini
> **non** costituiscono diagnosi cliniche validate e non devono essere usati per
> decisioni cliniche.
