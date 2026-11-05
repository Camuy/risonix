import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core';
import { annotation, Enums as ToolsEnums, ToolGroupManager } from '@cornerstonejs/tools';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ImageStack } from '../api/stack';
import {
  deleteSelectedAnnotations,
  ensureEngine,
  ensureToolGroup,
  getActiveViewportTool,
  REFERENCE_TOOL_NAME,
  RENDERING_ENGINE_ID,
  TOOL_GROUP_ID,
} from '../cornerstone/engine';
import {
  consumePropagationSuppression,
  handleCursorMove,
  handleSliceChange,
  initializeFocus,
  isVoiSyncSuppressed,
  registerSlicePositions,
  registerViewport,
  unregisterViewport,
} from '../cornerstone/sliceSync';
import {
  registerPresentationSync,
  unregisterPresentationSync,
} from '../cornerstone/presentationSync';
import { prefetchNeighborSlices } from '../cornerstone/viewportControls';
import { ensureSeriesVolume } from '../cornerstone/volume';
import { SLICE_CHANGE_EVENT, type SliceChangeDetail } from '../cornerstone/events';
import { StateMessage } from './StateMessage';

interface StackViewportProps {
  stack: ImageStack;
  viewportId: string;
  active: boolean;
  onActivate: () => void;
}

function seriesLabel(stack: ImageStack): string {
  const modality = stack.series.modality ?? 'Serie';
  const description = stack.series.description ?? stack.series.series_instance_uid;
  return `${modality} · ${description}`;
}

interface OrientationLabels {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

/** Direzioni anatomiche nel sistema paziente DICOM (x=L, y=P, z=S). */
const ANATOMICAL_AXES: Array<[string, readonly number[]]> = [
  ['L', [1, 0, 0]],
  ['R', [-1, 0, 0]],
  ['P', [0, 1, 0]],
  ['A', [0, -1, 0]],
  ['S', [0, 0, 1]],
  ['I', [0, 0, -1]],
];

const OPPOSITE: Record<string, string> = { L: 'R', R: 'L', P: 'A', A: 'P', S: 'I', I: 'S' };

/** Etichetta anatomica più vicina alla direzione data. */
function nearestLabel(vector: readonly number[]): string {
  let label = '?';
  let best = Number.NEGATIVE_INFINITY;
  for (const [candidate, axis] of ANATOMICAL_AXES) {
    const dot = vector[0] * axis[0] + vector[1] * axis[1] + vector[2] * axis[2];
    if (dot > best) {
      best = dot;
      label = candidate;
    }
  }
  return label;
}

/** Etichette A/P/L/R dai vettori di camera del viewport (P2-06). */
function computeOrientation(viewport: Types.IStackViewport): OrientationLabels | null {
  const camera = viewport.getCamera();
  const normal = camera.viewPlaneNormal;
  const up = camera.viewUp;
  if (!normal || !up) return null;

  const right = [
    normal[1] * up[2] - normal[2] * up[1],
    normal[2] * up[0] - normal[0] * up[2],
    normal[0] * up[1] - normal[1] * up[0],
  ];
  const top = nearestLabel(up);
  const rightLabel = nearestLabel(right);
  return {
    top,
    bottom: OPPOSITE[top] ?? '?',
    right: rightLabel,
    left: OPPOSITE[rightLabel] ?? '?',
  };
}

/** Posizione canvas del crosshair condiviso, per l'hit-test su touch. */
function crosshairCanvasPoint(
  element: HTMLDivElement,
  viewport: Types.IStackViewport,
): [number, number] | null {
  const annotations = annotation.state.getAnnotations(
    REFERENCE_TOOL_NAME,
    element,
  ) as unknown as Array<{ data?: { handles?: { points?: number[][] } } }>;
  const point = annotations?.[0]?.data?.handles?.points?.[0];
  if (!point) return null;
  try {
    const canvas = viewport.worldToCanvas([point[0], point[1], point[2]]);
    return [canvas[0], canvas[1]];
  } catch {
    return null;
  }
}

/**
 * Viewport di stack Cornerstone3D (P2-02/P2-04/P2-05): usa l'engine e il tool
 * group condivisi così il crosshair resta sincronizzato fra i viewport. La
 * navigazione slice avviene con rotellina, tastiera o slider.
 */
export function StackViewport({ stack, viewportId, active, onActivate }: StackViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Types.IStackViewport | null>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const initializedRef = useRef(false);
  const activeRef = useRef(active);
  const onActivateRef = useRef(onActivate);
  const lockedVoiRef = useRef<{ lower: number; upper: number } | null>(null);
  const sliceChangeRef = useRef(false);
  const sliceChangeTimerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orientation, setOrientation] = useState<OrientationLabels | null>(null);

  const sliceCount = stack.imageIds.length;
  const middleIndex = Math.floor(sliceCount / 2);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let disposed = false;
    initializedRef.current = false;

    const announceSlice = (index: number) => {
      window.dispatchEvent(
        new CustomEvent<SliceChangeDetail>(SLICE_CHANGE_EVENT, {
          detail: { viewportId, index, total: sliceCount },
        }),
      );
    };

    const renderStack = async () => {
      const engine = await ensureEngine();
      const toolGroup = await ensureToolGroup();
      if (disposed) return;

      if (engine.getViewport(viewportId)) {
        engine.disableElement(viewportId);
      }
      engine.enableElement({
        viewportId,
        type: Enums.ViewportType.STACK,
        element,
      });
      const viewport = engine.getViewport<Types.IStackViewport>(viewportId);
      viewportRef.current = viewport;

      toolGroup?.addViewport(viewportId, RENDERING_ENGINE_ID);

      registerSlicePositions(stack);
      await viewport.setStack(stack.imageIds, middleIndex);
      if (disposed) return;

      // Blocca il VOI iniziale: il contrasto non deve cambiare passando da una
      // slice all'altra (l'utente lo modifica solo con Finestra e livello).
      try {
        const initialRange = viewport.getProperties()?.voiRange ?? lockedVoiRef.current;
        if (
          initialRange &&
          typeof initialRange.lower === 'number' &&
          typeof initialRange.upper === 'number'
        ) {
          lockedVoiRef.current = {
            lower: initialRange.lower,
            upper: initialRange.upper,
          };
          viewport.setProperties({ voiRange: lockedVoiRef.current }, true);
        }
      } catch {
        /* proprietà non ancora disponibili */
      }

      registerViewport(viewportId);

      setError(null);
      setCurrentIndex(middleIndex);
      viewport.render();
      setOrientation(computeOrientation(viewport));
      initializedRef.current = true;
      prefetchNeighborSlices(stack.imageIds, middleIndex);
      announceSlice(middleIndex);

      // Prepara il volume streaming della serie (P3-01): è la base geometrica
      // di MPR e 3D. Non viene aggiunto alle viewport, quindi il rendering a
      // stack resta invariato; il volume è opzionale e non blocca la vista.
      void ensureSeriesVolume(stack.series.id, stack.imageIds).catch(() => {
        /* volume non disponibile: il viewer a stack continua a funzionare */
      });

      const forUID = viewport.getFrameOfReferenceUID();
      if (forUID) {
        registerPresentationSync(forUID, viewportId);
        initializeFocus(RENDERING_ENGINE_ID, viewportId);
      }
    };

    const activate = () => {
      activeRef.current = true;
      onActivateRef.current();
    };

    /**
     * Blocca il contrasto: durante il cambio slice il VOI automatico della
     * nuova immagine viene ignorato e si ripristina quello corrente.
     */
    const markSliceChange = () => {
      sliceChangeRef.current = true;
      if (sliceChangeTimerRef.current !== null) {
        window.clearTimeout(sliceChangeTimerRef.current);
      }
      sliceChangeTimerRef.current = window.setTimeout(() => {
        sliceChangeRef.current = false;
        sliceChangeTimerRef.current = null;
      }, 2000);
    };

    const handleVoiModified = (event: Event) => {
      // Cambio VOI automatico durante lo scroll o l'allineamento crosshair:
      // non deve aggiornare il VOI bloccato né propagarsi agli altri viewport.
      if (sliceChangeRef.current || isVoiSyncSuppressed(element)) {
        event.stopImmediatePropagation();
        return;
      }
      const detail = (event as CustomEvent<{ range?: { lower?: number; upper?: number } }>).detail;
      const range = detail?.range;
      if (range && typeof range.lower === 'number' && typeof range.upper === 'number') {
        lockedVoiRef.current = { lower: range.lower, upper: range.upper };
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      activate();
      markSliceChange();
      viewportRef.current?.scroll(event.deltaY > 0 ? 1 : -1);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          activate();
          markSliceChange();
          viewport.scroll(1);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          activate();
          markSliceChange();
          viewport.scroll(-1);
          break;
        case 'Home':
          event.preventDefault();
          activate();
          markSliceChange();
          void viewport.setImageIdIndex(0);
          break;
        case 'End':
          event.preventDefault();
          activate();
          markSliceChange();
          void viewport.setImageIdIndex(sliceCount - 1);
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          activate();
          deleteSelectedAnnotations();
          break;
        default:
          break;
      }
    };

    const handleMouseMove = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          currentPoints?: { canvas: number[]; world: number[] };
        }>
      ).detail;
      const points = detail?.currentPoints;
      if (!points?.world || !initializedRef.current) return;
      handleCursorMove(RENDERING_ENGINE_ID, viewportId, points.world);
      // Coordinate fisiche (mm, spazio paziente) scritte direttamente nel DOM:
      // nessun re-render React a ogni movimento del mouse (P2-04/P2-06/P2-08).
      if (coordsRef.current) {
        const [x, y, z] = points.world;
        coordsRef.current.textContent = `X ${x.toFixed(1)}  Y ${y.toFixed(1)}  Z ${z.toFixed(1)} mm`;
      }
    };

    let touchLastY = 0;
    let touchMode: 'scroll' | 'crosshair' | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchMode = null;
        return;
      }
      touchLastY = event.touches[0].clientY;
      activate();

      if (getActiveViewportTool() !== 'reference') {
        touchMode = null;
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        touchMode = 'scroll';
        return;
      }

      const crosshair = crosshairCanvasPoint(element, viewport);
      if (!crosshair) {
        touchMode = 'scroll';
        return;
      }

      const rect = element.getBoundingClientRect();
      const touchX = event.touches[0].clientX - rect.left;
      const touchY = event.touches[0].clientY - rect.top;
      const distance = Math.hypot(touchX - crosshair[0], touchY - crosshair[1]);
      touchMode = distance <= 28 ? 'crosshair' : 'scroll';
    };

    const handleTouchMove = (event: TouchEvent) => {
      // Con uno strumento attivo il gesto appartiene al tool (misura, pan, zoom,
      // finestra/livello); solo il cursore usa lo swipe per cambiare slice.
      if (getActiveViewportTool() !== 'reference') return;
      if (event.touches.length !== 1) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      if (touchMode === 'crosshair') {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const x = event.touches[0].clientX - rect.left;
        const y = event.touches[0].clientY - rect.top;
        const world = viewport.canvasToWorld([x, y]);
        handleCursorMove(RENDERING_ENGINE_ID, viewportId, world);
        touchLastY = event.touches[0].clientY;
        return;
      }

      if (touchMode !== 'scroll') return;

      const delta = event.touches[0].clientY - touchLastY;
      if (Math.abs(delta) < 12) return;
      event.preventDefault();
      const steps = Math.trunc(-delta / 12);
      if (steps !== 0) {
        markSliceChange();
        viewport.scroll(steps);
        touchLastY = event.touches[0].clientY;
      }
    };

    const handleTouchEnd = () => {
      touchMode = null;
    };

    const handleNewImage = (event: Event) => {
      const detail = (event as CustomEvent<{ imageIdIndex: number }>).detail;
      setCurrentIndex(detail.imageIdIndex);
      prefetchNeighborSlices(stack.imageIds, detail.imageIdIndex);
      announceSlice(detail.imageIdIndex);

      // Fine del cambio slice: da qui in poi i cambi VOI sono intenzionali.
      if (sliceChangeTimerRef.current !== null) {
        window.clearTimeout(sliceChangeTimerRef.current);
        sliceChangeTimerRef.current = null;
      }
      sliceChangeRef.current = false;

      const viewport = viewportRef.current;
      if (viewport) {
        const locked = lockedVoiRef.current;
        if (locked) {
          try {
            const current = viewport.getProperties();
            const range = current?.voiRange;
            const changed =
              !range ||
              Math.abs((range.lower ?? 0) - locked.lower) > 1e-3 ||
              Math.abs((range.upper ?? 0) - locked.upper) > 1e-3;
            if (changed) {
              viewport.setProperties({ voiRange: locked }, true);
            }
          } catch {
            /* viewport non ancora pronta */
          }
        } else {
          try {
            const range = viewport.getProperties()?.voiRange;
            if (range && typeof range.lower === 'number' && typeof range.upper === 'number') {
              lockedVoiRef.current = { lower: range.lower, upper: range.upper };
              // Blocca subito: evita che un cambio VOI automatico di questo
              // viewport venga propagato agli altri dal sincronizzatore.
              viewport.setProperties({ voiRange: lockedVoiRef.current }, true);
            }
          } catch {
            /* viewport non ancora pronta */
          }
        }
      }

      if (!initializedRef.current) return;
      if (consumePropagationSuppression(viewportId)) return;
      if (!activeRef.current) return;
      handleSliceChange(RENDERING_ENGINE_ID, viewportId);
    };

    element.tabIndex = 0;
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('keydown', handleKeyDown);
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);
    element.addEventListener(ToolsEnums.Events.MOUSE_MOVE, handleMouseMove);
    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, handleNewImage);
    element.addEventListener(Enums.Events.VOI_MODIFIED, handleVoiModified);

    renderStack().catch((cause: unknown) => {
      if (disposed) return;
      setError(cause instanceof Error ? cause.message : 'Errore di rendering della serie');
    });

    return () => {
      disposed = true;
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
      element.removeEventListener(ToolsEnums.Events.MOUSE_MOVE, handleMouseMove);
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, handleNewImage);
      element.removeEventListener(Enums.Events.VOI_MODIFIED, handleVoiModified);
      if (sliceChangeTimerRef.current !== null) {
        window.clearTimeout(sliceChangeTimerRef.current);
        sliceChangeTimerRef.current = null;
      }

      const viewport = viewportRef.current;
      const forUID = viewport?.getFrameOfReferenceUID?.();
      if (forUID) {
        unregisterPresentationSync(forUID, viewportId);
      }
      viewportRef.current = null;
      unregisterViewport(viewportId);
      ToolGroupManager.getToolGroup(TOOL_GROUP_ID)?.removeViewports(
        RENDERING_ENGINE_ID,
        viewportId,
      );
      getRenderingEngine(RENDERING_ENGINE_ID)?.disableElement(viewportId);
    };
  }, [stack, viewportId, middleIndex, sliceCount]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      void ensureEngine().then((engine) => engine.resize(true, true));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const goToIndex = useCallback((index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    activeRef.current = true;
    onActivateRef.current();
    setCurrentIndex(index);
    sliceChangeRef.current = true;
    if (sliceChangeTimerRef.current !== null) {
      window.clearTimeout(sliceChangeTimerRef.current);
    }
    sliceChangeTimerRef.current = window.setTimeout(() => {
      sliceChangeRef.current = false;
      sliceChangeTimerRef.current = null;
    }, 2000);
    void viewport.setImageIdIndex(index);
  }, []);

  const sliceLabel = error
    ? ''
    : `Slice ${Math.min(currentIndex, sliceCount - 1) + 1} / ${sliceCount}`;

  return (
    <div className="viewport__canvas-host" data-active={active} onMouseDown={onActivate}>
      <div ref={elementRef} className="viewport__canvas" />

      {orientation ? (
        <div className="viewport__orientation" aria-hidden="true">
          <span className="viewport__orientation-label viewport__orientation-label--top">
            {orientation.top}
          </span>
          <span className="viewport__orientation-label viewport__orientation-label--right">
            {orientation.right}
          </span>
          <span className="viewport__orientation-label viewport__orientation-label--bottom">
            {orientation.bottom}
          </span>
          <span className="viewport__orientation-label viewport__orientation-label--left">
            {orientation.left}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="viewport__overlay viewport__overlay--error">
          <StateMessage
            variant="error"
            title="Rendering non riuscito"
            description={error}
            action={
              <span className="text-faint">Verifica che la serie sia leggibile come DICOM.</span>
            }
          />
        </div>
      ) : (
        <>
          <div className="viewport__overlay" aria-live="polite">
            <span className="viewport__overlay-line">{seriesLabel(stack)}</span>
            <span className="viewport__overlay-line">{sliceLabel}</span>
            {sliceCount > 1 ? (
              <span className="viewport__overlay-hint">Rotellina o ↑↓ per scorrere</span>
            ) : null}
          </div>

          <div className="viewport__coords" aria-hidden="true">
            <span ref={coordsRef} className="mono" />
          </div>

          {sliceCount > 1 ? (
            <div className="viewport__scrubber">
              <input
                type="range"
                className="scrubber"
                min={0}
                max={sliceCount - 1}
                value={Math.min(currentIndex, sliceCount - 1)}
                onChange={(event) => goToIndex(Number(event.target.value))}
                aria-label="Navigazione slice"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
