import { useCallback, useState } from 'react';

import type { SeriesSummary } from '../api/client';
import { isRenderableSeries } from '../api/stack';

/** Categoria assegnata a una serie, correggibile manualmente (P2-03). */
export type SeriesCategoryId = 'images' | 'localizer' | 'report' | 'other';

export interface SeriesCategory {
  id: SeriesCategoryId;
  label: string;
  /** Se ``true`` la serie è apribile nel viewer. */
  renderable: boolean;
}

export const SERIES_CATEGORIES: SeriesCategory[] = [
  { id: 'images', label: 'Immagini', renderable: true },
  { id: 'localizer', label: 'Localizer', renderable: true },
  { id: 'report', label: 'Report', renderable: false },
  { id: 'other', label: 'Altro', renderable: false },
];

const CATEGORY_BY_ID = new Map(SERIES_CATEGORIES.map((category) => [category.id, category]));

export function categoryOf(id: SeriesCategoryId): SeriesCategory {
  return CATEGORY_BY_ID.get(id) ?? SERIES_CATEGORIES[0];
}

const STORAGE_KEY = 'risonix.series.category.v1';

type Overrides = Record<string, SeriesCategoryId>;

function isCategoryId(value: unknown): value is SeriesCategoryId {
  return value === 'images' || value === 'localizer' || value === 'report' || value === 'other';
}

function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Overrides = {};
    for (const [uid, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isCategoryId(value)) result[uid] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Categorizzazione automatica basata sulla geometria e sulla modalità, **mai**
 * sulla ``SeriesDescription`` (non affidabile, P2-03).
 */
export function autoCategory(series: SeriesSummary): SeriesCategoryId {
  if (isRenderableSeries(series)) return 'images';
  if (series.modality === 'SR') return 'report';
  return 'other';
}

/**
 * Categorie delle serie con override manuale persistito per
 * ``SeriesInstanceUID``: l'utente può correggere la classificazione automatica
 * e la scelta resta salvata sul dispositivo (P2-03).
 */
export function useSeriesCategories() {
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);

  const setCategory = useCallback((seriesUid: string, id: SeriesCategoryId | null) => {
    setOverrides((current) => {
      const next = { ...current };
      if (id === null) delete next[seriesUid];
      else next[seriesUid] = id;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage non disponibile: l'override resta in memoria */
      }
      return next;
    });
  }, []);

  const categoryFor = useCallback(
    (series: SeriesSummary): SeriesCategoryId =>
      overrides[series.series_instance_uid] ?? autoCategory(series),
    [overrides],
  );

  const isOverridden = useCallback(
    (series: SeriesSummary): boolean => series.series_instance_uid in overrides,
    [overrides],
  );

  return { overrides, setCategory, categoryFor, isOverridden };
}
