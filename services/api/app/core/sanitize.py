"""Sanitizzazione di log e output di debug (P1-08).

Obiettivo: anche se un frammento di metadati finisse nei log, nessun dato
identificativo del paziente o dell'operatore deve essere emesso. La
sanitizzazione lavora in modo ricorsivo su strutture (dizionari, liste, tuple)
redigendo i valori associati a chiavi note come sensibili.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import Any

#: Segnaposto con cui vengono sostituiti i valori sensibili.
REDACTED = "***"

#: Chiavi considerate PHI (forma ``snake_case``).
SENSITIVE_KEYS = frozenset(
    {
        "accession_number",
        "institution_name",
        "operators_name",
        "other_patient_ids",
        "patient_address",
        "patient_age",
        "patient_birth_date",
        "patient_comments",
        "patient_id",
        "patient_name",
        "patient_sex",
        "patient_telephone_numbers",
        "referring_physician_name",
        "station_name",
        "study_id",
    }
)


def _normalize_key(key: str) -> str:
    """Normalizza una chiave rimuovendo separatori e convertendo a minuscolo.

    In questo modo ``PatientName``, ``patient_name`` e ``patient-name``
    collassano tutti sulla stessa forma canonica.
    """
    return "".join(char for char in key.lower() if char.isalnum())


#: Chiavi sensibili in forma canonica, per un confronto tollerante allo stile.
_NORMALIZED_SENSITIVE_KEYS = frozenset(_normalize_key(key) for key in SENSITIVE_KEYS)


def is_sensitive_key(key: object) -> bool:
    """``True`` se la chiave identifica un campo PHI noto."""
    if not isinstance(key, str):
        return False
    return _normalize_key(key) in _NORMALIZED_SENSITIVE_KEYS


def sanitize(value: Any) -> Any:
    """Redige ricorsivamente i valori associati a chiavi sensibili.

    Le strutture di input non vengono mai modificate: la funzione restituisce
    sempre una nuova struttura.
    """
    if isinstance(value, Mapping):
        return {
            key: (REDACTED if is_sensitive_key(key) else sanitize(item))
            for key, item in value.items()
        }
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [sanitize(item) for item in value]
    return value


class PhiRedactionFilter(logging.Filter):
    """Filtro di logging che redige i PHI passati come strutture/argomenti."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, Mapping):
            record.msg = sanitize(dict(record.msg))
        if isinstance(record.args, Mapping):
            record.args = sanitize(dict(record.args))
        elif isinstance(record.args, tuple):
            record.args = tuple(sanitize(arg) for arg in record.args)
        return True


__all__ = ["REDACTED", "SENSITIVE_KEYS", "PhiRedactionFilter", "is_sensitive_key", "sanitize"]
