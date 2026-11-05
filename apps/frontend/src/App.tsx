import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { volumeDownloadUrl, type SeriesSummary } from './api/client';
import type { SeriesSelection } from './api/stack';
import { IconButton } from './components/Button';
import { Panel } from './components/Panel';
import { Resizer } from './components/Resizer';
import { SeriesExplorer } from './components/SeriesExplorer';
import { StateMessage } from './components/StateMessage';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import {
  activateTool,
  deleteSelectedAnnotations,
  fitViewports,
  getSelectedAnnotationLabel,
  isViewportInverted,
  resetViewports,
  rotateViewport,
  setCrosshairSize as applyCrosshairSize,
  setMeasurementColor as applyMeasurementColor,
  setSelectedAnnotationLabel,
  toggleViewportInvert,
} from './cornerstone/engineBridge';
import type { CrosshairSize, ViewportTool } from './cornerstone/engine';
import { SLICE_CHANGE_EVENT, type SliceChangeDetail } from './cornerstone/events';
import { useAnnotationSelection } from './hooks/useAnnotationSelection';
import { useApiStatus, type ApiStatus } from './hooks/useApiStatus';
import { useFullscreen } from './hooks/useFullscreen';
import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, useResizablePanels } from './hooks/useResizablePanels';
import {
  categoryOf,
  useSeriesCategories,
  type SeriesCategoryId,
} from './hooks/useSeriesCategories';
import { useSeriesVolume, type SeriesVolumeState } from './hooks/useSeriesVolume';
import { useStudyCatalog } from './hooks/useStudyCatalog';
import { isMprLayout, useViewportLayout, type ViewportLayout } from './hooks/useViewportLayout';

/** La griglia trascina Cornerstone3D: caricata solo quando serve (P2-08). */
const ViewportGrid = lazy(() =>
  import('./components/ViewportGrid').then((module) => ({ default: module.ViewportGrid })),
);

function seriesPlane(description: string | null): 'axial' | 'coronal' | 'sagittal' | 'other' {
  const value = (description ?? '').toLowerCase();
  if (value.includes('localizer')) return 'other';
  if (value.includes('cor')) return 'coronal';
  if (value.includes('sag')) return 'sagittal';
  if (value.includes('tra') || value.includes('ax')) return 'axial';
  return 'other';
}

function formatSpacing(value: number[] | null): string {
  if (!value || value.length === 0) return '—';
  return `${value.map((item) => item.toFixed(2)).join(' × ')} mm`;
}

function SeriesProperties({ selection }: { selection: SeriesSelection }) {
  const { series } = selection;
  const rows: Array<[string, string]> = [
    ['Modalità', series.modality ?? '—'],
    ['Descrizione', series.description ?? '—'],
    ['Numero serie', series.series_number !== null ? String(series.series_number) : '—'],
    ['Istanze', String(series.instance_count)],
    ['Matrice', series.columns && series.rows ? `${series.columns} × ${series.rows}` : '—'],
    ['Pixel spacing', formatSpacing(series.pixel_spacing)],
    ['Slice spacing', series.slice_spacing ? `${series.slice_spacing.toFixed(2)} mm` : '—'],
    ['Geometria', series.irregular ? 'Irregolare' : 'Regolare'],
  ];

  return (
    <dl className="properties">
      {rows.map(([label, value]) => (
        <div key={label} className="properties__row">
          <dt className="properties__label">{label}</dt>
          <dd className="properties__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface SliceInfo {
  index: number;
  total: number;
}

function PropertiesContent({
  status,
  selection,
  slice,
  volume,
}: {
  status: ApiStatus;
  selection: SeriesSelection | null;
  slice: SliceInfo | null;
  volume: SeriesVolumeState;
}) {
  if (status.state !== 'up') {
    return (
      <StateMessage
        compact
        variant={status.state === 'down' ? 'error' : 'loading'}
        title={status.state === 'down' ? 'API offline' : 'In attesa dei dati…'}
      />
    );
  }
  if (!selection) {
    return (
      <StateMessage
        compact
        variant="empty"
        title="Nessuna serie selezionata"
        description="Seleziona una serie per consultarne metadati e parametri geometrici."
      />
    );
  }
  return (
    <div className="panel__stack">
      <SeriesProperties selection={selection} />
      {slice ? (
        <div className="properties__row">
          <dt className="properties__label">Slice corrente</dt>
          <dd className="properties__value">
            {Math.min(slice.index, slice.total - 1) + 1} / {slice.total}
          </dd>
        </div>
      ) : null}
      <VolumeSection state={volume} />
      <SegmentationPlaceholder />
    </div>
  );
}

/** Oltre questa soglia lo spacing è considerato anisotropo (30% di scarto). */
const ANISOTROPY_RATIO_THRESHOLD = 1.3;

function isAnisotropicSpacing(spacing: number[] | null): boolean {
  if (!spacing) return false;
  const positive = spacing.filter((value) => value > 0);
  if (positive.length === 0) return false;
  return Math.max(...positive) / Math.min(...positive) > ANISOTROPY_RATIO_THRESHOLD;
}

/** Volume derivato della serie con geometria, limiti di spacing e download (P3-01). */
function VolumeSection({ state }: { state: SeriesVolumeState }) {
  if (state.state === 'idle' || state.state === 'loading') {
    return (
      <section className="panel-section" aria-label="Volume">
        <h3 className="panel-section__title">Volume</h3>
        <p className="panel-section__text text-faint">Preparazione del volume…</p>
      </section>
    );
  }

  if (state.state !== 'ready') {
    const message =
      state.state === 'error'
        ? `Volume non disponibile: ${state.message}`
        : 'Nessun volume derivato per questa serie.';
    return (
      <section className="panel-section" aria-label="Volume">
        <h3 className="panel-section__title">Volume</h3>
        <p className="panel-section__text text-faint">{message}</p>
      </section>
    );
  }

  const { volume } = state;
  const rows: Array<[string, string]> = [
    ['Formato', volume.volume_format.toUpperCase()],
    ['Dimensioni', volume.shape ? volume.shape.join(' × ') : '—'],
    ['Spacing', formatSpacing(volume.spacing)],
    ['Geometria', volume.irregular ? 'Irregolare' : 'Regolare'],
  ];

  return (
    <section className="panel-section" aria-label="Volume">
      <h3 className="panel-section__title">Volume</h3>
      <dl className="properties">
        {rows.map(([label, value]) => (
          <div key={label} className="properties__row">
            <dt className="properties__label">{label}</dt>
            <dd className="properties__value">{value}</dd>
          </div>
        ))}
      </dl>
      {isAnisotropicSpacing(volume.spacing) ? (
        <p className="panel-section__text text-faint">
          Spacing anisotropo: i piani MPR avranno risoluzione disomogenea fra gli assi.
        </p>
      ) : null}
      <div className="panel-section__actions">
        <a className="button" href={volumeDownloadUrl(volume.id)} download>
          Scarica volume
        </a>
      </div>
    </section>
  );
}

/** Sezione predisposta per la segmentazione (Fase 4) — P2-07. */
function SegmentationPlaceholder() {
  return (
    <section className="panel-section" aria-label="Segmentazione">
      <h3 className="panel-section__title">Segmentazione</h3>
      <p className="panel-section__text text-faint">
        Gli strumenti di segmentazione manuale e AI saranno disponibili nella Fase 4.
      </p>
    </section>
  );
}

const DEFAULT_MEASUREMENT_COLOR = '#ffff00';
const NARROW_QUERY = '(max-width: 900px)';

function panelsOpenByDefault(): boolean {
  return typeof window === 'undefined' || !window.matchMedia(NARROW_QUERY).matches;
}

export default function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const { status, refresh } = useApiStatus();
  const { state: catalog, reload: reloadCatalog } = useStudyCatalog(status);
  const { categoryFor, isOverridden, setCategory } = useSeriesCategories();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef);
  const { leftWidth, rightWidth, setLeftWidth, setRightWidth } = useResizablePanels();
  const { layout, setLayout, capacity } = useViewportLayout();
  const [leftOpen, setLeftOpen] = useState(panelsOpenByDefault);
  const [rightOpen, setRightOpen] = useState(panelsOpenByDefault);
  const [assignments, setAssignments] = useState<(SeriesSelection | null)[]>([null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [activeTool, setActiveTool] = useState<ViewportTool>('reference');
  const [crosshairSize, setCrosshairSize] = useState<CrosshairSize>('medium');
  const [measurementColor, setMeasurementColor] = useState(DEFAULT_MEASUREMENT_COLOR);
  const [inverted, setInverted] = useState(false);
  const [sliceInfo, setSliceInfo] = useState<Record<string, SliceInfo>>({});
  const selectedCount = useAnnotationSelection();

  const activeViewportId = `risonix-viewport-${activeSlot}`;

  useEffect(() => {
    void applyMeasurementColor(DEFAULT_MEASUREMENT_COLOR);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SliceChangeDetail>).detail;
      if (!detail) return;
      setSliceInfo((current) => ({
        ...current,
        [detail.viewportId]: { index: detail.index, total: detail.total },
      }));
    };
    window.addEventListener(SLICE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(SLICE_CHANGE_EVENT, handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void isViewportInverted(activeViewportId).then((value) => {
      if (!cancelled) setInverted(value);
    });
    return () => {
      cancelled = true;
    };
  }, [activeViewportId, assignments]);

  const renderable = useMemo(() => {
    if (catalog.state !== 'ready') return [];
    return catalog.studies.flatMap((study) =>
      study.series
        .filter((series) => categoryOf(categoryFor(series)).renderable)
        .map((series) => ({ study, series })),
    );
  }, [catalog, categoryFor]);

  /**
   * Ordine di riempimento automatico: prima le serie diagnostiche, una per
   * piano (assiale/coronale/sagittale), poi le altre. Senza questo le localizer
   * (poche fette e orientamenti misti) finivano nelle pane da sincronizzare.
   */
  const autoOrder = useMemo(() => {
    const ranked = [...renderable].sort(
      (first, second) => second.series.instance_count - first.series.instance_count,
    );
    const result: typeof renderable = [];
    const usedPlanes = new Set<string>();
    for (const item of ranked) {
      const plane = seriesPlane(item.series.description);
      if (plane !== 'other' && !usedPlanes.has(plane)) {
        result.push(item);
        usedPlanes.add(plane);
      }
    }
    for (const item of ranked) {
      if (!result.some((entry) => entry.series.id === item.series.id)) result.push(item);
    }
    return result;
  }, [renderable]);

  useEffect(() => {
    setAssignments((current) => {
      const next = current.slice(0, capacity);
      while (next.length < capacity) next.push(null);

      const valid = (selection: SeriesSelection | null) =>
        selection !== null && autoOrder.some((item) => item.series.id === selection.series.id);
      for (let slot = 0; slot < capacity; slot += 1) {
        if (next[slot] && !valid(next[slot])) next[slot] = null;
      }

      const used = new Set(next.filter(valid).map((item) => item!.series.id));
      for (let slot = 0; slot < capacity; slot += 1) {
        if (next[slot] === null) {
          const candidate = autoOrder.find((item) => !used.has(item.series.id));
          if (candidate) {
            next[slot] = candidate;
            used.add(candidate.series.id);
          }
        }
      }
      return next;
    });
    setActiveSlot((current) => Math.min(current, capacity - 1));
  }, [capacity, autoOrder]);

  useEffect(() => {
    void activateTool(activeTool);
  }, [activeTool]);

  const assignActive = useCallback(
    (selection: SeriesSelection) => {
      setAssignments((current) => {
        const next = [...current];
        while (next.length < capacity) next.push(null);
        next[activeSlot] = selection;
        return next.slice(0, capacity);
      });
    },
    [activeSlot, capacity],
  );

  /**
   * Cambio layout: entrando in MPR la serie attiva diventa quella di
   * riferimento per i tre piani, così la modalità mostra ciò che l'utente
   * stava guardando.
   */
  const changeLayout = useCallback(
    (next: ViewportLayout) => {
      if (isMprLayout(next)) {
        setAssignments((current) => {
          const focused = current[activeSlot] ?? current.find((item) => item !== null) ?? null;
          return [focused];
        });
        setActiveSlot(0);
      }
      setLayout(next);
    },
    [activeSlot, setLayout],
  );

  const refreshAll = useCallback(() => {
    void refresh();
    reloadCatalog();
  }, [refresh, reloadCatalog]);

  const changeCrosshairSize = useCallback((size: CrosshairSize) => {
    setCrosshairSize(size);
    void applyCrosshairSize(size);
  }, []);

  const changeMeasurementColor = useCallback((color: string) => {
    setMeasurementColor(color);
    void applyMeasurementColor(color);
  }, []);

  const deleteSelected = useCallback(() => {
    void deleteSelectedAnnotations();
  }, []);

  const editNote = useCallback(() => {
    void getSelectedAnnotationLabel().then((current) => {
      const next = window.prompt('Nota per la misura selezionata:', current);
      if (next === null) return;
      void setSelectedAnnotationLabel(next);
    });
  }, []);

  const rotateActive = useCallback(() => {
    void rotateViewport(activeViewportId, 90);
  }, [activeViewportId]);

  const toggleInvertActive = useCallback(() => {
    void toggleViewportInvert(activeViewportId).then(setInverted);
  }, [activeViewportId]);

  const resetView = useCallback(() => {
    void resetViewports();
    setInverted(false);
  }, []);

  const fitView = useCallback(() => {
    void fitViewports();
  }, []);

  const changeCategory = useCallback(
    (series: SeriesSummary, category: SeriesCategoryId | null) => {
      setCategory(series.series_instance_uid, category);
    },
    [setCategory],
  );

  const activeSelection = assignments[activeSlot] ?? null;
  const { state: volumeState } = useSeriesVolume(activeSelection, status.state === 'up');

  return (
    <div className="app-shell" ref={shellRef}>
      <Toolbar
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        isFullscreen={isFullscreen}
        layout={layout}
        activeTool={activeTool}
        crosshairSize={crosshairSize}
        measurementColor={measurementColor}
        selectedCount={selectedCount}
        inverted={inverted}
        onToggleLeft={() => setLeftOpen((open) => !open)}
        onToggleRight={() => setRightOpen((open) => !open)}
        onToggleFullscreen={toggleFullscreen}
        onLayoutChange={changeLayout}
        onToolChange={setActiveTool}
        onCrosshairSizeChange={changeCrosshairSize}
        onMeasurementColorChange={changeMeasurementColor}
        onDeleteSelected={deleteSelected}
        onEditNote={editNote}
        onRotate={rotateActive}
        onToggleInvert={toggleInvertActive}
        onResetView={resetView}
        onFitView={fitView}
      />

      <div className="app-body">
        {leftOpen ? (
          <Panel
            side="left"
            width={leftWidth}
            title="Studi"
            actions={
              <IconButton label="Aggiorna elenco studi" icon="refresh" onClick={refreshAll} />
            }
          >
            <SeriesExplorer
              status={status}
              catalog={catalog}
              selectedSeriesId={activeSelection?.series.id ?? null}
              categoryFor={categoryFor}
              isOverridden={isOverridden}
              onCategoryChange={changeCategory}
              onSelect={assignActive}
              onReload={reloadCatalog}
            />
          </Panel>
        ) : null}

        {leftOpen ? (
          <Resizer
            side="left"
            value={leftWidth}
            min={PANEL_WIDTH_MIN}
            max={PANEL_WIDTH_MAX}
            onChange={setLeftWidth}
            label="Ridimensiona pannello studi"
          />
        ) : null}

        <Suspense fallback={<div className="viewport-grid" aria-hidden="true" />}>
          <ViewportGrid
            layout={layout}
            status={status}
            assignments={assignments}
            activeSlot={activeSlot}
            onActivate={setActiveSlot}
            onRetry={refresh}
          />
        </Suspense>

        {rightOpen ? (
          <Resizer
            side="right"
            value={rightWidth}
            min={PANEL_WIDTH_MIN}
            max={PANEL_WIDTH_MAX}
            onChange={setRightWidth}
            label="Ridimensiona pannello proprietà"
          />
        ) : null}

        {rightOpen ? (
          <Panel side="right" width={rightWidth} title="Proprietà">
            <PropertiesContent
              status={status}
              selection={activeSelection}
              slice={sliceInfo[activeViewportId] ?? null}
              volume={volumeState}
            />
          </Panel>
        ) : null}
      </div>

      <StatusBar status={status} />
    </div>
  );
}
