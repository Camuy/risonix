# Architettura — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) |
| Ultima modifica | 2026-11-04 |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) |

Questo documento raccoglie le **decisioni architetturali** e le loro
motivazioni. Ogni decisione è numerata (ADR informali) e può essere superata da
una decisione successiva, purché motivata.

---

## 1. Vincoli di progetto che guidano l'architettura

- Host: **MacBook Pro M1 Pro**, 16 GB RAM, `linux/arm64`.
- **Solo Docker Desktop** come prerequisito applicativo; nessuna installazione
  nativa di Python/Node/PyTorch/SimpleITK.
- **Nessun accesso GPU/MPS** dai container Linux: inferenza su **CPU**.
- **Dati in locale**, nessun servizio esterno, nessuna telemetria.
- **Geometria DICOM** come requisito di prima classe.
- Modularità: il servizio AI è **opzionale** e **sostituibile**.

---

## 2. Decisioni architetturali

### D1 — Servizi indipendenti orchestrati con Docker Compose

**Decisione.** L'applicazione è composta da container separati (`mri-frontend`,
`mri-api`, `mri-ai`, `orthanc`, `nginx`), orchestrati con Docker Compose e
attivabili tramite profili.

**Motivazione.** Isolamento delle responsabilità, riproducibilità, possibilità
di spegnere l'AI mantenendo la piattaforma operativa, sostituzione futura del
backend AI con un nodo GPU remoto senza toccare frontend o motore imaging.

**Conseguenze.** Necessità di gestire networking interno, volumi condivisi e
healthcheck; i profili Compose diventano parte del contratto operativo.

### D2 — `linux/arm64` obbligatoria

**Decisione.** Tutte le immagini sono costruite per `linux/arm64`. Emulazione
QEMU ammessa solo se giustificata e misurata.

**Motivazione.** Performance native su Apple Silicon; l'emulazione degrada
fortemente e falsa le misure.

**Conseguenze.** Pinning e validazione delle dipendenze ARM64 (vedi
[`DEPENDENCIES.md`](DEPENDENCIES.md)).

### D3 — Separazione netta tra metadati e dati

**Decisione.** SQLite conserva **solo metadati e riferimenti**; file DICOM,
volumi e maschere restano su **filesystem** sotto `data/`.

**Motivazione.** I volumi biomedicali sono grandi; un database relazionale non è
adatto a contenerli. La separazione riduce il rischio di duplicazione e
semplifica backup/restore.

**Conseguenze.** Il repository layer gestisce path e stati; backup e restore
riguardano sia SQLite sia il filesystem (Fase 7, P7-04).

### D4 — Import da filesystem, Orthanc opzionale

**Decisione.** Il flusso di import di default è da filesystem (DICOMDIR +
scansione ricorsiva). Orthanc è un profilo opzionale (`dicom`).

**Motivazione.** Riduce la complessità minima per iniziare e la dipendenza da
infrastruttura DICOM; Orthanc resta disponibile per flussi DICOMweb / Q&R.

**Conseguenze.** Il core DICOM deve funzionare senza Orthanc.

### D5 — Inferenza AI su CPU, asincrona e memory-aware

**Decisione.** Il servizio `mri-ai` (PyTorch + MONAI) esegue inferenza su CPU,
in modo asincrono, con limiti di memoria espliciti. Non parte di default.

**Motivazione.** Assenza di GPU nei container Linux su macOS; necessità di non
saturale i 16 GB.

**Conseguenze.** Le pipeline devono gestire job non bloccanti e degradare in
modo pulito se l'AI è spenta (P5-06).

### D6 — Geometria DICOM validata prima di ogni AI

**Decisione.** Ordinamento slice, spacing, orientamento e origine sono
calcolati e **validati** (anche su phantom) prima di qualsiasi elaborazione AI
o di ricostruzione 3D.

**Motivazione.** Un errore geometrico invalida ogni misura e ogni output a
valle. È la classe di bug più grave nel imaging biomedicale.

**Conseguenze.** Modulo dedicato nel `imaging-core` e test di geometria
obbligatori (Fase 1 P1-04, Fase 3 P3-06).

### D7 — Motore di imaging anatomia-agnostico

**Decisione.** Il core (`packages/imaging-core`) non conosce l'anatomia. Le
funzionalità specifiche (ginocchio, spalla, …) sono moduli/estensioni.

**Motivazione.** Riuso, testabilità, estendibilità ad altri distretti senza
riscrivere il motore.

### D8 — Sicurezza per costruzione

**Decisione.** Esposizione solo su localhost, nessun dato verso l'esterno,
nessuna telemetria, segreti via `.env`, dati/PHI e pesi mai versionati.

**Motivazione.** Requisito scientifico e di privacy.

---

## 3. Vista dei componenti

```
┌──────────────────────────────────────────────────────────────────────┐
│                            Host macOS (M1 Pro)                         │
│                                                                        │
│  ┌──────────────┐     ┌────────────────┐     ┌────────────────────┐    │
│  │ mri-frontend │────►│     mri-api    │────►│      SQLite        │    │
│  │ React / CS3D │ REST│    FastAPI     │     │  (metadati/rif.)   │    │
│  │   / VTK.js   │◄────│  Uvicorn       │     └────────────────────┘    │
│  └──────────────┘     └───────┬────────┘                               │
│         ▲                     │                                         │
│         │             ┌───────▼────────┐      ┌────────────────────┐   │
│         │             │  filesystem    │      │      mri-ai        │   │
│         │             │  data/ (PHI)   │      │  PyTorch + MONAI   │   │
│         │             └───────┬────────┘      │   (profilo: ai)    │   │
│         │                     │               └─────────▲──────────┘   │
│         │             ┌───────▼────────┐                │              │
│         │             │    orthanc     │────────────────┘              │
│         │             │  (profilo:dicom)│                              │
│         ▼             └────────────────┘                               │
│  ┌─────────────────────────┐                                           │
│  │ nginx (profilo: prod)   │                                           │
│  └─────────────────────────┘                                           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Profili Compose e lifecycle

| Profilo | Servizi | Uso |
| ------- | ------- | --- |
| `default` | frontend + api | Sviluppo e uso base |
| `ai` | + ai | Segmentazione/analisi AI |
| `dicom` | + orthanc | Flussi DICOMweb/Q&R |
| `full` | default + ai + dicom | Tutto tranne prod |
| `prod` | frontend (Nginx) + api + nginx | Deployment locale di produzione |

Healthcheck, limiti di risorsa e policy di shutdown sono definiti in
[`compose.yaml`](../compose.yaml) (issue P0-03) e verificati in Fase 7 (P7-03).
Il profilo attivo del comando senza `--profile` è impostato da
`COMPOSE_PROFILES` in `.env` (default: `default`); passando `--profile` da riga
di comando `COMPOSE_PROFILES` viene ignorato (semantica di Docker Compose).

---

## 5. Evoluzioni previste

- Backend AI spostabile su **server GPU esterno** via configurazione, senza
  modificare frontend o motore imaging.
- Estensioni anatomiche come **moduli** sopra `imaging-core`.
- Radiomics come **estensione opzionale** (PyRadiomics, Fase 6).

---

## 6. Decisioni aperte

Vedi la tabella *Rischi e decisioni aperte* in
[`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md#17-rischi-e-decisioni-aperte):
licenza del progetto, validazione ARM64, budget di memoria con AI attiva.
