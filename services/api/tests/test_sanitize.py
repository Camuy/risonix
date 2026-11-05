"""Test della sanitizzazione di log e strutture (P1-08)."""

from __future__ import annotations

import logging

from app.core.sanitize import REDACTED, PhiRedactionFilter, is_sensitive_key, sanitize


def test_is_sensitive_key_normalizes_case_and_separators() -> None:
    assert is_sensitive_key("PatientName")
    assert is_sensitive_key("patient_id")
    assert is_sensitive_key("accession-number")
    assert not is_sensitive_key("Modality")
    assert not is_sensitive_key(42)


def test_sanitize_redacts_flat_mapping() -> None:
    data = {"patient_name": "Doe^John", "Rows": 512, "PatientID": "ABC123"}
    assert sanitize(data) == {"patient_name": REDACTED, "Rows": 512, "PatientID": REDACTED}


def test_sanitize_does_not_mutate_input() -> None:
    data = {"patient_name": "Doe^John"}
    sanitize(data)
    assert data == {"patient_name": "Doe^John"}


def test_sanitize_redacts_nested_structures() -> None:
    data = {"study": {"patient_id": "42"}, "series": [{"station_name": "CT01"}, {"Rows": 8}]}
    assert sanitize(data) == {
        "study": {"patient_id": REDACTED},
        "series": [{"station_name": REDACTED}, {"Rows": 8}],
    }


def test_sanitize_leaves_strings_untouched() -> None:
    assert sanitize("plain text") == "plain text"


def test_redaction_filter_scrubs_mapping_args() -> None:
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="import %(patient_name)s",
        args=({"patient_name": "Doe^John"},),
        exc_info=None,
    )
    assert PhiRedactionFilter().filter(record) is True
    assert record.args == {"patient_name": REDACTED}
    assert record.getMessage() == f"import {REDACTED}"


def test_redaction_filter_scrubs_positional_mappings() -> None:
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="%s %s",
        args=({"patient_id": "123"}, "detail"),
        exc_info=None,
    )
    PhiRedactionFilter().filter(record)
    assert record.args == ({"patient_id": REDACTED}, "detail")
