# Validazione e test — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) — procedure in definizione |
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

Obiettivi di Fase 0 (issue P0-09 e P0-08), eseguiti su `linux/arm64`:

- Build delle immagini Docker.
- Lint (frontend e backend).
- Typecheck (TypeScript e Python).
- Test automatici.
- Verifica che **nessun PHI/segreto** entri nel repository (`git check-ignore`
  sui path sensibili, scansione segreti).

Pipeline considerata **bloccante**: un fallimento impedisce il merge.

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
