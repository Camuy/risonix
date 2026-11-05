"""De-identificazione DICOM opzionale e pseudonimizzazione (P1-08).

La de-identificazione è **opzionale** e non tocca mai gli originali: legge una
sorgente e scrive una **copia derivata** ripulita dai tag PHI più comuni.

Il modulo è volutamente conservativo:
* rimuove (o sostituisce con un segnaposto) i tag identificativi del paziente e
  dell'operatore;
* opzionalmente **rimappa gli UID** in modo deterministico (stesso input →
  stesso UID), così i riferimenti incrociati restano coerenti senza esporre gli
  identificatori originali;
* marca l'oggetto con ``PatientIdentityRemoved`` e ``DeidentificationMethod``.

Nota: nessuna pipeline di de-identificazione può essere esaustiva; qui si copre
l'insieme dei tag che il profilo DICOM *Basic Application Level Confidentiality*
tratta come identificativi diretti.
"""

from __future__ import annotations

import hashlib
import re
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path

import pydicom
from pydicom.dataset import Dataset
from pydicom.uid import UID

#: Segnaposto usato per i campi testuali identificativi.
DEFAULT_REPLACEMENT = "ANONYMOUS"

#: Tag eliminati perché identificativi, liberi o non necessari all'analisi.
REMOVE_TAGS: tuple[str, ...] = (
    "PatientBirthDate",
    "PatientBirthTime",
    "PatientSex",
    "PatientAge",
    "PatientSize",
    "PatientWeight",
    "PatientAddress",
    "PatientTelephoneNumbers",
    "PatientComments",
    "OtherPatientIDs",
    "OtherPatientNames",
    "PatientMotherBirthName",
    "PatientBirthName",
    "AdditionalPatientHistory",
    "Occupation",
    "AccessionNumber",
    "StudyID",
    "ReferringPhysicianName",
    "PerformingPhysicianName",
    "PhysiciansOfRecord",
    "NameOfPhysiciansReadingStudy",
    "RequestingPhysician",
    "OperatorsName",
    "InstitutionName",
    "InstitutionalDepartmentName",
    "InstitutionalAddress",
    "StationName",
    "DeviceSerialNumber",
    "ImageComments",
)

#: Tag sostituiti con un segnaposto (mantengono un valore ben formato).
REPLACE_TAGS: tuple[str, ...] = (
    "PatientName",
    "PatientID",
)

#: De-identificazione applicata (profilo dichiarato nell'oggetto derivato).
DEID_METHOD = "Risonix Basic Profile 1.0"

#: Prefisso UID per gli identificatori rimappati (formato UUID ``2.25``).
_UID_ROOT = "2.25"

_UNSAFE_UID = re.compile(r"[^0-9A-Za-z._-]")


class DeidentificationError(RuntimeError):
    """Impossibile de-identificare il file indicato."""


@dataclass(frozen=True)
class DeidPolicy:
    """Parametri della de-identificazione."""

    replacement: str = DEFAULT_REPLACEMENT
    salt: str = "risonix"
    remap_uids: bool = False

    def method_name(self) -> str:
        """Descrizione del metodo, annotata nell'oggetto derivato."""
        if self.remap_uids:
            return f"{DEID_METHOD} (UID remapped)"
        return DEID_METHOD


def pseudonymize(value: str, *, salt: str, length: int = 24) -> str:
    """Digest deterministico (SHA-256 troncato) di un valore sensibile."""
    digest = hashlib.sha256(f"{salt}:{value}".encode()).hexdigest()
    return digest[:length]


def _remap_uid(uid: str, *, salt: str) -> str:
    """UID pseudonimo deterministico in formato ``2.25.<uuid>``."""
    digest = hashlib.sha256(f"{salt}:{uid}".encode()).hexdigest()
    return f"{_UID_ROOT}.{int(digest, 16)}"


def deidentify_dataset(dataset: Dataset, policy: DeidPolicy | None = None) -> Dataset:
    """Restituisce una **copia** de-identificata del dataset (l'originale resta intatto)."""
    active = policy or DeidPolicy()
    result = deepcopy(dataset)

    for keyword in REMOVE_TAGS:
        if hasattr(result, keyword):
            delattr(result, keyword)

    for keyword in REPLACE_TAGS:
        setattr(result, keyword, active.replacement)

    if active.remap_uids:
        _remap_dataset_uids(result, active)

    result.PatientIdentityRemoved = "YES"
    result.DeidentificationMethod = active.method_name()
    return result


def _remap_dataset_uids(dataset: Dataset, policy: DeidPolicy) -> None:
    for keyword in ("StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID"):
        value = getattr(dataset, keyword, None)
        if value:
            setattr(dataset, keyword, UID(_remap_uid(str(value), salt=policy.salt)))
    media_uid = getattr(dataset, "SOPInstanceUID", None)
    if media_uid and getattr(dataset, "file_meta", None) is not None:
        dataset.file_meta.MediaStorageSOPInstanceUID = media_uid


def deidentify_file(
    source: str | Path,
    destination: str | Path,
    policy: DeidPolicy | None = None,
) -> Path:
    """Scrive una copia de-identificata di ``source`` in ``destination``.

    L'originale non viene mai modificato. Solleva :class:`DeidentificationError`
    se il file non è leggibile come DICOM.
    """
    src = Path(source)
    dst = Path(destination)
    active = policy or DeidPolicy()

    dataset = pydicom.dcmread(src, force=True)
    cleaned = deidentify_dataset(dataset, active)
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        cleaned.save_as(dst, enforce_file_format=True)
    except Exception as exc:  # noqa: BLE001 - errore di I/O o di scrittura DICOM
        raise DeidentificationError(f"scrittura del file de-identificato fallita: {dst}") from exc
    return dst


def safe_component(value: str) -> str:
    """Rende una stringa (es. un UID) sicura come nome di file/cartella."""
    return _UNSAFE_UID.sub("_", value) or "unknown"


__all__ = [
    "DEFAULT_REPLACEMENT",
    "DEID_METHOD",
    "REMOVE_TAGS",
    "REPLACE_TAGS",
    "DeidPolicy",
    "DeidentificationError",
    "deidentify_dataset",
    "deidentify_file",
    "pseudonymize",
    "safe_component",
]
