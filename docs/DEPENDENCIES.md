# Dipendenze, versioni e licenze — MRI Explorer · Risonix

| Campo | Valore |
| ----- | ------ |
| Stato | Pre-alpha (*Phase 0*) — versioni non ancora pinnate |
| Ultima modifica | 2026-11-04 |
| Riferimento | [`MASTER_SPECIFICATION.md`](../MASTER_SPECIFICATION.md) |

Questo documento è il **registro unico** delle dipendenze del progetto. Le
versioni esatte vengono **pinnate solo dopo validazione di compatibilità
ARM64** (issue **P0-02**). Finché una versione non è validata, è indicata come
*TBD* (to be determined).

> **Regola.** Nessuna dipendenza entra in produzione senza: (1) compatibilità
> ARM64 verificata, (2) versione pinnata, (3) licenza registrata. La licenza del
> progetto è ancora **da definire** (vedi §5).

---

## 1. Come leggere le tabelle

| Colonna | Significato |
| ------- | ----------- |
| Componente | Nome del pacchetto/immagine |
| Ruolo | Perché è usato |
| Versione | Versione pinnata (o *TBD* se non ancora validata) |
| Licenza | Licenza dichiarata a monte |
| Note | Rischi, vincoli, alternative |

Le licenze sono riportate **a titolo indicativo** e vanno confermate alla fonte
ufficiale al momento del pinning.

---

## 2. Runtime e base images

| Componente | Ruolo | Versione | Licenza | Note |
| ---------- | ----- | -------- | ------- | ---- |
| Docker Desktop | Runtime container su macOS | TBD | Proprietaria (tool di sviluppo) | Unico prerequisito applicativo |
| `node` (slim, arm64) | Base frontend (build/dev) | TBD | MIT | Deve esistere tag arm64 |
| `nginx` (=alpine) | Base frontend prod / reverse proxy | TBD | BSD-2-Clause | Multi-arch |
| `python` (slim, arm64) | Base backend/AI | TBD | PSF | Verificare build arm64 |
| `osimis/orthanc` o equivalente | Archivio DICOM | TBD | AGPL-3.0 (Orthanc) | Verificare implicazioni licenza |

> **Attenzione licenza Orthanc (AGPL-3.0).** Orthanc è un servizio opzionale,
> eseguito come container separato e non distribuito insieme al codice del
> progetto. L'impatto della AGPL sulla licenza del progetto va valutato in
> Fase 0 (§5).

---

## 3. Frontend

| Componente | Ruolo | Versione | Licenza | Note |
| ---------- | ----- | -------- | ------- | ---- |
| React | UI | TBD | MIT | |
| TypeScript | Tipizzazione | TBD | Apache-2.0 | |
| Vite | Build/dev server | TBD | MIT | |
| Cornerstone3D (`@cornerstonejs/*`) | Rendering DICOM | TBD | MIT | Verificare pacchetti e dipendenze |
| VTK.js (`@kitware/vtk.js`) | Rendering 3D | TBD | BSD-3-Clause | |
| ESLint / Prettier | Lint/format | TBD | MIT | Dev-only |

---

## 4. Backend e AI

| Componente | Ruolo | Versione | Licenza | Note |
| ---------- | ----- | -------- | ------- | ---- |
| FastAPI | Framework API | TBD | MIT | |
| Uvicorn | ASGI server | TBD | BSD-3-Clause | |
| Pydantic | Validazione modelli | TBD | MIT | |
| pydicom | Parsing DICOM | TBD | MIT | |
| SimpleITK | Geometria/conversioni | TBD | Apache-2.0 | Verificare wheel arm64 |
| NumPy | Algebra | TBD | BSD-3-Clause | |
| SciPy | Algoritmi scientifici | TBD | BSD-3-Clause | |
| scikit-image | Elaborazione immagini | TBD | BSD-3-Clause | |
| NiBabel | I/O NIfTI | TBD | MIT | |
| pandas | Dati tabellari | TBD | BSD-3-Clause | |
| pynrrd | I/O NRRD | TBD | MIT | Verificare manutenzione |
| trimesh | Mesh/export | TBD | MIT | |
| PyTorch | Deep learning (CPU) | TBD | BSD-3-Clause | Verificare wheel CPU arm64 |
| MONAI (Core/Label) | Pipeline AI biomedicale | TBD | Apache-2.0 | |
| PyRadiomics | Radiomics (opzionale) | TBD | BSD-3-Clause | Estensione, Fase 6 |
| httpx/requests | Chiamate HTTP interne | TBD | BSD/Apache | Da scegliere |
| pytest | Test | TBD | MIT | Dev-only |
| Ruff / mypy | Lint/typecheck | TBD | MIT | Dev-only |

> **Rischio R1 — ARM64.** PyTorch, MONAI e SimpleITK sono i candidati a rischio
> maggiore per disponibilità di wheel `linux/arm64`. Vanno verificati
> **prima** di procedere con le fasi successive (issue P0-02). In assenza di
> wheel, valutare build da sorgente o versione alternativa, con misura di
> impatto.

---

## 5. Licenza del progetto

**Stato: TBD.** La licenza di MRI Explorer sarà decisa in *Phase 0*, tenendo
conto di:

- compatibilità con le licenze delle dipendenze (in particolare **AGPL-3.0** di
  Orthanc, se e come distribuito);
- distribuzione open source (uso commerciale e di ricerca);
- separazione tra codice del progetto e servizi opzionali.

Candidati tipici: MIT, Apache-2.0, BSD-3-Clause, GPL-3.0. La scelta e le sue
motivazioni saranno registrate qui.

---

## 6. Stato del pinning (Phase 0)

- [ ] Immagini base con tag arm64 verificati
- [ ] Dipendenze Python con wheel arm64 verificate (P0-02)
- [ ] Dipendenze Node compatibili arm64
- [ ] Licenze confermate alla fonte
- [ ] Licenza del progetto scelta
- [ ] File di lock (`package-lock.json`, `requirements*.txt` / `poetry.lock`)
      generati e versionati
- [ ] `.env.example` privo di segreti (P0-10)

### 6.1 Immutabilità delle build

Le build di produzione devono usare **digest** delle immagini base (non solo
tag mobili) per garantire riproducibilità. La policy è formalizzata in Fase 0.
