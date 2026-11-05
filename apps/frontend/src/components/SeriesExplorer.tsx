import { lazy, Suspense, useMemo, useState } from 'react';

import type { SeriesSummary, StudyDetail } from '../api/client';
import type { SeriesSelection } from '../api/stack';
import type { ApiStatus } from '../hooks/useApiStatus';
import {
  categoryOf,
  SERIES_CATEGORIES,
  type SeriesCategoryId,
} from '../hooks/useSeriesCategories';
import type { CatalogState } from '../hooks/useStudyCatalog';
import { Button } from './Button';
import { Icon } from './Icon';
import { StateMessage } from './StateMessage';

/** La miniatura decodifica immagini con Cornerstone: caricata su richiesta (P2-08). */
const SeriesThumbnail = lazy(() =>
  import('./SeriesThumbnail').then((module) => ({ default: module.SeriesThumbnail })),
);

interface SeriesExplorerProps {
  status: ApiStatus;
  catalog: CatalogState;
  selectedSeriesId: number | null;
  categoryFor: (series: SeriesSummary) => SeriesCategoryId;
  isOverridden: (series: SeriesSummary) => boolean;
  onCategoryChange: (series: SeriesSummary, category: SeriesCategoryId | null) => void;
  onSelect: (selection: SeriesSelection) => void;
  onReload: () => void;
}

function seriesTitle(series: SeriesSummary): string {
  return series.description ?? `Serie ${series.series_number ?? series.id}`;
}

function seriesMeta(series: SeriesSummary): string {
  const modality = series.modality ?? '—';
  const parts = [modality, `${series.instance_count} img`];
  if (series.rows && series.columns) {
    parts.push(`${series.columns}×${series.rows}`);
  }
  if (series.slice_spacing) {
    parts.push(`${series.slice_spacing.toFixed(2)} mm`);
  }
  return parts.join(' · ');
}

function studyTitle(study: StudyDetail): string {
  return study.description ?? `Studio ${study.id}`;
}

function studyMeta(study: StudyDetail): string {
  const parts: string[] = [];
  if (study.patient_id) parts.push(study.patient_id);
  if (study.study_date) parts.push(study.study_date);
  parts.push(`${study.series_count} serie`);
  return parts.join(' · ');
}

/** Ordinamento: prima le serie apribili, poi per numero di serie (P2-03). */
function renderableRank(series: SeriesSummary, categoryFor: SeriesExplorerProps['categoryFor']) {
  return Number(categoryOf(categoryFor(series)).renderable);
}

function SeriesRow({
  series,
  study,
  selected,
  category,
  overridden,
  onSelect,
  onCategoryChange,
}: {
  series: SeriesSummary;
  study: StudyDetail;
  selected: boolean;
  category: SeriesCategoryId;
  overridden: boolean;
  onSelect: (selection: SeriesSelection) => void;
  onCategoryChange: (series: SeriesSummary, category: SeriesCategoryId | null) => void;
}) {
  const definition = categoryOf(category);
  const renderable = definition.renderable;

  return (
    <li className="series-row">
      <button
        type="button"
        className="series-item"
        data-selected={selected}
        disabled={!renderable}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect({ study, series })}
      >
        <span className="series-item__thumb">
          {renderable ? (
            <Suspense fallback={<Icon name="image" size={18} />}>
              <SeriesThumbnail seriesId={series.id} alt={seriesTitle(series)} />
            </Suspense>
          ) : (
            <Icon name="file-text" size={18} />
          )}
        </span>
        <span className="series-item__body">
          <span className="series-item__title">{seriesTitle(series)}</span>
          <span className="series-item__meta">{seriesMeta(series)}</span>
        </span>
      </button>

      <label className="series-item__category" title="Categoria della serie">
        <span className="visually-hidden">Categoria di {seriesTitle(series)}</span>
        <select
          value={overridden ? category : 'auto'}
          data-renderable={renderable}
          onChange={(event) => {
            const value = event.target.value;
            onCategoryChange(series, value === 'auto' ? null : (value as SeriesCategoryId));
          }}
        >
          <option value="auto">Auto</option>
          {SERIES_CATEGORIES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

function StudyGroup({
  study,
  selectedSeriesId,
  categoryFor,
  isOverridden,
  onCategoryChange,
  onSelect,
}: {
  study: StudyDetail;
  selectedSeriesId: number | null;
  categoryFor: SeriesExplorerProps['categoryFor'];
  isOverridden: SeriesExplorerProps['isOverridden'];
  onCategoryChange: SeriesExplorerProps['onCategoryChange'];
  onSelect: (selection: SeriesSelection) => void;
}) {
  const [open, setOpen] = useState(true);
  const series = useMemo(
    () =>
      [...study.series].sort((a, b) => {
        const renderable = renderableRank(b, categoryFor) - renderableRank(a, categoryFor);
        if (renderable !== 0) return renderable;
        return (a.series_number ?? 0) - (b.series_number ?? 0);
      }),
    [study.series, categoryFor],
  );

  return (
    <section className="study-group">
      <button
        type="button"
        className="study-group__header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        <Icon name="folder" size={14} />
        <span className="study-group__text">
          <span className="study-group__title">{studyTitle(study)}</span>
          <span className="study-group__meta">{studyMeta(study)}</span>
        </span>
      </button>

      {open ? (
        <ul className="series-list">
          {series.map((item) => (
            <SeriesRow
              key={item.id}
              series={item}
              study={study}
              selected={item.id === selectedSeriesId}
              category={categoryFor(item)}
              overridden={isOverridden(item)}
              onSelect={onSelect}
              onCategoryChange={onCategoryChange}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Explorer delle serie: studi, categorizzazione correggibile e selezione (P2-03). */
export function SeriesExplorer({
  status,
  catalog,
  selectedSeriesId,
  categoryFor,
  isOverridden,
  onCategoryChange,
  onSelect,
  onReload,
}: SeriesExplorerProps) {
  if (status.state === 'checking') {
    return <StateMessage compact variant="loading" title="Caricamento studi…" />;
  }
  if (status.state === 'down') {
    return (
      <StateMessage
        compact
        variant="error"
        title="API offline"
        description="Impossibile elencare gli studi finché il servizio non è raggiungibile."
      />
    );
  }

  switch (catalog.state) {
    case 'loading':
      return <StateMessage compact variant="loading" title="Lettura del catalogo…" />;
    case 'error':
      return (
        <StateMessage
          compact
          variant="error"
          title="Catalogo non disponibile"
          description={catalog.message}
          action={
            <Button icon="refresh" onClick={onReload}>
              Riprova
            </Button>
          }
        />
      );
    case 'ready':
      if (catalog.studies.length === 0) {
        return (
          <StateMessage
            compact
            variant="empty"
            title="Nessuno studio importato"
            description="Gli studi importati compariranno qui, ordinati per data."
          />
        );
      }
      return (
        <div className="panel__scroll">
          {catalog.studies.map((study) => (
            <StudyGroup
              key={study.id}
              study={study}
              selectedSeriesId={selectedSeriesId}
              categoryFor={categoryFor}
              isOverridden={isOverridden}
              onCategoryChange={onCategoryChange}
              onSelect={onSelect}
            />
          ))}
        </div>
      );
    default:
      return <StateMessage compact variant="loading" title="In attesa dei dati…" />;
  }
}
