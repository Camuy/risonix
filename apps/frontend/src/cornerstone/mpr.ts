import { Enums } from '@cornerstonejs/core';
import {
  addTool,
  annotation,
  CrosshairsTool,
  Enums as ToolsEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';

import { ensureEngine, RENDERING_ENGINE_ID } from './engine';
import { ensureCornerstone } from './init';

/**
 * Viewer MPR (P3-02): tre viewport volume ortogonali (assiale, coronale,
 * sagittale) dello stesso volume, sincronizzate da un crosshair world-space.
 *
 * La sincronizzazione usa il ``CrosshairsTool`` nativo di Cornerstone3D in un
 * **tool group dedicato**, così il viewer a stack e il suo ``ReferenceCursors``
 * restano invariati. Il tool mantiene un punto 3D condiviso e riallinea le
 * telecamere delle tre viewport quando il crosshair o lo scroll cambiano.
 */

export const MPR_TOOL_GROUP_ID = 'risonix-mpr-tools';

/** Piano di ricostruzione multiplanare. */
export type MprOrientation = 'axial' | 'coronal' | 'sagittal';

export const MPR_ORIENTATIONS: readonly MprOrientation[] = ['axial', 'coronal', 'sagittal'];

/** Etichetta leggibile del piano. */
export const MPR_ORIENTATION_LABEL: Record<MprOrientation, string> = {
  axial: 'Assiale',
  coronal: 'Coronale',
  sagittal: 'Sagittale',
};

/** Asse Cornerstone corrispondente al piano. */
export const MPR_ORIENTATION_AXIS: Record<MprOrientation, Enums.OrientationAxis> = {
  axial: Enums.OrientationAxis.AXIAL,
  coronal: Enums.OrientationAxis.CORONAL,
  sagittal: Enums.OrientationAxis.SAGITTAL,
};

/** Colore della linea di riferimento (crosshair) per piano. */
const MPR_ORIENTATION_COLOR: Record<MprOrientation, string> = {
  axial: 'rgb(255, 82, 82)',
  coronal: 'rgb(76, 217, 100)',
  sagittal: 'rgb(82, 148, 255)',
};

const DEFAULT_LINE_COLOR = 'rgb(0, 200, 0)';

/** Colore della linea di riferimento per viewport MPR montata. */
const viewportColors = new Map<string, string>();

let toolsRegistered = false;

/**
 * Registra globalmente gli strumenti usati dall'MPR. Alcuni (Pan/Zoom/
 * Finestra e livello) sono già registrati dal viewer a stack: ``addTool`` è
 * idempotente e sovrascrive la stessa classe.
 */
function registerMprTools(): void {
  if (toolsRegistered) return;
  addTool(CrosshairsTool);
  addTool(StackScrollTool);
  addTool(PanTool);
  addTool(ZoomTool);
  addTool(WindowLevelTool);
  toolsRegistered = true;
}

/**
 * Restituisce (creando se assente) il tool group MPR. Il crosshair è attivo sul
 * tasto primario; pan, zoom e scroll sono attivi su tasti secondari, così la
 * navigazione resta possibile senza toccare il punto 3D condiviso.
 */
export async function ensureMprToolGroup() {
  await ensureCornerstone();
  await ensureEngine();
  registerMprTools();

  const existing = ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID);
  if (existing) return existing;

  const toolGroup = ToolGroupManager.createToolGroup(MPR_TOOL_GROUP_ID);
  if (!toolGroup) {
    throw new Error('impossibile creare il tool group MPR');
  }

  toolGroup.addTool(CrosshairsTool.toolName);
  toolGroup.setToolConfiguration(CrosshairsTool.toolName, {
    getReferenceLineColor: (viewportId: string) =>
      viewportColors.get(viewportId) ?? DEFAULT_LINE_COLOR,
    getReferenceLineControllable: () => true,
    getReferenceLineDraggableRotatable: () => true,
    getReferenceLineSlabThicknessControlsOn: () => false,
  });
  toolGroup.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
  });

  for (const tool of [PanTool, ZoomTool, StackScrollTool]) {
    toolGroup.addTool(tool.toolName);
  }
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
  });

  return toolGroup;
}

type ToolGroup = NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>;

/** Registra il colore del crosshair della viewport del piano indicato. */
export function registerMprViewportColor(
  viewportId: string,
  orientation: MprOrientation,
  toolGroup: ToolGroup,
): void {
  viewportColors.set(viewportId, MPR_ORIENTATION_COLOR[orientation]);
  toolGroup.setToolConfiguration(CrosshairsTool.toolName, {
    getReferenceLineColor: (id: string) => viewportColors.get(id) ?? DEFAULT_LINE_COLOR,
  });
}

/** Rimuove la viewport MPR dal tool group e le sue annotazioni di crosshair. */
export function unregisterMprViewport(viewportId: string, element: HTMLDivElement): void {
  viewportColors.delete(viewportId);
  const annotations = (annotation.state.getAnnotations(CrosshairsTool.toolName, element) ??
    []) as Array<{ annotationUID: string }>;
  for (const item of annotations) {
    annotation.state.removeAnnotation(item.annotationUID);
  }
  ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID)?.removeViewports(
    RENDERING_ENGINE_ID,
    viewportId,
  );
}
