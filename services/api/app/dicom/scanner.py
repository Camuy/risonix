"""Scansione del filesystem DICOM e parsing del DICOMDIR (P1-01).

Il modulo scopre le istanze DICOM a partire da una directory, da un archivio
ZIP o da un file singolo. Due strategie vengono combinate:

1. **DICOMDIR** — se presente, se ne seguono i record ``IMAGE`` per risolvere i
   file referenziati (i percorsi sono relativi alla directory del DICOMDIR).
2. **Scansione ricorsiva** — usata come fallback robusto, rilevando i file
   DICOM dal *magic number* ``DICM`` (così i file senza estensione sono
   supportati) e, in seconda battuta, tentando un parse forzato validato.

Il report espone separatamente i due insiemi così che il chiamante possa
verificarne la coerenza. Gli originali non vengono **mai** modificati: gli
archivi ZIP sono estratti in una directory di staging fornita dal chiamante.
"""

from __future__ import annotations

import logging
import shutil
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pydicom
from pydicom.dataset import Dataset
from pydicom.errors import InvalidDicomError

logger = logging.getLogger(__name__)

#: Magic number DICOM: precede i dati dopo un preambolo di 128 byte.
DICOM_MAGIC = b"DICM"
_PREAMBLE_LENGTH = 128

#: SOP Class UID del DICOMDIR (*Media Storage Directory Storage*).
DICOMDIR_SOP_CLASS_UID = "1.2.840.10008.1.3.10"

#: Nome convenzionale del file indice.
_DICOMDIR_NAME = "DICOMDIR"

#: Tag necessari a riconoscere/indicizzare un'istanza senza leggerne i pixel.
_HEADER_TAGS = [
    "SOPInstanceUID",
    "SOPClassUID",
    "Modality",
    "StudyInstanceUID",
    "SeriesInstanceUID",
]


@dataclass(frozen=True)
class DICOMFile:
    """Riferimento a un file DICOM scoperto durante la scansione."""

    path: str
    """Percorso assoluto del file (l'originale non viene mai toccato)."""

    sop_instance_uid: str | None
    """``SOPInstanceUID`` dell'istanza, se leggibile."""

    sop_class_uid: str | None
    """``SOPClassUID`` dell'istanza, se leggibile."""

    source: str
    """Origine della scoperta: ``dicomdir``, ``recursive`` o ``zip``."""


@dataclass(frozen=True)
class ScanError:
    """Errore non fatale incontrato su un singolo file."""

    path: str
    message: str


@dataclass
class ScanReport:
    """Esito di una scansione, con i due insiemi separati e i conteggi."""

    root: str
    kind: str
    dicom_files: list[DICOMFile] = field(default_factory=list)
    non_dicom: list[str] = field(default_factory=list)
    errors: list[ScanError] = field(default_factory=list)
    dicomdir_path: str | None = None
    dicomdir_files: list[DICOMFile] = field(default_factory=list)
    recursive_files: list[DICOMFile] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def sop_instance_uids(self) -> set[str]:
        """Insieme degli ``SOPInstanceUID`` delle istanze scoperte."""
        return {f.sop_instance_uid for f in self.dicom_files if f.sop_instance_uid}

    @property
    def dicomdir_matches_recursive(self) -> bool | None:
        """``True``/``False`` se entrambe le strategie sono disponibili, altrimenti ``None``."""
        if not self.dicomdir_files:
            return None
        dicomdir = {f.sop_instance_uid for f in self.dicomdir_files if f.sop_instance_uid}
        recursive = {f.sop_instance_uid for f in self.recursive_files if f.sop_instance_uid}
        return dicomdir == recursive


def has_dicom_preamble(path: Path) -> bool:
    """Verifica rapida del *magic number* DICOM (preambolo + ``DICM``)."""
    try:
        with path.open("rb") as handle:
            handle.seek(_PREAMBLE_LENGTH)
            return handle.read(4) == DICOM_MAGIC
    except OSError:
        return False


def read_header(path: Path, *, force: bool = False) -> Dataset | None:
    """Legge l'header DICOM senza pixel data; ``None`` se il file non è leggibile."""
    try:
        return pydicom.dcmread(
            path,
            stop_before_pixels=True,
            force=force,
            specific_tags=_HEADER_TAGS,
        )
    except (InvalidDicomError, OSError, ValueError):
        return None


def is_dicomdir_file(path: Path) -> bool:
    """Riconosce il DICOMDIR dal nome o dal *Media Storage SOP Class UID*."""
    if is_dicomdir_name(path):
        return True
    try:
        header = pydicom.dcmread(path, stop_before_pixels=True, specific_tags=[])
    except (InvalidDicomError, OSError, ValueError):
        return False
    meta = getattr(header, "file_meta", None)
    return getattr(meta, "MediaStorageSOPClassUID", None) == DICOMDIR_SOP_CLASS_UID


def is_dicomdir_name(path: Path) -> bool:
    """Verifica economica del nome del file indice."""
    return path.name.upper() == _DICOMDIR_NAME


def looks_like_instance(header: Dataset | None) -> bool:
    """Riconosce un'istanza DICOM a partire da un header già letto."""
    if header is None:
        return False
    has_uid = bool(getattr(header, "SOPInstanceUID", None))
    has_kind = bool(getattr(header, "SOPClassUID", None) or getattr(header, "Modality", None))
    return has_uid and has_kind


def classify_file(path: Path) -> tuple[DICOMFile | None, str]:
    """Classifica un file come istanza DICOM oppure no.

    Restituisce ``(DICOMFile, "dicom")`` oppure ``(None, "non-dicom")``.
    """
    if has_dicom_preamble(path):
        header = read_header(path)
    else:
        # File senza preambolo: tentativo forzato validato sui tag minimi.
        header = read_header(path, force=True)
    if header is None or not looks_like_instance(header):
        return None, "non-dicom"
    return (
        DICOMFile(
            path=str(path),
            sop_instance_uid=getattr(header, "SOPInstanceUID", None),
            sop_class_uid=getattr(header, "SOPClassUID", None),
            source="recursive",
        ),
        "dicom",
    )


def _split_referenced_file_id(referenced: object) -> list[str]:
    """Normalizza ``ReferencedFileID`` (lista o stringa con separatori) in componenti."""
    if referenced is None:
        return []
    if isinstance(referenced, str):
        raw = [referenced]
    elif isinstance(referenced, Sequence):
        raw = [str(item) for item in referenced]
    else:
        raw = [str(referenced)]
    parts: list[str] = []
    for item in raw:
        parts.extend(item.replace("\\", "/").split("/"))
    return [p for p in parts if p not in ("", ".")]


def _walk_dicomdir_records(records: Any, out: list[tuple[str, str | None]]) -> None:
    """Attraversa ricorsivamente i record del DICOMDIR raccogliendo i file ``IMAGE``."""
    for record in records:
        record_type = record.get("DirectoryRecordType", None)
        if record_type == "IMAGE":
            path_parts = _split_referenced_file_id(record.get("ReferencedFileID", None))
            if path_parts:
                sop = record.get("ReferencedSOPInstanceUID", None)
                out.append(("/".join(path_parts), str(sop) if sop else None))
        nested = record.get("DirectoryRecordSequence", None)
        if nested is not None:
            _walk_dicomdir_records(nested, out)


def parse_dicomdir(dicomdir_path: Path) -> list[str]:
    """Estrae i percorsi dei file referenziati da un DICOMDIR (relativi alla sua directory)."""
    dataset = pydicom.dcmread(dicomdir_path, stop_before_pixels=True, force=True)
    records = getattr(dataset, "DirectoryRecordSequence", None)
    found: list[tuple[str, str | None]] = []
    if records is not None:
        _walk_dicomdir_records(records, found)

    base = dicomdir_path.resolve().parent
    paths: list[str] = []
    for relative, _sop in found:
        candidate = (base / relative).resolve()
        paths.append(str(candidate))
    return paths


def _safe_extract_target(base: Path, member_name: str) -> Path:
    """Risolve un membro ZIP impedendo il *zip-slip* (path traversal)."""
    target = (base / member_name).resolve()
    if not target.is_relative_to(base.resolve()):
        raise ValueError(f"percorso non sicuro nell'archivio: {member_name!r}")
    return target


def scan_directory(root: Path, *, follow_dicomdir: bool = True) -> ScanReport:
    """Scansiona ricorsivamente una directory combinando DICOMDIR e fallback."""
    root = root.resolve()
    if not root.is_dir():
        raise NotADirectoryError(f"non è una directory: {root}")

    report = ScanReport(root=str(root), kind="directory")
    dicomdir_path: Path | None = None
    for child in sorted(root.rglob("*")):
        if child.is_file() and is_dicomdir_name(child):
            dicomdir_path = child
            break

    if dicomdir_path is not None and follow_dicomdir:
        report.dicomdir_path = str(dicomdir_path)
        try:
            referenced = parse_dicomdir(dicomdir_path)
        except (InvalidDicomError, OSError, ValueError) as exc:
            report.errors.append(ScanError(path=str(dicomdir_path), message=str(exc)))
            referenced = []
        for ref in referenced:
            ref_path = Path(ref)
            if not ref_path.is_file():
                report.errors.append(
                    ScanError(path=ref, message="file referenziato dal DICOMDIR assente")
                )
                continue
            instance, _kind = classify_file(ref_path)
            if instance is None:
                report.errors.append(
                    ScanError(path=ref, message="file referenziato dal DICOMDIR non valido")
                )
                continue
            report.dicomdir_files.append(
                DICOMFile(
                    path=instance.path,
                    sop_instance_uid=instance.sop_instance_uid,
                    sop_class_uid=instance.sop_class_uid,
                    source="dicomdir",
                )
            )

    report.recursive_files = _scan_tree(
        root, report, skip={dicomdir_path} if dicomdir_path else set()
    )

    merged: dict[str, DICOMFile] = {}
    for discovered in [*report.recursive_files, *report.dicomdir_files]:
        merged.setdefault(discovered.path, discovered)
    report.dicom_files = sorted(merged.values(), key=lambda f: f.path)

    if report.dicomdir_path:
        if report.dicomdir_matches_recursive is False:
            report.notes.append(
                "DICOMDIR e scansione ricorsiva divergono sull'insieme delle istanze"
            )
    return report


def _scan_tree(root: Path, report: ScanReport, *, skip: set[Path]) -> list[DICOMFile]:
    """Visita ricorsiva deterministica dell'albero, classificando ogni file."""
    found: list[DICOMFile] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path in skip:
            continue
        if is_dicomdir_name(path):
            continue
        try:
            instance, kind = classify_file(path)
        except OSError as exc:
            report.errors.append(ScanError(path=str(path), message=str(exc)))
            continue
        if instance is None or kind == "non-dicom":
            report.non_dicom.append(str(path))
        else:
            found.append(instance)
    return found


def scan_zip(archive: Path, extract_to: Path) -> ScanReport:
    """Estrae un archivio ZIP in ``extract_to`` (in modo sicuro) e lo scansiona."""
    archive = archive.resolve()
    extract_to = extract_to.resolve()
    extract_to.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if member.is_dir():
                continue
            target = _safe_extract_target(extract_to, member.filename)
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(member) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)

    report = scan_directory(extract_to)
    report.root = str(archive)
    report.kind = "archive"
    report.notes.append(f"archivio estratto in {extract_to}")
    report.dicom_files = [
        DICOMFile(f.path, f.sop_instance_uid, f.sop_class_uid, "zip") for f in report.dicom_files
    ]
    report.recursive_files = [
        DICOMFile(f.path, f.sop_instance_uid, f.sop_class_uid, "zip")
        for f in report.recursive_files
    ]
    return report


def scan_path(root: Path, *, extract_to: Path | None = None) -> ScanReport:
    """Dispatch: directory, archivio ZIP o singolo file DICOM."""
    root = Path(root)
    if root.is_dir():
        return scan_directory(root)
    if root.is_file() and zipfile.is_zipfile(root):
        if extract_to is None:
            raise ValueError("per scansionare un archivio ZIP serve una directory di staging")
        return scan_zip(root, extract_to)
    if root.is_file():
        report = ScanReport(root=str(root.resolve()), kind="file")
        instance, kind = classify_file(root)
        if instance is not None and kind == "dicom":
            report.dicom_files = [
                DICOMFile(instance.path, instance.sop_instance_uid, instance.sop_class_uid, "file")
            ]
        else:
            report.non_dicom.append(str(root.resolve()))
        return report
    raise FileNotFoundError(f"percorso non trovato: {root}")


def report_to_dict(report: ScanReport) -> dict[str, Any]:
    """Serializza il report in una struttura JSON-friendly."""
    return {
        "root": report.root,
        "kind": report.kind,
        "counts": {
            "dicom": len(report.dicom_files),
            "non_dicom": len(report.non_dicom),
            "errors": len(report.errors),
            "dicomdir": len(report.dicomdir_files),
            "recursive": len(report.recursive_files),
        },
        "dicomdir_path": report.dicomdir_path,
        "dicomdir_matches_recursive": report.dicomdir_matches_recursive,
        "non_dicom": list(report.non_dicom),
        "errors": [{"path": e.path, "message": e.message} for e in report.errors],
        "notes": list(report.notes),
    }
