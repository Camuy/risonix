"""Validazione del dataset reale, se disponibile (P1-09).

Il dataset clinico non entra mai nel repository. Quando è presente in locale si
può puntare la variabile ``MRI_VALIDATION_DATASET`` alla sua directory per
eseguire questo test; in assenza del dataset il test viene saltato e la
validazione automatica si basa sul phantom sintetico a 9 serie.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.dicom import geometry, metadata, scanner, study

DATASET_ENV = "MRI_VALIDATION_DATASET"
EXPECTED_SERIES_ENV = "MRI_VALIDATION_EXPECTED_SERIES"


@pytest.mark.skipif(
    not os.environ.get(DATASET_ENV), reason=f"{DATASET_ENV} non impostata: dataset reale assente"
)
def test_real_dataset_series_classification() -> None:
    root = Path(os.environ[DATASET_ENV]).expanduser()
    assert root.exists(), f"dataset non trovato: {root}"

    report = scanner.scan_path(root)
    grouped = study.group_scan(report)

    assert grouped.studies, "nessuno studio DICOM riconosciuto nel dataset"
    image_series = [series for item in grouped.studies for series in item.series if series.is_image]

    expected = int(os.environ.get(EXPECTED_SERIES_ENV, "9"))
    assert len(image_series) == expected, (
        f"attese {expected} serie immagine, trovate {len(image_series)}"
    )

    for series in image_series:
        instances = [metadata.extract_metadata(instance.path) for instance in series.instances]
        analyzed = geometry.analyze_geometry([item for item in instances if item is not None])
        assert analyzed.normal is not None
        assert len(analyzed.ordered_instance_uids) == series.instance_count
