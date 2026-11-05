import {
  eventTarget,
  getEnabledElement,
  getRenderingEngine,
  RenderingEngine,
  utilities as coreUtilities,
  type Types,
} from '@cornerstonejs/core';
import {
  addTool,
  AngleTool,
  annotation,
  drawing,
  Enums,
  LengthTool,
  PanTool,
  PlanarFreehandROITool,
  ProbeTool,
  ReferenceCursors,
  SplineROITool,
  ToolGroupManager,
  utilities as toolUtilities,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';

import { ensureCornerstone } from './init';

/** Rendering engine e tool group condivisi da tutti i viewport (P2-05). */
export const RENDERING_ENGINE_ID = 'risonix-rendering-engine';
export const TOOL_GROUP_ID = 'risonix-tools';
export const REFERENCE_TOOL_NAME = 'ReferenceCursors';

/** Strumento interattivo selezionabile dalla toolbar (P2-06). */
export type ViewportTool =
  | 'reference'
  | 'length'
  | 'angle'
  | 'spline'
  | 'freehand'
  | 'probe'
  | 'pan'
  | 'zoom'
  | 'windowLevel';

/** Dimensione del crosshair indipendente dallo zoom dell'immagine. */
export type CrosshairSize = 'small' | 'medium' | 'large';

/** Strumenti che modificano l'immagine o creano annotazioni. */
const INTERACTION_TOOLS = [
  LengthTool,
  AngleTool,
  SplineROITool,
  PlanarFreehandROITool,
  ProbeTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
] as const;

/** Strumenti che producono annotazioni (possono essere mostrate cross-view). */
const ANNOTATION_TOOLS = [
  LengthTool,
  AngleTool,
  SplineROITool,
  PlanarFreehandROITool,
  ProbeTool,
] as const;

const TOOL_NAME_BY_MODE: Record<ViewportTool, string | null> = {
  reference: null,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  spline: SplineROITool.toolName,
  freehand: PlanarFreehandROITool.toolName,
  probe: ProbeTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  windowLevel: WindowLevelTool.toolName,
};

/** Geometria del crosshair in pixel canvas, per ogni dimensione. */
const CROSSHAIR_GEOMETRY: Record<CrosshairSize, { gap: number; length: number }> = {
  small: { gap: 6, length: 4 },
  medium: { gap: 10, length: 6 },
  large: { gap: 16, length: 10 },
};

/** La sonda è una sfera: raggio iniziale e raggio minimo in millimetri. */
const SPHERE_PROBE_DEFAULT_RADIUS = 3;
const SPHERE_PROBE_MIN_RADIUS = 0.5;

type SvgDrawingHelper = Parameters<typeof drawing.drawLine>[0];

interface AnnotationLike {
  annotationUID: string;
  isVisible?: boolean;
  highlighted?: boolean;
  invalidated?: boolean;
  metadata?: { viewPlaneNormal?: number[]; toolName?: string; referencedImageId?: string };
  data?: {
    isCanvasAnnotation?: boolean;
    label?: string;
    sphereProbe?: boolean;
    cachedStats?: Record<string, Record<string, unknown> | undefined>;
    handles?: {
      points?: number[][];
      textBox?: { worldPosition?: number[] };
    };
    contour?: { closed?: boolean; polyline?: number[][] };
  };
}

type AnnotationPlacement = 'in-plane' | 'projected' | 'hidden';

interface AnnotationToolInstance {
  filterInteractableAnnotationsForElement?: (
    element: HTMLDivElement,
    annotations: AnnotationLike[],
  ) => AnnotationLike[];
  renderAnnotation?: (enabledElement: Types.IEnabledElement, helper: SvgDrawingHelper) => boolean;
  getAnnotationStyle?: (options: {
    annotation: AnnotationLike;
    styleSpecifier: Record<string, unknown>;
  }) => { color?: string; fillColor?: string; fillOpacity?: number; lineWidth?: number; lineDash?: string };
}

interface TargetImageData {
  imageData?: {
    origin?: number[];
    direction?: number[];
    dimensions?: number[];
  };
  dimensions?: number[];
  metadata?: { Modality?: string };
  voxelManager?: { getAtIJKPoint: (ijk: number[]) => unknown };
}

interface ProbeToolInstance extends AnnotationToolInstance {
  __risonixSpherePatched?: boolean;
  __risonixClipPatched?: boolean;
  addNewAnnotation?: (evt: Event, interactionType?: string) => AnnotationLike | undefined;
  _dragCallback?: (evt: Event) => void;
  _activateModify?: (element: HTMLDivElement) => void;
  editData?: {
    annotation?: AnnotationLike;
    viewportIdsToRender?: string[];
    newAnnotation?: boolean;
    handleIndex?: number;
  };
  isPointNearTool?: (
    element: HTMLDivElement,
    annotation: AnnotationLike,
    canvasCoords: number[],
    proximity: number,
  ) => boolean;
  getHandleNearImagePoint?: (
    element: HTMLDivElement,
    annotation: AnnotationLike,
    canvasCoords: number[],
    proximity: number,
  ) => number[] | undefined;
  handleSelectedCallback?: (
    evt: Event,
    annotation: AnnotationLike,
    handle?: number[],
  ) => void;
  getLinkedTextBoxStyle?: (
    styleSpecifier: Record<string, unknown>,
    annotation: AnnotationLike,
  ) => Record<string, unknown>;
  getTargetId?: (viewport: Types.IStackViewport, data: unknown) => string;
  getTargetImageData?: (targetId: string) => TargetImageData | undefined;
  configuration?: {
    getTextLines?: (data: unknown, targetId: string) => string[] | undefined;
  };
  _calculateCachedStats?: (
    annotation: AnnotationLike,
    renderingEngine: unknown,
    enabledElement: Types.IEnabledElement,
  ) => unknown;
}

interface SplineToolInstance extends AnnotationToolInstance {
  __risonixSplinePatched?: boolean;
  _mouseDownCallback?: (evt: Event) => void;
  _endCallback?: (evt: Event) => void;
  doneEditMemo?: () => void;
  isTouchTapEchoOfLiftCommit?: (canvasPoint: number[]) => boolean;
  editData?: {
    annotation?: AnnotationLike;
    viewportIdsToRender?: string[];
    movingTextBox?: boolean;
    handleIndex?: number;
    lastCanvasPoint?: number[];
    closeCurveDistance?: number;
  };
  configuration?: {
    allowOpenSplines?: boolean;
    spline?: { touchCloseCurveDistance?: number };
  };
}

interface CrosshairToolInstance {
  renderAnnotation: (enabledElement: Types.IEnabledElement, helper: SvgDrawingHelper) => boolean;
  getStyle: (
    property: string,
    styleSpecifier: Record<string, unknown>,
    annotation: AnnotationLike,
  ) => string | number | undefined;
  filterInteractableAnnotationsForElement: (
    element: HTMLDivElement,
    annotations: AnnotationLike[],
  ) => AnnotationLike[];
  getHandleNearImagePoint?: () => undefined;
  isPointNearTool?: () => false;
}

let toolsRegistered = false;
let activeViewportTool: ViewportTool = 'reference';
let crosshairSize: CrosshairSize = 'medium';
const CROSSHAIR_COLOR = 'rgb(0, 255, 0)';
let annotationRenderSyncRegistered = false;

/** Strumento attualmente selezionato (usato per distinguere scroll da tool). */
export function getActiveViewportTool(): ViewportTool {
  return activeViewportTool;
}

/** Restituisce (creando se assente) il rendering engine condiviso. */
export async function ensureEngine(): Promise<RenderingEngine> {
  await ensureCornerstone();
  return getRenderingEngine(RENDERING_ENGINE_ID) ?? new RenderingEngine(RENDERING_ENGINE_ID);
}

/** Forza il ridisegno delle annotazioni su tutte le viewport montate. */
function renderAllViewports(): void {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID);
  if (!engine) return;
  const viewportIds = engine.getViewports().map((viewport) => viewport.id);
  if (viewportIds.length) {
    toolUtilities.triggerAnnotationRenderForViewportIds(viewportIds);
  }
}

function pointDistance(first: number[], second: number[]): number {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2],
  );
}

/** Distanza del punto dal piano della fetta attualmente mostrata. */
function getViewportPlaneDistance(
  viewport: Types.IStackViewport,
  point: number[],
): number | null {
  const camera = viewport.getCamera();
  const normal = camera.viewPlaneNormal;
  let imageData: ReturnType<Types.IStackViewport['getImageData']>;
  try {
    imageData = viewport.getImageData();
  } catch {
    return null;
  }
  const origin = imageData?.origin;
  if (!normal || !origin) return null;
  return Math.abs(
    (point[0] - origin[0]) * normal[0] +
      (point[1] - origin[1]) * normal[1] +
      (point[2] - origin[2]) * normal[2],
  );
}

/**
 * Classifica un'annotazione rispetto alla viewport: complanare alla fetta
 * corrente, visibile in proiezione (vista ortogonale) oppure nascosta perché
 * appartiene a un'altra fetta dello stesso piano.
 */
function getAnnotationPlacement(
  viewport: Types.IStackViewport,
  item: AnnotationLike,
): AnnotationPlacement {
  if (item.isVisible === false) return 'hidden';
  if (item.data?.isCanvasAnnotation) return 'in-plane';

  const point = item.data?.handles?.points?.[0];

  // La sonda è una sfera: compare solo nelle sezioni che la intersecano.
  if (item.metadata?.toolName === ProbeTool.toolName) {
    const points = item.data?.handles?.points;
    if (!points || points.length < 2) return 'hidden';
    const radius = pointDistance(points[0], points[1]);
    if (radius < SPHERE_PROBE_MIN_RADIUS) return 'hidden';
    const distance = getViewportPlaneDistance(viewport, points[0]);
    return distance !== null && distance <= radius ? 'in-plane' : 'hidden';
  }

  const annotationNormal = item.metadata?.viewPlaneNormal;
  if (!point || !annotationNormal) return 'in-plane';

  let imageData: ReturnType<Types.IStackViewport['getImageData']>;
  try {
    imageData = viewport.getImageData();
  } catch {
    return 'in-plane';
  }

  const direction = imageData?.direction;
  const origin = imageData?.origin;
  if (!direction || direction.length < 9 || !origin) return 'in-plane';

  const normal = [direction[6], direction[7], direction[8]];
  const dot = Math.abs(
    normal[0] * annotationNormal[0] +
      normal[1] * annotationNormal[1] +
      normal[2] * annotationNormal[2],
  );

  // Piani non paralleli (viste ortogonali): proiezione della forma.
  if (dot < 0.9) return 'projected';

  const distance = Math.abs(
    (point[0] - origin[0]) * normal[0] +
      (point[1] - origin[1]) * normal[1] +
      (point[2] - origin[2]) * normal[2],
  );
  const spacing = imageData.spacing?.[2] ?? 1;
  if (distance <= Math.max(2.5, spacing * 0.75)) return 'in-plane';

  // La polilinea è una linea 3D: resta selezionabile anche nelle altre fette
  // dello stesso orientamento, proiettata sul piano corrente.
  if (item.metadata?.toolName === SplineROITool.toolName) return 'projected';
  return 'hidden';
}

function isAnnotationViewable(viewport: Types.IStackViewport, item: AnnotationLike): boolean {
  return getAnnotationPlacement(viewport, item) !== 'hidden';
}

/** Angoli dell'immagine corrente in coordinate canvas (per il ritaglio). */
function getViewportImagePolygon(viewport: Types.IStackViewport): Types.Point2[] | null {
  let imageData: ReturnType<Types.IStackViewport['getImageData']>;
  try {
    imageData = viewport.getImageData();
  } catch {
    return null;
  }
  if (!imageData) return null;

  const { origin, direction, dimensions, spacing } = imageData;
  if (!origin || !direction || direction.length < 6 || !dimensions?.length) return null;

  const columns = dimensions[0] ?? 0;
  const rows = dimensions[1] ?? 0;
  if (!columns || !rows) return null;

  const columnSpacing = spacing?.[0] ?? 1;
  const rowSpacing = spacing?.[1] ?? 1;
  const row = [direction[0], direction[1], direction[2]];
  const column = [direction[3], direction[4], direction[5]];
  const width = (columns - 1) * columnSpacing;
  const height = (rows - 1) * rowSpacing;

  const corners: number[][] = [
    [origin[0], origin[1], origin[2]],
    [origin[0] + row[0] * width, origin[1] + row[1] * width, origin[2] + row[2] * width],
    [
      origin[0] + row[0] * width + column[0] * height,
      origin[1] + row[1] * width + column[1] * height,
      origin[2] + row[2] * width + column[2] * height,
    ],
    [origin[0] + column[0] * height, origin[1] + column[1] * height, origin[2] + column[2] * height],
  ];

  try {
    return corners.map((point) => viewport.worldToCanvas(point as Types.Point3));
  } catch {
    return null;
  }
}

/**
 * Ritaglia l'intero overlay SVG all'area dell'immagine: nessuna linea o testo
 * viene disegnato fuori dalla geometria della fetta corrente.
 */
function ensureImageClip(helper: SvgDrawingHelper, viewport: Types.IStackViewport): void {
  const layer = (helper as unknown as { svgLayerElement?: SVGSVGElement }).svgLayerElement;
  if (!layer) return;
  const polygon = getViewportImagePolygon(viewport);
  if (!polygon?.length) return;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const clipId = `risonix-image-clip-${viewport.id}`;
  let defs = layer.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(svgNamespace, 'defs');
    layer.prepend(defs);
  }

  let clip = defs.querySelector(`#${clipId}`) as SVGClipPathElement | null;
  if (!clip) {
    clip = document.createElementNS(svgNamespace, 'clipPath');
    clip.setAttribute('id', clipId);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    defs.appendChild(clip);
  }

  let polygonNode = clip.querySelector('polygon');
  if (!polygonNode) {
    polygonNode = document.createElementNS(svgNamespace, 'polygon');
    clip.appendChild(polygonNode);
  }
  polygonNode.setAttribute(
    'points',
    polygon.map((point) => `${point[0]},${point[1]}`).join(' '),
  );

  const clipValue = `url(#${clipId})`;
  if (layer.getAttribute('clip-path') !== clipValue) {
    layer.setAttribute('clip-path', clipValue);
  }
}

/** Applica il filtro cross-view a uno strumento di annotazione. */
function patchAnnotationFilter(
  toolGroup: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>,
  toolName: string,
): void {
  const instance = toolGroup.getToolInstance(toolName) as AnnotationToolInstance | undefined;
  if (!instance || typeof instance.filterInteractableAnnotationsForElement !== 'function') return;

  instance.filterInteractableAnnotationsForElement = (element, annotations) => {
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement?.viewport as Types.IStackViewport | undefined;
    if (!viewport?.getImageData) return annotations;
    return annotations.filter((item) => isAnnotationViewable(viewport, item));
  };
}

/** Disegna il testo/nota associato a una qualsiasi annotazione. */
function drawAnnotationLabels(
  instance: AnnotationToolInstance,
  enabledElement: Types.IEnabledElement,
  helper: SvgDrawingHelper,
  toolName: string,
): void {
  const viewport = enabledElement.viewport as Types.IStackViewport;
  const annotations = annotation.state.getAnnotations(
    toolName,
    viewport.element,
  ) as unknown as AnnotationLike[] | undefined;
  if (!annotations?.length) return;

  for (const item of annotations) {
    const label = item.data?.label?.trim();
    if (!label) continue;
    if (item.isVisible === false) continue;
    if (!annotation.visibility.isAnnotationVisible(item.annotationUID)) continue;
    if (!isAnnotationViewable(viewport, item)) continue;

    const anchor = [
      item.data?.handles?.textBox?.worldPosition,
      item.data?.handles?.points?.[0],
      item.data?.contour?.polyline?.[0],
    ].find((candidate) => candidate && !candidate.every((value) => value === 0));
    if (!anchor) continue;

    let canvasPoint: Types.Point2;
    try {
      canvasPoint = viewport.worldToCanvas(anchor as Types.Point3);
    } catch {
      continue;
    }

    const styleSpecifier = {
      toolGroupId: TOOL_GROUP_ID,
      toolName,
      viewportId: viewport.id,
      annotationUID: item.annotationUID,
    };
    const style = instance.getAnnotationStyle?.({ annotation: item, styleSpecifier }) ?? {};
    const color = typeof style.color === 'string' ? style.color : 'rgb(255, 255, 0)';
    const isProbe = toolName === ProbeTool.toolName;
    drawing.drawTextBox(
      helper,
      item.annotationUID,
      'label',
      [label],
      [canvasPoint[0] + 10, canvasPoint[1] + (isProbe ? 30 : 18)],
      {
        color,
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: '12px',
        padding: 6,
        background: 'rgba(0, 0, 0, 0.62)',
        textBoxBorderRadius: 4,
      },
    );
  }
}

type ClippedRender = ((
  enabledElement: Types.IEnabledElement,
  helper: SvgDrawingHelper,
) => boolean) & { __risonixClip?: boolean };

/** Assicura che ogni render aggiorni il ritaglio dell'overlay all'immagine. */
function patchRenderClip(
  toolGroup: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>,
  toolName: string,
): void {
  const instance = toolGroup.getToolInstance(toolName) as AnnotationToolInstance | undefined;
  const render = instance?.renderAnnotation;
  if (!instance || !render) return;
  if ((render as ClippedRender).__risonixClip) return;

  const originalRender = render.bind(instance);
  const wrapped: ClippedRender = (enabledElement, helper) => {
    ensureImageClip(helper, enabledElement.viewport as Types.IStackViewport);
    const rendered = originalRender(enabledElement, helper);
    drawAnnotationLabels(instance, enabledElement, helper, toolName);
    return rendered;
  };
  wrapped.__risonixClip = true;
  instance.renderAnnotation = wrapped;
}

/**
 * Riempie con lo stesso colore del bordo, in modo semitrasparente, solo i
 * contorni chiusi (polilinea concatenata e mano libera).
 */
function patchClosedContourFill(
  toolGroup: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>,
  toolName: string,
): void {
  const instance = toolGroup.getToolInstance(toolName) as
    | (AnnotationToolInstance & { __risonixFillPatched?: boolean })
    | undefined;
  if (!instance?.getAnnotationStyle || instance.__risonixFillPatched) return;

  const originalStyle = instance.getAnnotationStyle.bind(instance);
  instance.getAnnotationStyle = (options) => {
    const style = originalStyle(options);
    if (options.annotation.data?.contour?.closed) {
      return { ...style, fillColor: style.fillColor ?? style.color, fillOpacity: 0.18 };
    }
    return { ...style, fillOpacity: 0 };
  };
  instance.__risonixFillPatched = true;
}

/** Sezione circolare della sfera-sonda sul piano della fetta corrente. */
function getProbeCircle(
  viewport: Types.IStackViewport,
  item: AnnotationLike,
): { center: Types.Point2; radius: number } | null {
  const points = item.data?.handles?.points;
  if (!points || points.length < 2) return null;
  const center = points[0];
  const radiusWorld = pointDistance(center, points[1]);
  if (radiusWorld < SPHERE_PROBE_MIN_RADIUS) return null;

  const distance = getViewportPlaneDistance(viewport, center);
  if (distance === null || distance > radiusWorld) return null;
  const crossRadiusWorld = Math.sqrt(Math.max(0, radiusWorld * radiusWorld - distance * distance));

  const camera = viewport.getCamera();
  const normal = camera.viewPlaneNormal;
  const up = camera.viewUp;
  if (!normal || !up) return null;
  const right = [
    up[1] * normal[2] - up[2] * normal[1],
    up[2] * normal[0] - up[0] * normal[2],
    up[0] * normal[1] - up[1] * normal[0],
  ];

  try {
    const centerCanvas = viewport.worldToCanvas(center as Types.Point3);
    const unitCanvas = viewport.worldToCanvas([
      center[0] + right[0],
      center[1] + right[1],
      center[2] + right[2],
    ]);
    const pixelsPerWorld = Math.hypot(
      unitCanvas[0] - centerCanvas[0],
      unitCanvas[1] - centerCanvas[1],
    );
    if (!pixelsPerWorld) return null;
    return { center: centerCanvas, radius: crossRadiusWorld * pixelsPerWorld };
  } catch {
    return null;
  }
}

/**
 * Valore della sonda nel centro della sfera. Per gli stack l'immagine ha una
 * sola fetta (dimensione z = 1), quindi si campiona la fetta locale.
 */
function calculateSphereProbeStats(
  instance: ProbeToolInstance,
  item: AnnotationLike,
  targetId: string,
): void {
  const referenced = item.metadata?.referencedImageId;
  const referencedTargetId = referenced
    ? referenced.startsWith('imageId:')
      ? referenced
      : `imageId:${referenced}`
    : undefined;
  const target =
    (referencedTargetId ? instance.getTargetImageData?.(referencedTargetId) : undefined) ??
    instance.getTargetImageData?.(targetId);
  const center = item.data?.handles?.points?.[0];
  const raw = target?.imageData;
  if (!target || !raw || !center) return;

  const ijk = coreUtilities.transformWorldToIndex(
    raw as Parameters<typeof coreUtilities.transformWorldToIndex>[0],
    center as Types.Point3,
  );
  const dimensions = target.dimensions ?? raw.dimensions ?? [];
  const sampleIndex = [
    Math.round(ijk[0]),
    Math.round(ijk[1]),
    (dimensions[2] ?? 1) > 1 ? Math.round(ijk[2]) : 0,
  ];
  const value = target.voxelManager?.getAtIJKPoint(sampleIndex);
  const modality = target.metadata?.Modality;
  const modalityUnit = modality === 'CT' ? 'HU' : '';

  item.data = {
    ...item.data,
    cachedStats: {
      ...item.data?.cachedStats,
      [targetId]: {
        index: [Math.round(ijk[0]), Math.round(ijk[1]), Math.round(ijk[2])],
        value,
        Modality: modality,
        modalityUnit,
      },
    },
  };
  item.invalidated = false;
}

/**
 * Trasforma la sonda in una sfera ridimensionabile: il centro è il primo
 * punto, il raggio è la distanza dal secondo punto. La sfera compare solo
 * nelle sezioni che la intersecano.
 */
function patchSphereProbe(
  toolGroup: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>,
): void {
  const instance = toolGroup.getToolInstance(ProbeTool.toolName) as
    | ProbeToolInstance
    | undefined;
  if (!instance?.renderAnnotation || instance.__risonixSpherePatched) return;

  const baseAddAnnotation = instance.addNewAnnotation?.bind(instance);

  instance.addNewAnnotation = (evt, interactionType) => {
    const created = baseAddAnnotation?.(evt, interactionType);
    if (!created) return created;
    const points = created.data?.handles?.points;
    if (!points) return created;

    const detail = (evt as CustomEvent<{ element?: HTMLDivElement }>).detail;
    let radiusVector = [SPHERE_PROBE_DEFAULT_RADIUS, 0, 0];
    if (detail?.element) {
      try {
        const enabledElement = getEnabledElement(detail.element);
        const viewport = enabledElement?.viewport as Types.IStackViewport | undefined;
        const camera = viewport?.getCamera();
        const normal = camera?.viewPlaneNormal;
        const up = camera?.viewUp;
        if (normal && up) {
          radiusVector = [
            (up[1] * normal[2] - up[2] * normal[1]) * SPHERE_PROBE_DEFAULT_RADIUS,
            (up[2] * normal[0] - up[0] * normal[2]) * SPHERE_PROBE_DEFAULT_RADIUS,
            (up[0] * normal[1] - up[1] * normal[0]) * SPHERE_PROBE_DEFAULT_RADIUS,
          ];
        }
      } catch {
        /* direzione di default */
      }
    }

    points[1] = [
      points[0][0] + radiusVector[0],
      points[0][1] + radiusVector[1],
      points[0][2] + radiusVector[2],
    ];
    created.data = { ...created.data, sphereProbe: true };
    renderAllViewports();
    return created;
  };

  instance._dragCallback = (evt) => {
    const detail = (
      evt as CustomEvent<{
        currentPoints?: { world?: number[] };
        deltaPoints?: { world?: number[] };
      }>
    ).detail;
    const editData = instance.editData;
    const item = editData?.annotation;
    const points = item?.data?.handles?.points;
    if (!item || !points?.[0] || !points[1]) return;

    if (editData?.newAnnotation || editData?.handleIndex === 1) {
      const world = detail?.currentPoints?.world;
      if (!world) return;
      if (pointDistance(points[0], world) >= SPHERE_PROBE_MIN_RADIUS) {
        points[1] = [...world];
      }
    } else if (editData?.handleIndex === 0) {
      const delta = detail?.deltaPoints?.world;
      if (!delta) return;
      points[0] = [points[0][0] + delta[0], points[0][1] + delta[1], points[0][2] + delta[2]];
      points[1] = [points[1][0] + delta[0], points[1][1] + delta[1], points[1][2] + delta[2]];
    }

    item.invalidated = true;
    renderAllViewports();
  };

  instance.getHandleNearImagePoint = (element, item, canvasCoords, proximity) => {
    const points = item.data?.handles?.points;
    if (!points || points.length < 2) return undefined;
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement?.viewport as Types.IStackViewport | undefined;
    if (!viewport) return undefined;
    const circle = getProbeCircle(viewport, item);
    if (!circle) return undefined;

    const distance = Math.hypot(
      canvasCoords[0] - circle.center[0],
      canvasCoords[1] - circle.center[1],
    );
    const tolerance = Math.max(proximity, 8);
    if (distance <= tolerance) return points[0];
    if (Math.abs(distance - circle.radius) <= tolerance) return points[1];
    return undefined;
  };

  instance.isPointNearTool = (element, item, canvasCoords, proximity) =>
    Boolean(instance.getHandleNearImagePoint?.(element, item, canvasCoords, proximity));

  instance.handleSelectedCallback = (evt, item, handle) => {
    const detail = (evt as CustomEvent<{ element?: HTMLDivElement }>).detail;
    if (!detail?.element) return;
    const points = item.data?.handles?.points ?? [];
    const handleIndex = handle && points[1] === handle ? 1 : 0;
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewportIdsToRender = engine?.getViewports().map((viewport) => viewport.id) ?? [];
    instance.editData = { annotation: item, handleIndex, viewportIdsToRender };
    instance._activateModify?.(detail.element);
    evt.preventDefault();
  };

  instance.renderAnnotation = (enabledElement, helper) => {
    const viewport = enabledElement.viewport as Types.IStackViewport;
    const all = annotation.state.getAnnotations(
      ProbeTool.toolName,
      viewport.element,
    ) as unknown as AnnotationLike[] | undefined;
    if (!all?.length) return false;
    const visible = instance.filterInteractableAnnotationsForElement
      ? instance.filterInteractableAnnotationsForElement(viewport.element, all)
      : all;

    let rendered = false;
    for (const item of visible) {
      if (item.isVisible === false) continue;
      if (!annotation.visibility.isAnnotationVisible(item.annotationUID)) continue;
      const circle = getProbeCircle(viewport, item);
      if (!circle) continue;

      const styleSpecifier = {
        toolGroupId: TOOL_GROUP_ID,
        toolName: ProbeTool.toolName,
        viewportId: viewport.id,
        annotationUID: item.annotationUID,
      };
      const style = instance.getAnnotationStyle?.({ annotation: item, styleSpecifier }) ?? {};
      const color = typeof style.color === 'string' ? style.color : 'rgb(255, 255, 0)';
      const lineWidth = typeof style.lineWidth === 'number' ? style.lineWidth : 2;

      drawing.drawCircle(helper, item.annotationUID, 'sphere', circle.center, circle.radius, {
        color,
        lineWidth,
        fill: color,
        fillOpacity: 0.16,
      }, `${item.annotationUID}-sphere`);
      drawing.drawCircle(helper, item.annotationUID, 'sphere-center', circle.center, 2, {
        color,
        lineWidth: 1,
      }, `${item.annotationUID}-sphere-center`);

      const targetId = instance.getTargetId?.(viewport, item.data);
      const referenced = item.metadata?.referencedImageId;
      const statsTargetId = referenced
        ? referenced.startsWith('imageId:')
          ? referenced
          : `imageId:${referenced}`
        : targetId;
      if (statsTargetId) {
        const stats = item.data?.cachedStats?.[statsTargetId];
        if (item.invalidated || !stats || stats.value == null || !stats.index) {
          calculateSphereProbeStats(instance, item, statsTargetId);
        }
      }

      const cachedStats = statsTargetId ? item.data?.cachedStats?.[statsTargetId] : undefined;
      const hasStats = Boolean(cachedStats && cachedStats.value != null && cachedStats.index);
      const textLines =
        hasStats && statsTargetId && instance.configuration?.getTextLines
          ? instance.configuration.getTextLines(item.data, statsTargetId)
          : undefined;
      if (!textLines?.length) continue;
      const textOptions = instance.getLinkedTextBoxStyle?.(styleSpecifier, item) ?? {};
      if (textOptions.visibility === false) continue;
      drawing.drawTextBox(
        helper,
        item.annotationUID,
        'value',
        textLines,
        [circle.center[0] + 12, circle.center[1] - 12],
        { ...textOptions, color },
      );
      rendered = true;
    }
    return rendered;
  };

  instance.__risonixSpherePatched = true;
  // Il renderer appena sostituito deve essere riavvolto con ritaglio e note.
  patchRenderClip(toolGroup, ProbeTool.toolName);
}

const SPLINE_CLOSE_DISTANCE = 10;
const SPLINE_TOUCH_CLOSE_DISTANCE = 36;

/**
 * Rende chiudibile la polilinea anche con ``allowOpenSplines``: un click sul
 * primo punto di controllo chiude la linea in 3D e termina il disegno. Il
 * doppio click continua a concludere la polilinea lasciandola aperta.
 */
function patchSplineClose(
  toolGroup: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>,
): void {
  const instance = toolGroup.getToolInstance(SplineROITool.toolName) as
    | SplineToolInstance
    | undefined;
  if (!instance?._mouseDownCallback || instance.__risonixSplinePatched) return;

  const original = instance._mouseDownCallback.bind(instance);

  instance._mouseDownCallback = (evt: Event) => {
    const detail = (
      evt as CustomEvent<{
        currentPoints?: { canvas?: number[] };
        taps?: number;
      }>
    ).detail;
    const canvasPoint = detail?.currentPoints?.canvas;
    const editData = instance.editData;
    const annotation = editData?.annotation;
    if (!annotation) {
      original(evt);
      return;
    }
    const data = annotation.data as
      | (NonNullable<AnnotationLike['data']> & {
          contour?: { closed?: boolean; polyline?: number[][] };
          spline?: {
            instance?: {
              getClosestControlPointWithinDistance?: (
                point: number[],
                distance: number,
              ) => { index: number } | undefined;
            };
          };
        })
      | undefined;
    const points = data?.handles?.points;

    const isTouch = evt.type === Enums.Events.TOUCH_TAP || evt.type === Enums.Events.TOUCH_END;
    const doubleTap = evt.type === Enums.Events.TOUCH_TAP && (detail?.taps ?? 0) >= 2;

    if (doubleTap && instance.isTouchTapEchoOfLiftCommit?.(canvasPoint ?? [])) {
      return;
    }

    if (data?.contour?.closed) {
      original(evt);
      return;
    }

    if (points && points.length >= 3 && canvasPoint && data?.spline?.instance) {
      const closeDistance = isTouch
        ? instance.configuration?.spline?.touchCloseCurveDistance ?? SPLINE_TOUCH_CLOSE_DISTANCE
        : SPLINE_CLOSE_DISTANCE;
      const closest = data.spline.instance.getClosestControlPointWithinDistance?.(
        canvasPoint,
        closeDistance,
      );
      if (closest?.index === 0) {
        instance.doneEditMemo?.();
        data.contour = { ...data.contour, closed: true };
        annotation.invalidated = true;
        instance._endCallback?.(evt);
        evt.preventDefault();
        return;
      }
    }

    original(evt);
  };

  instance.__risonixSplinePatched = true;
}

/** Disegna il crosshair con dimensione e colore configurabili. */
function drawCrosshair(
  helper: SvgDrawingHelper,
  annotationUID: string,
  x: number,
  y: number,
  lineWidth: number,
  lineDash: string,
): void {
  const { gap, length } = CROSSHAIR_GEOMETRY[crosshairSize];
  const half = gap / 2;
  const segments: Array<[string, number, number, number, number]> = [
    ['upper', x, y - (half + length), x, y - half],
    ['lower', x, y + half, x, y + half + length],
    ['left', x - (half + length), y, x - half, y],
    ['right', x + half, y, x + half + length, y],
  ];

  for (const [part, x1, y1, x2, y2] of segments) {
    drawing.drawLine(
      helper,
      annotationUID,
      `crosshair-${part}`,
      [x1, y1],
      [x2, y2],
      { color: CROSSHAIR_COLOR, lineWidth, lineDash },
    );
  }
}

/** Sostituisce il renderer del crosshair per supportare dimensione e colore. */
function patchCrosshair(
  toolGroup: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>,
): void {
  const instance = toolGroup.getToolInstance(REFERENCE_TOOL_NAME) as
    | CrosshairToolInstance
    | undefined;
  if (!instance) return;

  // Il crosshair è un punto 3D condiviso: va mostrato in tutte le viewport
  // dello stesso FrameOfReference, non solo in quella in cui è nato.
  instance.filterInteractableAnnotationsForElement = (_element, annotations) =>
    annotations.filter((item) => item.isVisible !== false);

  instance.renderAnnotation = (enabledElement, helper) => {
    const viewport = enabledElement.viewport as Types.IStackViewport;
    ensureImageClip(helper, viewport);
    const element = viewport.element;
    const annotations = annotation.state.getAnnotations(
      REFERENCE_TOOL_NAME,
      element,
    ) as unknown as AnnotationLike[];
    if (!annotations?.length) return false;

    let rendered = false;
    for (const item of annotations) {
      if (item.isVisible === false) continue;
      if (!annotation.visibility.isAnnotationVisible(item.annotationUID)) continue;
      const point = item.data?.handles?.points?.[0];
      if (!point || point.some((value) => Number.isNaN(value))) continue;

      let canvasPoint: Types.Point2;
      try {
        canvasPoint = viewport.worldToCanvas([point[0], point[1], point[2]]);
      } catch {
        continue;
      }

      const styleSpecifier = {
        toolGroupId: TOOL_GROUP_ID,
        toolName: REFERENCE_TOOL_NAME,
        viewportId: viewport.id,
        annotationUID: item.annotationUID,
      };
      const rawLineWidth = instance.getStyle('lineWidth', styleSpecifier, item);
      const lineWidth =
        typeof rawLineWidth === 'number'
          ? rawLineWidth
          : Number.parseFloat(String(rawLineWidth ?? '1')) || 1;
      const rawLineDash = instance.getStyle('lineDash', styleSpecifier, item);
      const lineDash = typeof rawLineDash === 'string' ? rawLineDash : '';

      drawCrosshair(helper, item.annotationUID, canvasPoint[0], canvasPoint[1], lineWidth, lineDash);
      rendered = true;
    }
    return rendered;
  };

  // Il crosshair non è un'annotazione da selezionare/trascinare con i tool:
  // senza questo Cornerstone chiama metodi assenti durante il mouseDown.
  instance.getHandleNearImagePoint = () => undefined;
  instance.isPointNearTool = () => false;
}

/** Ridisegna le annotazioni quando cambiano (creazione, modifica, rimozione). */
function registerAnnotationRenderSync(): void {
  if (annotationRenderSyncRegistered) return;
  annotationRenderSyncRegistered = true;
  const handler = () => renderAllViewports();
  eventTarget.addEventListener(Enums.Events.ANNOTATION_COMPLETED, handler);
  eventTarget.addEventListener(Enums.Events.ANNOTATION_MODIFIED, handler);
  eventTarget.addEventListener(Enums.Events.ANNOTATION_REMOVED, handler);
}

function registerTools(): void {
  if (toolsRegistered) return;
  addTool(ReferenceCursors);
  for (const tool of INTERACTION_TOOLS) {
    addTool(tool);
  }
  toolsRegistered = true;
}

/**
 * Restituisce (creando se assente) il tool group condiviso. Il crosshair è
 * passivo così riceve il mouse move senza rubare il drag primario agli
 * strumenti di misura (P2-05/P2-06).
 */
export async function ensureToolGroup() {
  await ensureEngine();
  registerTools();
  registerAnnotationRenderSync();

  const existing = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (existing) {
    patchCrosshair(existing);
    patchSphereProbe(existing);
    patchSplineClose(existing);
    for (const tool of ANNOTATION_TOOLS) {
      patchAnnotationFilter(existing, tool.toolName);
      patchRenderClip(existing, tool.toolName);
    }
    patchClosedContourFill(existing, SplineROITool.toolName);
    patchClosedContourFill(existing, PlanarFreehandROITool.toolName);
    return existing;
  }

  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) {
    throw new Error('impossibile creare il tool group Cornerstone');
  }

  toolGroup.addTool(REFERENCE_TOOL_NAME);
  toolGroup.setToolConfiguration(REFERENCE_TOOL_NAME, {
    positionSync: false,
    // Il crosshair è un punto 3D condiviso: va proiettato su ogni vista anche
    // quando il punto cade fuori dalla fetta corrente (es. serie con coperture
    // diverse o viste ortogonali ai bordi).
    displayThreshold: 1e6,
  });
  toolGroup.setToolPassive(REFERENCE_TOOL_NAME);

  for (const tool of INTERACTION_TOOLS) {
    toolGroup.addTool(tool.toolName);
    toolGroup.setToolPassive(tool.toolName);
  }

  // Polilinea concatenata: più punti nello stesso strumento, modificabili.
  toolGroup.setToolConfiguration(SplineROITool.toolName, {
    allowOpenSplines: true,
    calculateStats: true,
  });
  toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
    allowOpenContours: true,
    calculateStats: true,
  });

  patchCrosshair(toolGroup);
  patchSphereProbe(toolGroup);
  patchSplineClose(toolGroup);
  for (const tool of ANNOTATION_TOOLS) {
    patchAnnotationFilter(toolGroup, tool.toolName);
    patchRenderClip(toolGroup, tool.toolName);
  }
  patchClosedContourFill(toolGroup, SplineROITool.toolName);
  patchClosedContourFill(toolGroup, PlanarFreehandROITool.toolName);

  return toolGroup;
}

type ToolGroup = NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>;

/** Attiva lo strumento scelto e rende passivi gli altri (P2-06). */
export function setActiveViewportTool(toolGroup: ToolGroup, mode: ViewportTool): void {
  activeViewportTool = mode;
  const activeToolName = TOOL_NAME_BY_MODE[mode];

  for (const tool of INTERACTION_TOOLS) {
    if (tool.toolName === activeToolName) {
      toolGroup.setToolActive(tool.toolName, {
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      });
    } else {
      toolGroup.setToolPassive(tool.toolName);
    }
  }
}

/** Dimensione corrente del crosshair. */
export function getCrosshairSize(): CrosshairSize {
  return crosshairSize;
}

/** Cambia la dimensione del crosshair e ridisegna. */
export function setCrosshairSize(size: CrosshairSize): void {
  crosshairSize = size;
  renderAllViewports();
}

function colorStyles(color: string) {
  return {
    color,
    colorSelected: color,
    colorHighlighted: color,
    textBoxColor: color,
    textBoxColorSelected: color,
    textBoxColorHighlighted: color,
    fillColor: color,
    fillOpacity: 0.18,
  };
}

/**
 * Imposta il colore delle misure: vale per le annotazioni selezionate e per
 * quelle nuove (stile di tool group).
 */
export function setMeasurementColor(color: string): void {
  const style = annotation.config.style;
  const current = style.getToolGroupToolStyles(TOOL_GROUP_ID) ?? {};
  style.setToolGroupToolStyles(TOOL_GROUP_ID, {
    ...current,
    global: { ...(current.global ?? {}), ...colorStyles(color) },
  });

  for (const annotationUID of annotation.selection.getAnnotationsSelected()) {
    style.setAnnotationStyles(annotationUID, {
      ...(style.getAnnotationToolStyles(annotationUID) ?? {}),
      ...colorStyles(color),
    });
  }

  renderAllViewports();
}

/** Elimina le annotazioni selezionate e restituisce quante ne ha rimosse. */
export function deleteSelectedAnnotations(): number {
  const selected = annotation.selection.getAnnotationsSelected();
  for (const annotationUID of selected) {
    annotation.state.removeAnnotation(annotationUID);
  }
  annotation.selection.deselectAnnotation(undefined);
  renderAllViewports();
  return selected.length;
}

/** Testo/nota associato alla misura selezionata (una sola). */
export function getSelectedAnnotationLabel(): string {
  const selected = annotation.selection.getAnnotationsSelected();
  if (selected.length !== 1) return '';
  const item = annotation.state.getAnnotation(selected[0]) as
    | { data?: { label?: string } }
    | undefined;
  return typeof item?.data?.label === 'string' ? item.data.label : '';
}

/** Imposta o rimuove la nota su tutte le misure selezionate. */
export function setSelectedAnnotationLabel(label: string): number {
  const selected = annotation.selection.getAnnotationsSelected();
  const value = label.trim();
  let updated = 0;
  for (const annotationUID of selected) {
    const item = annotation.state.getAnnotation(annotationUID) as
      | { data?: { label?: string } }
      | undefined;
    if (!item?.data) continue;
    if (value) item.data.label = value;
    else delete item.data.label;
    updated += 1;
  }
  renderAllViewports();
  return updated;
}

/**
 * Sottoscrive il numero di annotazioni selezionate. Isolato qui così il guscio
 * non deve importare Cornerstone per la toolbar (P2-08).
 */
export function subscribeAnnotationSelection(listener: (count: number) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ selection?: string[] }>).detail;
    listener(detail?.selection?.length ?? 0);
  };
  eventTarget.addEventListener(Enums.Events.ANNOTATION_SELECTION_CHANGE, handler);
  return () => {
    eventTarget.removeEventListener(Enums.Events.ANNOTATION_SELECTION_CHANGE, handler);
  };
}
