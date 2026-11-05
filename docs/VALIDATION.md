# Validazione e test — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Fase 1 (*DICOM Foundation*) — in corso |
| Ultima modifica | 2026-11-05 |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) |

Questo documento definisce **come si verifica** che il software sia corretto.
Le procedure vengono rese eseguibili man mano che le fasi avanzano. In Fase 0
si stabiliscono framework, criteri e soglie.

> **Regola.** Nessuna funzionalità è dichiarata *fatta* senza test. Ogni
> deliverable di fase deve avere evidenza di verifica (test automatici o
> procedura documentata con esito).

---

## 1. Livelli di test

| Livello | Ambito | Strumenti previsti |
| ------- | ------ | ------------------ |
| Unit | Parsing, geometria, conversioni, utility | `pytest` (Python), framework frontend TBD |
| Integration | API ↔ filesystem ↔ SQLite, job asincroni | `pytest` + client HTTP |
| Geometry | Correttezza spaziale su phantom sintetici | `pytest` + fixture DICOM sintetiche |
| End-to-end | Flusso completo sul dataset RM del ginocchio (9 serie) | test API + verifica viewer manuale/assistita |
| Resilience | Comportamento con servizi spenti | Docker Compose (profili) |
| Performance | Rispetto dei budget (§13 della specifica master) | benchmark P7-01 |
| Persistence | Sopravvivenza a restart e restore | procedure P7-04 |

---

## 2. Test di geometria (critici)

La geometria è validata con **phantom sintetici** a valori noti, prima di ogni
analisi di immagini reali.

| Proprietà | Cosa si verifica | Fase |
| --------- | ---------------- | ---- |
| Ordinamento slice | Sequenza corretta rispetto a `ImagePositionPatient`/normale | 1 |
| Spacing | Coerenza tra `PixelSpacing` e distanza inter-slice | 1 |
| Orientamento | Versori coerenti con `ImageOrientationPatient` | 1 |
| Origine | Corrispondenza con `ImagePositionPatient` della prima slice | 1 |
| Gap slice | Rilevamento di gap irregolari (nessuna interpolazione silenziosa) | 1 |
| Rescale | Applicazione di slope/intercept alle unità fisiche | 1 |
| Volume ↔ DICOM | Round-trip DICOM → NIfTI/NRRD → geometria conservata | 1 |
| MPR ↔ volume | Crosshair e piani coerenti con la geometria del volume | 3 |
| 3D ↔ volume | Superficie/mesh allineata al volume e alle misure | 3 |
| Segmentazione | Maschera allineata al volume di riferimento | 4 |

Criterio di accettazione: **tolleranze esplicite** (es. errore posizione ≤ 1e-3
mm sulle fixture sintetiche) definite all'implementazione della fase.

---

## 3. Dataset di riferimento

- **Primario:** esame **RM del ginocchio** con più serie (riferimento: 9 serie).
- I dati reali **non** entrano nel repository (solo locale, `data/` gitignored).
- Per i test automatici si usa un **generatore di DICOM sintetici** (issue
  P1-09), così che la CI sia riproducibile senza PHI.
- Il generatore vive in `services/api/tests/support/dicom_factory.py`
  (`generate_phantom`, `KNEE_PROTOCOL`): produce 9 serie MR a geometria nota,
  con posizioni avanzate esattamente lungo la normale, quindi spacing e
  orientamento sono riproducibili al bit.

---

## 4. Test di resilienza e persistenza

- **AI spento:** con profilo `ai` non attivo, il viewer e l'API restano
  operativi; le funzioni AI risultano non disponibili in modo esplicito e non
  bloccante (P5-06).
- **Restart:** dopo `docker compose restart`, metadati, volumi e segmentazioni
  restano coerenti (P7-04).
- **Backup/restore:** ripristino completo da backup di SQLite + `data/` (P7-04).

### 4.1 Verifica dell'ambiente Compose (P0-03)

| Verifica | Comando / criterio |
| -------- | ------------------ |
| Config valido per ogni profilo | `docker compose --profile <p> config -q` per `default`, `ai`, `dicom`, `full`, `prod` |
| Servizi attesi per profilo | `docker compose --profile <p> config --services` |
| Limiti applicati | `docker stats --no-stream` entro i budget §5 |
| Healthcheck | stato `healthy` per ogni servizio avviato |
| Persistenza | i file in `data/` sopravvivono a `docker compose restart` |
| AI non di default | `docker compose config --services` **non** include `mri-ai` |
| Nessun tag `latest` | scansione di `compose.yaml` e dei Dockerfile |

### 4.2 Verifica del servizio AI (P0-06)

| Verifica | Comando / criterio |
| -------- | ------------------ |
| Avvio opzionale | `docker compose --profile ai up -d mri-ai` → servizio su `127.0.0.1:8001` |
| Health | `curl -fsS http://127.0.0.1:8001/health` risponde `200` con `status=ok` |
| Registry senza pesi | `GET /api/models` elenca gli adapter con `loaded=false`; nessun download automatico |
| Import ML lazy | l'avvio non importa `torch`/`monai` (import confinati in `ModelAdapter.load`) |
| Memoria a riposo | valore in `/health` (`memory_mb`) e `docker stats --no-stream` |
| Limite | `docker stats` entro **4 GB** / 4 CPU (budget §5) |

**Consumo a riposo (misura 2026-11-05).** Processo `uvicorn app.main:app` senza
pesi caricati: **~46 MiB** (`memory_mb≈46`, RSS ~44 MiB). Poiché `torch`/`monai`
non sono importati all'avvio, il footprint a riposo coincide con la baseline
Python/FastAPI; il picco si misura solo al caricamento di un modello (Fase 5).
Valore da riconfermare con `docker stats` al primo build ARM64 dell'immagine.

### 4.3 Verifica del servizio Orthanc (P0-07)

| Verifica | Comando / criterio |
| -------- | ------------------ |
| Avvio opzionale | `docker compose --profile dicom up -d orthanc` → HTTP su `127.0.0.1:8042` |
| Non di default | `docker compose config --services` (profilo `default`) **non** include `orthanc` |
| Health | `curl -fsS -u orthanc:orthanc http://localhost:8042/system` risponde `200` |
| Autenticazione | la stessa richiesta **senza** credenziali risponde `401` |
| DICOMweb | `GET /dicom-web/studies` risponde in JSON (`Accept: application/dicom+json`) |
| Persistenza | uno studio importato resta leggibile dopo `docker compose restart orthanc` |
| Config locale | `orthanc.json` montato in sola lettura; gli override `ORTHANC__*` hanno precedenza |

### 4.4 Verifica di configurazione e segreti (P0-10)

| Verifica | Comando / criterio |
| -------- | ------------------ |
| Avvio con `.env` assente | lo stack parte con i default sicuri (`MRI_BIND_ADDR=127.0.0.1`, log `info`/`json`) |
| Validazione fail-fast | `MRI_LOG_FORMAT=xml` / `MRI_LOG_LEVEL=verbose` impediscono l'avvio con errore esplicito |
| Normalizzazione | `MRI_LOG_LEVEL=DEBUG` → livello `debug` |
| Copertura variabili | ogni `${...}` di `compose.yaml` è documentata in `.env.example` e `docs/CONFIGURATION.md` |
| Binding | tutte le porte pubblicate su `127.0.0.1` (verifica su `docker compose config`) |
| Nessun segreto committato | `.gitignore` esclude `.env`/`*.key`; scansione segreti in CI (P0-09) |
| Nessun segreto nei log | i log strutturati non includono valori di configurazione sensibili |

---

## 5. Budget di performance e misure

Riferimento: §13 della specifica master. Le soglie iniziali sono **obiettivi**;
i valori definitivi sono misurati in Fase 7 (P7-01) e aggiornati qui.

| Metrica | Obiettivo |
| ------- | --------- |
| Avvio stack base | < 60 s a container caldi |
| Prima immagine visibile | < 2 s |
| Navigazione stack (≥ 100 slice) | fluida su CPU |
| Memoria API | entro 1.5 GB |
| Memoria AI | entro 4 GB |

---

## 6. CI e qualità del codice

Obiettivi di Fase 0 (issue P0-09 e P0-08), eseguiti su `linux/arm64`. Gli stessi
comandi sono disponibili in locale via `Makefile` (vedi
[`docs/DEVELOPMENT.md`](DEVELOPMENT.md)):

| Controllo | Comando locale | In CI |
| --------- | -------------- | ----- |
| Lint | `make lint` | riusato |
| Typecheck | `make typecheck` | riusato |
| Test | `make test` | riusato |
| Compose | `make config` | riusato |
| Build immagini | `make up` / buildx | workflow dedicato |

La pipeline è considerata **bloccante**: un fallimento impedisce il merge.

---

## 7. Checklist di accettazione (per fase)

Prima di chiudere una fase:

- [ ] Tutte le issue della fase: criteri di accettazione soddisfatti
- [ ] Test unit/integration/geometry verdi
- [ ] Build ARM64 verde
- [ ] Lint + typecheck verdi
- [ ] Documentazione aggiornata (README, docs, `PROJECT_STATUS.md`)
- [ ] Nessun PHI/segreto/peso tracciato
- [ ] Limiti di risorsa rispettati o deviazione documentata

---

## 8. Validazione Fase 1 — DICOM Foundation (P1-09)

### 8.1 Phantom sintetico a geometria nota

`generate_phantom(root, plans=KNEE_PROTOCOL)` scrive un esame RM del ginocchio
sintetico con **9 serie** in `root`, una cartella per serie. Ogni slice è
posizionata a `origin + normal · slice_spacing · i`, così la geometria attesa non
dipende da `InstanceNumber` né dal nome file.

| # | Serie | Piano | Slice | Spacing through-plane |
| - | ----- | ----- | ----- | --------------------- |
| 1 | Localizer | assiale | 3 | 4.0 mm |
| 2 | Sag PD FS | sagittale | 5 | 3.5 mm |
| 3 | Sag T2 | sagittale | 5 | 3.5 mm |
| 4 | Sag T1 | sagittale | 5 | 3.5 mm |
| 5 | Cor PD FS | coronale | 5 | 3.5 mm |
| 6 | Cor T2 | coronale | 5 | 3.5 mm |
| 7 | Ax PD FS | assiale | 5 | 4.0 mm |
| 8 | Ax T2 | assiale | 5 | 4.0 mm |
| 9 | 3D Sag T1 | sagittale | 6 | 2.0 mm |

In-plane: `PixelSpacing` 0.5 × 0.5 mm, griglia 8 × 8.

### 8.2 Cosa copre la suite

| Ambito | Test | File |
| ------ | ---- | ---- |
| Scansione / DICOMDIR / ZIP | P1-01 | `tests/dicom/test_scanner.py` |
| Raggruppamento e classificazione | P1-02 | `tests/dicom/test_study.py` |
| Metadati e rescale | P1-03 | `tests/dicom/test_metadata.py` |
| Ordinamento, spacing, gap, orientamento | P1-04 | `tests/dicom/test_geometry.py` |
| Volume NIfTI/NRRD e provenienza | P1-05 | `tests/dicom/test_volume.py` |
| **Phantom 9 serie (grouping, geometria, volumi)** | **P1-09** | **`tests/dicom/test_phantom.py`** |
| Import API end-to-end | P1-07 | `tests/api/test_import_api.py` |
| **Import end-to-end del phantom 9 serie** | **P1-09** | **`tests/api/test_e2e_import.py`** |
| Job runner asincrono | P1-07 | `tests/jobs/test_runner.py` |
| Import service (DB + volumi) | P1-07 | `tests/services/test_import_service.py` |
| De-identificazione e sanitizzazione log | P1-08 | `tests/dicom/test_deident.py`, `tests/test_sanitize.py` |

L'import end-to-end del phantom verifica: **1 studio, 9 serie immagine, 9
volumi** (uno per serie), `slice_index` contiguo `0…n-1` per ogni serie e
coerenza `shape[2] == instance_count`.

### 8.3 Dataset reale (opzionale)

Il dataset clinico non è nel repository. Per validarlo in locale:

```bash
# con il dataset posizionato in una directory accessibile:
MRI_VALIDATION_DATASET=/percorso/al/dataset MRI_VALIDATION_EXPECTED_SERIES=9 \
  docker compose -f compose.tools.yaml run --rm api-tools pytest tests/test_real_dataset.py
```

Il test `tests/test_real_dataset.py` viene **saltato** quando
`MRI_VALIDATION_DATASET` non è impostata; quando presente, verifica che lo studio
si raggruppi in 9 serie immagine e che ogni serie abbia geometria determinabile
(ordinamento completo e normale non nulla).

### 8.4 Esito

Tutta la suite (`make api-test`) è verde in Docker: **110 test passati, 1
saltato** (validazione dataset reale, §8.3), coprendo parser, raggruppamento,
metadati, geometria, volumi, persistenza, API, job, de-identificazione, la
validazione del phantom 9 serie e l'API dei volumi di Fase 3 (§10). La
validazione sul dataset reale resta una procedura manuale opzionale (§8.3), da
ripetere quando il dataset è disponibile.

---

## 9. Validazione Fase 2 — DICOM Workstation (P2-02…P2-08)

### 9.1 Endpoint del file DICOM (P2-02)

`GET /api/instances/{id}/file` restituisce il file DICOM P10 originale (pixel
inclusi) confinato nella data dir, con `Content-Type: application/dicom`. È il
supporto dello schema `wadouri` di Cornerstone3D.

| Caso | Atteso | Test (`tests/api/test_import_api.py`) |
| ---- | ------ | ------------------------------------- |
| Istanza indicizzata | `200`, magic `DICM` a offset 128 | `test_instance_file_returns_original_dicom` |
| Istanza inesistente | `404` | `test_unknown_instance_file_returns_404` |
| Preflight CORS dall'origin dev | `200` + `Access-Control-Allow-Origin` | `test_cors_allows_dev_origin` |

### 9.2 Viewer stack, navigazione e controlli di vista (P2-02/P2-04)

Cornerstone3D (`@cornerstonejs/*@5.15.2`, VTK.js `36.4.1`) è inizializzato una
sola volta (`ensureCornerstone`). Il viewport collega lo schema `wadouri` a
`GET /api/instances/{id}/file` e disegna la slice centrale della serie.

- Navigazione slice con rotellina, frecce, `Home`/`End` e slider.
- Rotazione a passi di 90°, inversione dei toni, `reset view` e `fit to viewport`
  applicati in modo coordinato a tutte le viewport.
- Coordinate fisiche (mm, spazio paziente) mostrate a schermo senza re-render
  React (scrittura diretta nel DOM sul mouse move).
- Errori di rendering mostrati a overlay; risorse rilasciate allo smontaggio
  (rendering engine e tool group disabilitati).

Verifica manuale con dataset reale importato:

```bash
docker compose up -d --build
# import (una volta): POST /api/studies/import  {"source_path":"DICOMDIR"}
# aprire http://localhost:5173 → la serie viene renderizzata nel viewport
```

### 9.3 Series explorer e categorizzazione (P2-03)

Lo `SeriesExplorer` elenca studi e serie con miniatura (lazy) e metadati. La
categoria (`Immagini` / `Localizer` / `Report` / `Altro`) è calcolata **senza
usare `SeriesDescription`** (geometria + modality) ed è **correggibile a mano**;
l'override è persistito per `SeriesInstanceUID` e influenza l'apribilità della
serie.

### 9.4 Layout multi-viewport e sincronizzazione (P2-05)

Layout `1x1`, `2x1` (2H), `1x2` (2V) e `2x2`, persistito in `localStorage`. Le
viewport dello stesso `FrameOfReferenceUID` condividono crosshair e navigazione:
il cursore e il cambio slice allineano le altre viste (anche ortogonali) al punto
3D condiviso; zoom/pan e finestra/livello sono sincronizzati via sincronizzatori
Cornerstone.

### 9.5 Misure, annotazioni e orientamento (P2-06)

Strumenti: lunghezza, angolo, polilinea concatenata, mano libera e sonda-sfera.
Le misure usano lo spacing reale di Cornerstone; sono modificabili, etichettabili
(nota) e cancellabili (anche da tastiera, `Canc`/`Backspace`). Le etichette di
orientamento L/R, A/P, S/I sono derivate dai vettori di camera.

### 9.6 Pannello proprietà (P2-07)

La sidebar destra mostra i metadati della serie selezionata, la slice corrente
(aggiornata durante la navigazione via evento di cambio slice) e una sezione
predisposta per la segmentazione (Fase 4). Nessuna PHI superflua in chiaro.

### 9.7 Prestazioni e baseline (P2-08)

- **Lazy loading**: Cornerstone3D è fuori dal bundle iniziale; `ViewportGrid`,
  `SeriesThumbnail` e gli hook di diagnostica sono importati dinamicamente.
- **Progressive loading**: prefetch con priorità bassa delle 2 slice adiacenti.
- **Cache limitata**: `cache.setMaxCacheSize(768)` MB.
- **Re-render ridotti**: le coordinate del cursore non passano dallo stato React.

Baseline di build misurata (`npm run build`, 2026-11-05):

| Asset | Dimensione | gzip |
| ----- | ---------- | ---- |
| Entry `index-*.js` | ~480 kB | ~142 kB |
| CSS | ~21 kB | ~4 kB |
| Chunk async `init-*.js` (Cornerstone/VTK) | ~3.590 MB | ~979 kB |
| Chunk async `engine-*.js` | ~118 kB | ~35 kB |

Prima del code-splitting l'entry era ~4.209 kB; la baseline di memoria/FPS sul
target M1 Pro sarà raccolta in P7-01.

### 9.8 Qualità

`make frontend-lint frontend-typecheck` e `npm run build` (in `frontend-tools`)
sono verdi; la CI esegue `npm ci` sul lockfile aggiornato e la suite API
(`make api-test`) resta verde.

---

## 10. Validazione Fase 3 — MPR & 3D (P3-01…)

### 10.1 Servizio volumi e base volume client (P3-01)

Il router `/api/volumes` espone i volumi derivati costruiti dal builder (P1-05),
senza alcun resampling MPR lato server.

| Caso | Atteso | Test (`tests/api/test_volumes_api.py`) |
| ---- | ------ | ------------------------------------- |
| Elenco e filtro per serie | `200`, volumi della serie | `test_list_and_filter_volumes` |
| Dettaglio con geometria completa | `shape`, `spacing`, `affine_lps` 4×4 | `test_get_volume_detail_exposes_affine` |
| Download NIfTI | `200`, `application/gzip`, magic `1f 8b` | `test_download_nifti_volume` |
| Download NRRD | `200`, header `NRRD` | `test_download_nrrd_volume` |
| Volume inesistente | `404` | `test_unknown_volume_returns_404` |

Lato client `cornerstone/volume.ts` costruisce il volume **streaming** dagli
stessi `imageId` dello stack (`createAndCacheVolume`): la geometria (spacing,
origine, orientamento LPS) è per costruzione quella del volume su disco. In
P3-01 il volume non viene aggiunto alle viewport, così il rendering a stack
resta invariato; `addVolumesToViewports` è predisposto per il viewer MPR
(P3-02) e lo spacing anisotropo è segnalato nel pannello proprietà.

**Limite noto.** Il download NIfTI/NRRD è esposto dall'API come artefatto di
interoperabilità (e fallback del file su disco), ma il *parsing* NIfTI lato
client non è ancora disponibile: le dipendenze correnti (Cornerstone3D, VTK.js)
non includono un volume loader NIfTI. Il percorso primario resta lo streaming
dagli imageId; l'eventuale caricamento NIfTI è rimandato a quando servirà
(vedi R5 in [`PROJECT_STATUS.md`](../PROJECT_STATUS.md#4-decisioni-aperte)).

La verifica geometrica puntuale (MPR ↔ coordinate mondo, mesh ↔ volume) è
demandata a P3-06 su phantom noto.

