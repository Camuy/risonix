import { getRenderingEngine, utilities as coreUtilities, type Types } from '@cornerstonejs/core';
import { annotation, ToolGroupManager, utilities as toolUtilities } from '@cornerstonejs/tools';

import type { ImageStack } from '../api/stack';
import { TOOL_GROUP_ID } from './engine';

/** Nome del tool Cornerstone che disegna il crosshair condiviso. */
const CROSSHAIR_TOOL_NAME = 'ReferenceCursors';

/** Geometria di una slice: posizione del piano (IPP) e normale unitaria. */
interface SliceGeometry {
  position: readonly number[];
  normal: readonly number[];
}

/** Geometria per image id, condivisa fra i viewport. */
const geometries = new Map<string, SliceGeometry>();

/** Viewport correntemente montati, candidati alla sincronizzazione. */
const mountedViewports = new Set<string>();

/** Viewport aggiornati programmaticamente: i loro eventi non devono ripropagare. */
const suppressedViewports = new Set<string>();
const suppressionTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Elementi in cui il VOI è stato aggiornato automaticamente da un allineamento
 * di slice: il cambio non deve essere propagato dal sincronizzatore VOI, così
 * il contrasto bloccato in ciascun viewport resta invariato.
 */
const suppressedVoiElements = new WeakSet<HTMLDivElement>();

export function isVoiSyncSuppressed(element: HTMLElement): boolean {
  return suppressedVoiElements.has(element as HTMLDivElement);
}

/**
 * Punto 3D condiviso (crosshair) per FrameOfReferenceUID: è l'ancora anatomica
 * su cui si allineano tutte le viewport, complanari e ortogonali (P2-05).
 */
const focusPoints = new Map<string, number[]>();

/** Richiesta accodata mentre una propagazione è già in corso. */
let pendingPropagation: { engineId: string; forUID: string } | null = null;

let propagating = false;

/** Normale unitaria della slice da ImageOrientationPatient (row, column). */
function normalFromOrientation(orientation: readonly number[] | null): number[] | null {
  if (!orientation || orientation.length !== 6) return null;
  const [rx, ry, rz, cx, cy, cz] = orientation;
  const nx = ry * cz - rz * cy;
  const ny = rz * cx - rx * cz;
  const nz = rx * cy - ry * cx;
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) return null;
  return [nx / length, ny / length, nz / length];
}

/** Distanza con segno del punto dal piano della slice. */
function signedDistance(geometry: SliceGeometry, point: readonly number[]): number {
  const [px, py, pz] = geometry.position;
  const [nx, ny, nz] = geometry.normal;
  return (point[0] - px) * nx + (point[1] - py) * ny + (point[2] - pz) * nz;
}

/** Registra la geometria di uno stack perché sia nota prima del caricamento. */
export function registerSlicePositions(stack: ImageStack): void {
  for (const entry of stack.entries) {
    const normal = normalFromOrientation(entry.orientation);
    if (entry.position && normal) {
      geometries.set(entry.imageId, { position: entry.position, normal });
    }
  }
}

export function registerViewport(viewportId: string): void {
  mountedViewports.add(viewportId);
}

export function unregisterViewport(viewportId: string): void {
  mountedViewports.delete(viewportId);
  suppressedViewports.delete(viewportId);
  const timer = suppressionTimers.get(viewportId);
  if (timer) {
    clearTimeout(timer);
    suppressionTimers.delete(viewportId);
  }
}

/**
 * Consuma la soppressione al primo evento di stack: gli eventi programmatici
 * non ripropagano, ma la navigazione utente successiva torna a sincronizzare.
 */
export function consumePropagationSuppression(viewportId: string): boolean {
  if (!suppressedViewports.has(viewportId)) return false;
  suppressedViewports.delete(viewportId);
  const timer = suppressionTimers.get(viewportId);
  if (timer) {
    clearTimeout(timer);
    suppressionTimers.delete(viewportId);
  }
  return true;
}

/**
 * Sospende un viewport abbastanza a lungo da coprire il caricamento asincrono
 * della slice programmatica; il timeout evita sospensioni permanenti.
 */
function suppressViewport(viewportId: string): void {
  suppressedViewports.add(viewportId);
  const existing = suppressionTimers.get(viewportId);
  if (existing) {
    clearTimeout(existing);
  }
  suppressionTimers.set(
    viewportId,
    setTimeout(() => {
      suppressedViewports.delete(viewportId);
      suppressionTimers.delete(viewportId);
    }, 2000),
  );
}

/** Viewport montati che condividono il FrameOfReferenceUID. */
function sharedViewportIds(engineId: string, forUID: string): string[] {
  const engine = getRenderingEngine(engineId);
  if (!engine) return [];
  const viewportIds: string[] = [];
  for (const viewportId of mountedViewports) {
    const viewport = engine.getViewport(viewportId);
    if (!viewport) continue;
    if (viewport.getFrameOfReferenceUID?.() !== forUID) continue;
    viewportIds.push(viewportId);
  }
  return viewportIds;
}

/** Indice della slice del viewport il cui piano è più vicino al punto 3D. */
function closestIndexForPoint(
  target: Types.IStackViewport,
  point: readonly number[],
): number | null {
  const imageIds = target.getImageIds();
  const reference = geometries.get(target.getCurrentImageId());
  const referenceNormal = reference?.normal ?? null;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < imageIds.length; index += 1) {
    const geometry = geometries.get(imageIds[index]);
    if (!geometry) continue;
    // Su serie a orientamenti misti (es. localizer) resta nel gruppo corrente,
    // così la vista non salta fra piani non confrontabili.
    if (
      referenceNormal &&
      Math.abs(
        geometry.normal[0] * referenceNormal[0] +
          geometry.normal[1] * referenceNormal[1] +
          geometry.normal[2] * referenceNormal[2],
      ) < 0.9
    ) {
      continue;
    }
    const currentDistance = Math.abs(signedDistance(geometry, point));
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestIndex = index;
    }
  }

  if (bestIndex !== -1) return bestIndex;

  // Fallback: geometria non registrata per questo stack, usa i metadati
  // Cornerstone (piano per piano) come rete di sicurezza.
  try {
    return coreUtilities.getClosestStackImageIndexForPoint(
      [point[0], point[1], point[2]] as Types.Point3,
      target,
    );
  } catch {
    return null;
  }
}

/** Allinea un viewport alla slice che contiene il punto 3D condiviso. */
async function alignViewport(
  target: Types.IStackViewport,
  viewportId: string,
  point: readonly number[],
): Promise<void> {
  const index = closestIndexForPoint(target, point);
  if (index === null || index === target.getCurrentImageIdIndex()) return;

  suppressViewport(viewportId);
  const element = target.element as HTMLDivElement | undefined;
  if (element) suppressedVoiElements.add(element);
  try {
    await target.setImageIdIndex(index);
  } catch {
    // Un target non pronto si riallineerà al prossimo movimento.
  } finally {
    if (element) suppressedVoiElements.delete(element);
  }
}

/** Crea il crosshair se non esiste ancora (es. primo scroll, touch su mobile). */
function ensureCrosshair(
  engineId: string,
  forUID: string,
  point: readonly number[],
): void {
  const engine = getRenderingEngine(engineId);
  if (!engine) return;
  const viewportIds = sharedViewportIds(engineId, forUID);
  if (!viewportIds.length) return;
  const element = engine.getViewport(viewportIds[0])?.element;
  if (!element) return;
  if (annotation.state.getAnnotations(CROSSHAIR_TOOL_NAME, element)?.length) return;

  const tool = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)?.getToolInstance(
    CROSSHAIR_TOOL_NAME,
  ) as { createInitialAnnotation?: (world: Types.Point3, el: HTMLDivElement) => void } | undefined;
  tool?.createInitialAnnotation?.([point[0], point[1], point[2]], element);
}

/** Sposta il crosshair condiviso sul punto 3D e ridisegna tutte le viewport. */
function redrawCrosshair(engineId: string, forUID: string): void {
  const engine = getRenderingEngine(engineId);
  const point = focusPoints.get(forUID);
  if (!engine || !point) return;

  const viewportIds = sharedViewportIds(engineId, forUID);
  if (!viewportIds.length) return;
  const element = engine.getViewport(viewportIds[0])?.element;
  if (!element) return;

  ensureCrosshair(engineId, forUID, point);

  const annotations = annotation.state.getAnnotations(CROSSHAIR_TOOL_NAME, element);
  const crosshair = annotations?.[0];
  if (!crosshair?.data?.handles?.points) return;

  crosshair.data.handles.points = [[point[0], point[1], point[2]]];
  crosshair.invalidated = true;
  toolUtilities.triggerAnnotationRenderForViewportIds(viewportIds);
}

/** Esegue un passaggio: allinea tutti i viewport al punto condiviso e ridisegna. */
async function runAlignment(engineId: string, forUID: string): Promise<void> {
  const engine = getRenderingEngine(engineId);
  const point = focusPoints.get(forUID);
  if (!engine || !point) return;

  const viewportIds = sharedViewportIds(engineId, forUID);
  await Promise.all(
    viewportIds.map((viewportId) => {
      const target = engine.getViewport(viewportId) as Types.IStackViewport | undefined;
      if (!target?.getImageIds) return Promise.resolve();
      return alignViewport(target, viewportId, point);
    }),
  );
  redrawCrosshair(engineId, forUID);
}

/**
 * Allinea tutte le viewport dello stesso FrameOfReferenceUID al punto 3D
 * condiviso. Le richieste concorrenti non vengono scartate: l'ultima è accodata
 * e rieseguita subito dopo, così lo scroll rapido resta sempre allineato.
 */
function syncViewports(engineId: string, forUID: string): void {
  if (propagating) {
    pendingPropagation = { engineId, forUID };
    return;
  }

  propagating = true;
  void (async () => {
    try {
      let request: { engineId: string; forUID: string } | null = { engineId, forUID };
      while (request) {
        await runAlignment(request.engineId, request.forUID);
        request = pendingPropagation;
        pendingPropagation = null;
      }
    } finally {
      propagating = false;
    }
  })();
}

/**
 * Allinea una viewport appena montata al punto 3D condiviso. Se il
 * FrameOfReference non ha ancora un focus lo inizializza al centro della
 * viewport, così il crosshair esiste fin dal primo render (utile su touch).
 */
export function initializeFocus(engineId: string, viewportId: string): void {
  const engine = getRenderingEngine(engineId);
  const viewport = engine?.getViewport(viewportId) as Types.IStackViewport | undefined;
  if (!engine || !viewport?.getFrameOfReferenceUID) return;

  const forUID = viewport.getFrameOfReferenceUID();
  if (!forUID) return;

  if (!focusPoints.has(forUID)) {
    const element = viewport.element;
    try {
      const world = viewport.canvasToWorld([element.clientWidth / 2, element.clientHeight / 2]);
      focusPoints.set(forUID, [world[0], world[1], world[2]]);
    } catch {
      return;
    }
  }

  syncViewports(engineId, forUID);
}

/**
 * Il cursore si muove sulla viewport ``sourceViewportId``: il punto 3D del mouse
 * diventa l'ancora anatomica e tutte le altre viewport vi si allineano, sia
 * complanari sia ortogonali (P2-05).
 */
export function handleCursorMove(
  engineId: string,
  sourceViewportId: string,
  worldPoint: readonly number[],
): void {
  const engine = getRenderingEngine(engineId);
  const source = engine?.getViewport(sourceViewportId) as Types.IStackViewport | undefined;
  if (!engine || !source) return;
  if (worldPoint.some((value) => Number.isNaN(value))) return;

  const forUID = source.getFrameOfReferenceUID?.();
  if (!forUID) return;

  focusPoints.set(forUID, [worldPoint[0], worldPoint[1], worldPoint[2]]);
  syncViewports(engineId, forUID);
}

/**
 * La slice della viewport ``sourceViewportId`` è cambiata (rotellina, tastiera o
 * slider): il punto condiviso viene proiettato sul nuovo piano e tutte le
 * viewport seguono, incluse quelle ortogonali (P2-05).
 */
export function handleSliceChange(engineId: string, sourceViewportId: string): void {
  const engine = getRenderingEngine(engineId);
  const source = engine?.getViewport(sourceViewportId) as Types.IStackViewport | undefined;
  if (!engine || !source) return;

  const forUID = source.getFrameOfReferenceUID?.();
  if (!forUID) return;

  const currentPoint = focusPoints.get(forUID);
  const geometry = geometries.get(source.getCurrentImageId());

  let point: number[] | null = null;
  if (currentPoint && geometry) {
    const offset = signedDistance(geometry, currentPoint);
    point = [
      currentPoint[0] - offset * geometry.normal[0],
      currentPoint[1] - offset * geometry.normal[1],
      currentPoint[2] - offset * geometry.normal[2],
    ];
  } else {
    const element = source.element;
    try {
      const world = source.canvasToWorld([element.clientWidth / 2, element.clientHeight / 2]);
      point = [world[0], world[1], world[2]];
    } catch {
      point = null;
    }
  }

  if (!point) return;
  focusPoints.set(forUID, point);
  syncViewports(engineId, forUID);
}
