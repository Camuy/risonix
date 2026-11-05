import { getRenderingEngine, imageLoader, type Types } from '@cornerstonejs/core';

import { RENDERING_ENGINE_ID } from './engine';

/** ``setRotation`` è protetto nella classe: lo invochiamo via cast controllato. */
type RotatableViewport = Types.IStackViewport & {
  setRotation?: (rotation: number) => void;
};

/** Slice adiacenti precaricate attorno a quella corrente (P2-08). */
const PREFETCH_RADIUS = 2;

const PREFETCH_PRIORITY = -5;

function getViewport(viewportId: string): RotatableViewport | undefined {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID);
  return engine?.getViewport(viewportId) as RotatableViewport | undefined;
}

function allViewports(): RotatableViewport[] {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID);
  if (!engine) return [];
  return engine.getViewports() as RotatableViewport[];
}

/**
 * Ruota la viewport di ``deltaDeg`` (multipli di 90°) accumulando l'angolo
 * corrente e restituisce il nuovo angolo in gradi.
 */
export function rotateViewport(viewportId: string, deltaDeg = 90): number {
  const viewport = getViewport(viewportId);
  if (!viewport?.setRotation) return 0;
  const current = viewport.getRotation();
  const next = (((current + deltaDeg) % 360) + 360) % 360;
  viewport.setRotation(next);
  return next;
}

/** Angolo di rotazione corrente della viewport, in gradi. */
export function getViewportRotation(viewportId: string): number {
  return getViewport(viewportId)?.getRotation() ?? 0;
}

/** Stato di inversione (negativo) della viewport. */
export function isViewportInverted(viewportId: string): boolean {
  return Boolean(getViewport(viewportId)?.getProperties()?.invert);
}

/** Inverte o ripristina la scala di grigi e restituisce il nuovo stato. */
export function toggleViewportInvert(viewportId: string): boolean {
  const viewport = getViewport(viewportId);
  if (!viewport) return false;
  const next = !viewport.getProperties()?.invert;
  viewport.setProperties({ invert: next });
  return next;
}

/**
 * Reimposta la vista di tutte le viewport (rotazione, zoom/pan e camera): è il
 * "reset view" coordinato fra i riquadri dello stesso studio (P2-04/P2-05).
 */
export function resetViewports(): void {
  for (const viewport of allViewports()) {
    viewport.setRotation?.(0);
    viewport.resetCamera();
  }
}

/** Adatta ogni viewport all'immagine (fit to viewport coordinato). */
export function fitViewports(): void {
  for (const viewport of allViewports()) {
    viewport.resetCamera();
  }
}

/**
 * Precarica le slice adiacenti a quella corrente con priorità bassa, così lo
 * scorrimento con rotellina/tastiera resta fluido senza bloccare i caricamenti
 * visibili (progressive loading, P2-08).
 */
export function prefetchNeighborSlices(imageIds: string[], currentIndex: number): void {
  const total = imageIds.length;
  if (total <= 1) return;
  for (let offset = 1; offset <= PREFETCH_RADIUS; offset += 1) {
    for (const index of [currentIndex + offset, currentIndex - offset]) {
      if (index < 0 || index >= total) continue;
      void imageLoader
        .loadAndCacheImage(imageIds[index], {
          priority: PREFETCH_PRIORITY,
          requestType: 'prefetch',
        })
        .catch(() => undefined);
    }
  }
}
