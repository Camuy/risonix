# Configurazione e segreti — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) |
| Ultima modifica | 2026-11-05 |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (D8) |

Questo documento descrive **come si configura** lo stack tramite variabili
d'ambiente e **come si gestiscono i segreti**. Il modello di minaccia assume
**uso locale**: i servizi sono esposti solo su `localhost`, senza telemetria.

---

## 1. File `.env`

- `cp .env.example .env` crea la configurazione locale.
- `.env` **non** è versionato (regola in `.gitignore`); `.env.example` sì.
- Il progetto deve partire con un `.env` **assente o vuoto** applicando i
  default sicuri (bind su `127.0.0.1`, log `info`, formato `json`).
- I valori di esempio in `.env.example` **non** sono segreti reali.

---

## 2. Variabili

| Variabile | Default | Ambito | Descrizione |
| --------- | ------- | ------ | ----------- |
| `COMPOSE_PROFILES` | `default` | Compose | Profilo attivo per `docker compose up` senza `--profile`. |
| `MRI_ENV` | `development` | API/AI | Ambiente logico (`development`/`staging`/`production`). |
| `MRI_LOG_LEVEL` | `info` | API/AI | `critical`/`error`/`warning`/`info`/`debug` (normalizzato). |
| `MRI_LOG_FORMAT` | `json` | API/AI | `json` (strutturato) oppure `text`. |
| `MRI_DEIDENTIFY` | `false` | API | De-identifica i PHI: scrive copie ripulite in `data/derived` (vedi §7). |
| `MRI_DEIDENTIFY_SALT` | `risonix` | API | Salt per la pseudonimizzazione/rimappatura degli UID. |
| `MRI_DEIDENTIFY_REMAP_UIDS` | `false` | API | Rimappa Study/Series/SOP Instance UID nelle copie de-identificate. |
| `MRI_BIND_ADDR` | `127.0.0.1` | Compose | Indirizzo di bind dei servizi (vedi §3). |
| `MRI_FRONTEND_PORT` | `5173` | Compose | Porta host del frontend (dev). |
| `MRI_FRONTEND_PROD_PORT` | `3000` | Compose | Porta host del frontend (prod). |
| `MRI_API_PORT` | `8000` | Compose | Porta host dell'API. |
| `MRI_AI_PORT` | `8001` | Compose | Porta host del servizio AI. |
| `MRI_ORTHANC_HTTP_PORT` | `8042` | Compose | Porta host HTTP/DICOMweb di Orthanc. |
| `MRI_ORTHANC_DICOM_PORT` | `4242` | Compose | Porta host DICOM di Orthanc. |
| `MRI_PROXY_PORT` | `80` | Compose | Porta host del reverse proxy (profilo `prod`). |
| `MRI_API_PUBLIC_URL` | `http://localhost:8000` | Frontend | URL dell'API visto dal browser. |
| `MRI_CORS_ORIGINS` | `["http://localhost:5173","http://127.0.0.1:5173"]` | API | Origin browser ammessi (JSON); in prod same-origin via Nginx, lista vuota. |
| `MRI_ORTHANC_USER` | `orthanc` | Orthanc | Utente HTTP (segreto, vedi §4). |
| `MRI_ORTHANC_PASSWORD` | `orthanc` | Orthanc | Password HTTP (segreto, vedi §4). |

Variabili **interne** impostate da `compose.yaml` (non da `.env`): `MRI_DATA_DIR`,
`MRI_DB_PATH` (API) e `MRI_MODELS_DIR` (AI), `OMP_NUM_THREADS` (AI).

I servizi applicativi leggono **solo** variabili con prefisso `MRI_`
(`Settings` di Pydantic); variabili con prefisso diverso sono ignorate.

> Nota profili: passando `--profile` da riga di comando il valore di
> `COMPOSE_PROFILES` viene **ignorato** (non è un'unione). Per profili additivi
> usare più `--profile` (es. `--profile default --profile ai`).

---

## 3. Binding e rete

- Tutti i servizi pubblicano le porte **solo** su `MRI_BIND_ADDR`
  (default `127.0.0.1`): nessuna esposizione sulla rete locale (D8).
- **Non** impostare `MRI_BIND_ADDR=0.0.0.0` in uso normale.
- Nessuna telemetria/analytics; nessuna inferenza cloud.

---

## 4. Segreti

- I segreti stanno **solo** in `.env` (gitignored) o in variabili d'ambiente,
  mai nel repository, nelle immagini o nei log.
- Orthanc: `MRI_ORTHANC_USER`/`MRI_ORTHANC_PASSWORD`; cambiare i default
  `orthanc`/`orthanc` fuori dall'ambiente locale.
- `ORTHANC__REGISTERED_USERS` è costruito da Compose a partire da queste
  variabili; non duplicare le credenziali altrove.
- `AuthenticationEnabled=true` e `RemoteAccessAllowed=false` restano attivi.
- `.gitignore` esclude `.env`, `.env.*` (tranne `.env.example`), `*.pem`,
  `*.key`, `secrets/`.

---

## 5. Validazione all'avvio

- Ogni servizio valida la configurazione **all'avvio** (fail-fast): un valore
  non ammesso interrompe l'avvio con un errore esplicito.
  - `MRI_LOG_LEVEL` deve appartenere all'insieme ammesso (case-insensitive).
  - `MRI_LOG_FORMAT` è `Literal["json", "text"]`.
- I log strutturati includono timestamp, livello, logger e messaggio, **senza**
  valori di configurazione sensibili.

---

## 6. Database, migrazioni e backup

- Il database SQLite vive in `MRI_DB_PATH` (default `/data/database/mri.sqlite3`).
  Contiene **solo metadati e riferimenti**: nessun array immagine.
- Lo schema è gestito da **Alembic**. Le migrazioni si trovano in
  `services/api/migrations/` e si applicano da zero con:

  ```sh
  docker compose -f compose.tools.yaml run --rm api-tools \
    alembic -c services/api/alembic.ini upgrade head
  ```

  In alternativa, dal codice: `from app.db.migrate import upgrade_to_head`, poi
  `upgrade_to_head(settings.db_path)`.
- **Backup di base**: `app.db.backup.backup_database(db_path)` crea una copia
  consistente (anche a database in uso) in `data/database/backups/`, con
  timestamp UTC nel nome. Il ripristino avviene sostituendo il file a servizio
  fermo. La rotazione è manuale: nessuna cancellazione automatica.

---

## 7. De-identificazione e sanitizzazione dei log

La de-identificazione è **opzionale** e **non modifica mai gli originali**: legge
i DICOM e scrive **copie derivate** ripulite in `data/derived/deidentified/`.

- Attivazione di default con `MRI_DEIDENTIFY=true`, oppure per singola richiesta
  di import (`POST /api/studies/import` con `"deidentify": true|false`); il campo
  richiesta ha precedenza sull'impostazione del servizio.
- La copia rimuove i tag PHI più comuni (identità paziente, date/indirizzi,
  medici e istituzioni, numeri di accesso) e sostituisce `PatientName`/`PatientID`
  con un segnaposto; imposta `PatientIdentityRemoved` e `DeidentificationMethod`.
- `MRI_DEIDENTIFY_REMAP_UIDS=true` rende gli UID pseudonimi in modo
  **deterministico** (stesso input → stesso UID), preservando i riferimenti
  incrociati senza esporre gli identificatori originali. `MRI_DEIDENTIFY_SALT`
  è il salt usato.
- La sanitizzazione dei log (`app.core.sanitize`) redige i valori associati a
  chiavi PHI note e un filtro (`PhiRedactionFilter`) è applicato a ogni handler di
  logging: nessun valore identificativo viene emesso, nemmeno nei messaggi di
  debug strutturati.

> La de-identificazione copre il profilo *Basic Application Level
> Confidentiality* ma non è esaustiva: prima di condividere dati fuori
> dall'ambiente locale va eseguita una verifica dedicata.
