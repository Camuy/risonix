# Dipendenze, versioni e licenze — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) — **versioni pinnate, compatibilità ARM64 validata** |
| Ultima modifica | 2026-11-04 |
| Validazione ARM64 | 2026-11-04 (P0-02) |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) |

Questo documento è il **registro unico** delle dipendenze del progetto. Le
versioni esatte sono state **validate per `linux/arm64`** e **pinnate** nella
issue **P0-02**; il pinning chiude il rischio **R1**.

> **Regola.** Nessuna dipendenza entra in produzione senza: (1) compatibilità
> ARM64 verificata, (2) versione pinnata, (3) licenza registrata. La licenza del
> progetto è ancora **da definire** (vedi §7).
>
> **Vietato `latest`.** Nessuna immagine o pacchetto usa il tag `latest` nel
> codice o nei manifesti. Le build di produzione usano **digest** (§9).

---

## 1. Come leggere le tabelle

| Colonna | Significato |
| ------- | ----------- |
| Componente | Nome del pacchetto/immagine |
| Ruolo | Perché è usato |
| Versione | Versione pinnata |
| ARM64 | Evidenza/forma della distribuzione arm64 |
| Licenza | Licenza dichiarata a monte (da confermare alla fonte) |
| Note | Rischi, vincoli, alternative |

Le licenze sono riportate **a titolo indicativo** e vanno confermate alla fonte
ufficiale prima del rilascio. La colonna **ARM64** distingue: `multi-arch`
(immagine o package con variante arm64), `wheel aarch64`, `pure-python`
(`py3-none-any`, indipendente dall'architettura).

**Metodo di validazione.** Disponibilità verificata alla data indicata sui
registri ufficiali (PyPI JSON API, npm registry, Docker Hub / `docker manifest`).

---

## 2. Runtime e base images

| Componente | Ruolo | Versione | ARM64 | Licenza | Note |
| ---------- | ----- | -------- | ----- | ------- | ---- |
| Docker Desktop | Runtime container su macOS | ≥ 4.30 | host arm64 | Proprietaria (tool di sviluppo) | Unico prerequisito applicativo |
| `python` | Base backend/AI | `3.12.16-slim-bookworm` | multi-arch | PSF | Digest arm64 §9 |
| `node` | Base frontend (build/dev) | `24.22.2-slim` | multi-arch | MIT | Node 24 LTS (*Krypton*) |
| `nginx` | Base frontend prod / reverse proxy | `1.30.6-alpine` | multi-arch | BSD-2-Clause | Branch *stable* |
| `orthancteam/orthanc` | Archivio DICOM (opzionale) | `26.9.1` | multi-arch (amd64+arm64) | AGPL-3.0 (Orthanc) | Profilo `dicom`; vedi §8 |

> **Nota su Node.** Il runtime è **Node 24 LTS**, non `latest`: Vite 8 richiede
> `node ^20.19 || >=22.12` ed ESLint 10 richiede `^20.19 || ^22.13 || >=24`; la
> 24 LTS soddisfa entrambi con margine.

> **Nota su Python.** **Python 3.12** è il minimo comune denominatore: PyTorch
> 2.15 richiede `>=3.11`, MONAI `>=3.10`, FastAPI/pydicom/NiBabel `>=3.10` e le
> wheel arm64 di SciPy/scikit-image/pandas sono presenti per `cp312`.

---

## 3. Frontend

| Componente | Ruolo | Versione | ARM64 | Licenza | Note |
| ---------- | ----- | -------- | ----- | ------- | ---- |
| React | UI | `19.3.1` | pure JS | MIT | |
| React DOM | Rendering | `19.3.1` | pure JS | MIT | Stessa minor di React |
| TypeScript | Tipizzazione | `6.0.3` | pure JS | Apache-2.0 | **Non 7.x**: vedi §5 |
| Vite | Build/dev server | `8.3.5` | pure JS | MIT | |
| `@vitejs/plugin-react` | Plugin React per Vite | `6.2.1` | pure JS | MIT | Richiede Vite ^8 |
| Cornerstone3D (`@cornerstonejs/core`) | Rendering DICOM | `5.15.2` | pure JS | MIT | |
| Cornerstone3D (`@cornerstonejs/tools`) | Strumenti | `5.15.2` | pure JS | MIT | |
| Cornerstone3D (`@cornerstonejs/dicom-image-loader`) | Decodifica | `5.15.2` | pure JS + wasm | MIT | Codec wasm inclusi |
| VTK.js (`@kitware/vtk.js`) | Rendering 3D | `36.4.1` | pure JS | BSD-3-Clause | **Non 38.x**: vedi §5 |
| ESLint | Lint | `10.14.0` | pure JS | MIT | Dev-only |
| `typescript-eslint` | Regole TS | `8.72.1` | pure JS | MIT | Dev-only |
| Prettier | Format | `3.9.10` | pure JS | MIT | Dev-only |

> **Regola Cornerstone3D/VTK.js.** `@cornerstonejs/tools@5.15.2` dichiara
> come peer dependency **`@kitware/vtk.js@36.4.1`** (pin esatto). L'ultima 38.x
> è **incompatibile** a parità di Cornerstone3D: tutti i pacchetti
> `@cornerstonejs/*` restano sulla stessa versione (5.15.2) e VTK.js è fissato a
> `36.4.1` fino a quando Cornerstone3D non aggiorna il peer.

---

## 4. Backend e AI

### 4.1 Backend (`services/api`, `packages/*`)

| Componente | Ruolo | Versione | ARM64 | Licenza | Note |
| ---------- | ----- | -------- | ----- | ------- | ---- |
| FastAPI | Framework API | `0.162.0` | pure-python | MIT | Pull `starlette>=0.46` |
| Uvicorn | ASGI server | `0.54.0` | pure-python | BSD-3-Clause | Extra `standard` |
| Pydantic | Validazione modelli | `2.14.2` | wheel aarch64 (`pydantic-core`) | MIT | |
| pydicom | Parsing DICOM | `3.0.2` | pure-python | MIT | |
| SimpleITK | Geometria/conversioni | `2.5.7` | wheel aarch64 (`cp311-abi3`) | Apache-2.0 | ABI3 valido per 3.11+ |
| NumPy | Algebra | `2.5.4` | wheel aarch64 (`cp312`) | BSD-3-Clause | |
| SciPy | Algoritmi scientifici | `1.18.1` | wheel aarch64 (`cp312`) | BSD-3-Clause | |
| scikit-image | Elaborazione immagini | `0.26.0` | wheel aarch64 (`cp312`) | BSD-3-Clause | |
| NiBabel | I/O NIfTI | `5.4.2` | pure-python | MIT | |
| pandas | Dati tabellari | `3.1.1` | wheel aarch64 (`cp312`) | BSD-3-Clause | |
| pynrrd | I/O NRRD | `1.1.3` | pure-python | MIT | Ultimo rilascio 2025-01, stabile |
| trimesh | Mesh/export | `5.2.0` | pure-python | MIT | |
| httpx | Chiamate HTTP interne | `0.28.1` | pure-python | BSD-3-Clause | Scelto su `requests` (async) |
| SQLite | Database metadati | di sistema (stdlib) | built-in | Public Domain | Incluso in Python |

### 4.2 AI (`services/ai`)

| Componente | Ruolo | Versione | ARM64 | Licenza | Note |
| ---------- | ----- | -------- | ----- | ------- | ---- |
| PyTorch | Deep learning (CPU) | `2.15.0+cpu` | wheel aarch64 via CPU index | BSD-3-Clause¹ | **Da CPU index**, vedi §5 |
| MONAI (Core) | Pipeline AI biomedicale | `1.6.1` | pure-python | Apache-2.0 | Richiede `torch>=2.8.0` |
| MONAI (Label) | Trasformazioni label | `1.6.1` | pure-python | Apache-2.0 | Stessa versione di Core |
| PyRadiomics | Radiomics (opzionale) | `3.1.0` | **sorgente** (no wheel arm64) | BSD-3-Clause | Fase 6, estensione opzionale |

¹ PyTorch 2.15 dichiara una combinazione di licenze (Apache-2.0 + BSD-3-Clause);
storicamente BSD-3-Clause. **Da confermare alla fonte** prima del rilascio.

> **Rischio R1 — chiuso.** PyTorch, MONAI e SimpleITK hanno tutti una via
> arm64 verificata: SimpleITK via wheel `aarch64` ABI3, MONAI è pure-python,
> PyTorch via wheel CPU `aarch64`. Il dettaglio critico è l'origine della wheel
> PyTorch (§5.3).

### 4.3 Tooling Python (dev-only)

| Componente | Ruolo | Versione | ARM64 | Licenza |
| ---------- | ----- | -------- | ----- | ------- |
| pytest | Test | `9.2.0` | pure-python | MIT |
| Ruff | Lint/format | `0.17.3` | wheel aarch64 | MIT |
| mypy | Typecheck | `2.4.1` | wheel aarch64 | MIT |

---

## 5. Compatibilità incrociata (vincoli vincolanti)

Questa sezione raccoglie i **vincoli non ovvi** emersi dalla validazione. Sono
vincolanti: un aggiornamento che li viola deve essere motivato in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

### 5.1 TypeScript ≠ 7.x

`typescript-eslint@8.72.1` dichiara `typescript ">=4.8.4 <6.1.0"`. L'ultima
release di TypeScript è **7.0.2**, **incompatibile** con la toolchain di lint.
Pinnato **TypeScript `6.0.3`** (l'ultima `<6.1.0`). Rivalutare TS 7 quando
`typescript-eslint` amplia il range.

### 5.2 Cornerstone3D ↔ VTK.js

`@cornerstonejs/tools@5.15.2` fissa `@kitware/vtk.js@36.4.1` come peer esatto.
Pinnato **VTK.js `36.4.1`** (non 38.x). L'intero set `@cornerstonejs/*` è alla
stessa versione `5.15.2`.

### 5.3 PyTorch CPU-only su arm64 — indice dedicato

La wheel `torch` pubblicata su PyPI dichiara, per `platform_system == "Linux"`,
dipendenze CUDA (`cuda-toolkit`, `nvidia-*`, `triton`). Il pacchetto
`cuda-toolkit` **non ha wheel aarch64**: un `pip install torch` da PyPI su
`linux/arm64` può quindi fallire la risoluzione.

**Regola.** PyTorch su arm64 si installa **esclusivamente** dall'indice CPU
ufficiale:

```text
--index-url https://download.pytorch.org/whl/cpu
```

che espone wheel `torch==2.15.0+cpu` per `cp311`–`cp315` `aarch64`. Nessuna
GPU/CUDA nei container.

### 5.4 SimpleITK — ABI3

La wheel `simpleitk 2.5.7` per `linux_aarch64` è `cp311-abi3`: compatibile con
Python 3.11+ tramite stable ABI. È il vincolo che fissa il **minimo Python a
3.11** lato imaging (scelta effettiva: 3.12).

### 5.5 PyRadiomics — build da sorgente

`pyradiomics 3.1.0` non pubblica wheel (né arm64 né pure-python): richiede build
da sorgente con toolchain C++. È **opzionale** (Fase 6). Impatto e strategia di
build saranno valutati nella issue dedicata.

---

## 6. Criteri anti-AMD64 / anti-QEMU

Per rispettare la decisione **D2** (`linux/arm64` obbligatoria, QEMU solo se
giustificato e misurato):

1. **Ogni immagine base deve dichiarare `linux/arm64`** nel manifest
   (`docker manifest inspect` / `buildx imagetools`). Verificato per tutte le
   immagini in §2.
2. **Nessun tag `latest`** in Dockerfile, Compose o script: solo tag versionati
   e, in produzione, digest §9.
3. **`platform: linux/arm64`** esplicito nei servizi Compose, così un host o
   runner diverso non risolve per errore una variante amd64.
4. **Build multi-stage sul target nativo**: il Python builder usa la medesima
   piattaforma arm64 del runtime (nessuna emulazione).
5. **CI su runner arm64** (o `buildx` con node arm64) per intercettare
   regressioni di disponibilità delle wheel.
6. **QEMU ammesso solo** come fallback documentato e misurato (tempo/impatto),
   mai nel percorso di build di produzione.
7. **Dipendenza con wheel AMD64-only ⇒ non ammessa**: si valuta build da
   sorgente (con impatto registrato) o un'alternativa.

---

## 7. Licenza del progetto

**Stato: TBD.** La licenza di MRI Explorer sarà decisa in *Phase 0*, tenendo
conto di:

- compatibilità con le licenze delle dipendenze (in particolare **AGPL-3.0** di
  Orthanc, se e come distribuito — vedi §8);
- distribuzione open source (uso commerciale e di ricerca);
- separazione tra codice del progetto e servizi opzionali.

Candidati tipici: MIT, Apache-2.0, BSD-3-Clause, GPL-3.0. La scelta e le sue
motivazioni saranno registrate qui.

---

## 8. Registro licenze e rischio AGPL (Orthanc)

| Licenza | Componenti |
| ------- | ---------- |
| MIT | React(+DOM), Vite, `@vitejs/plugin-react`, Cornerstone3D, ESLint, Prettier, `typescript-eslint`, FastAPI, Pydantic, pydicom, NiBabel, pynrrd, trimesh, httpx, pytest, Ruff, mypy, Node |
| BSD-3-Clause | VTK.js, Uvicorn, NumPy, SciPy, scikit-image, pandas, PyTorch¹, PyRadiomics |
| BSD-2-Clause | Nginx |
| Apache-2.0 | TypeScript, SimpleITK, MONAI |
| PSF | Python |
| Public Domain | SQLite |
| **AGPL-3.0** | **Orthanc** (container `orthancteam/orthanc`) |

> **Attenzione licenza Orthanc (AGPL-3.0).** Orthanc è un servizio **opzionale**
> (profilo `dicom`), eseguito come container separato e **non distribuito**
> insieme al codice del progetto. L'impatto della AGPL sulla licenza del
> progetto va valutato in Fase 0 insieme alla scelta di §7.

---

## 9. Stato del pinning (Phase 0)

- [x] Immagini base con tag arm64 verificati
- [x] Dipendenze Python con wheel arm64 verificate (P0-02)
- [x] Dipendenze Node compatibili arm64
- [x] Vincoli di compatibilità incrociata documentati (§5)
- [ ] Licenze confermate alla fonte
- [ ] Licenza del progetto scelta (§7)
- [ ] File di lock (`package-lock.json`, `requirements*.txt` / `poetry.lock`)
      generati e versionati
- [ ] `.env.example` privo di segreti (P0-10)

### 9.1 Immutabilità delle build

Le build di produzione usano il **digest arm64** dell'immagine, non solo il tag
mobile. Digest rilevati durante la validazione (2026-11-04) — da **ripinnare
quando si aggiornano i tag**:

| Immagine | Digest arm64 |
| -------- | ------------ |
| `python:3.12.16-slim-bookworm` | `sha256:b224e2fe306f9d303251ada22961635e5b52a69c0414a0050611be31c59f5f5b` |
| `node:24.22.2-slim` | `sha256:e80dee4ed3709cf1f8004e34ecfb90df71b7eac8ba0d7d6222ba238a823d1eea` |
| `nginx:1.30.6-alpine` | `sha256:4f7cab9e1cd018f80e67f31e02dc0c6d18560b19504461c4f3dd37e5c63a74c5` |
| `orthancteam/orthanc:26.9.1` | `sha256:ee6aeb31798b6ff027c11e4f709b2d5d733574588352789e3c6f81876cd786f1` |

---

## 10. Registro revisioni

| Versione | Data | Modifica |
| -------- | ---- | -------- |
| 1.0 | 2026-11-04 | Registro iniziale, versioni *TBD* (P0-01) |
| 1.1 | 2026-11-04 | Matrice di compatibilità ARM64 e pinning (P0-02) |
