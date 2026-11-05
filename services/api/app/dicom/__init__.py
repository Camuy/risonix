"""Motore DICOM del backend Risonix.

Contiene scansione/import, raggruppamento, estrazione metadati, geometria e
costruzione dei volumi. Il motore è **anatomia-agnostico** (ARCHITECTURE D7) e
non modifica mai i file originali.
"""
