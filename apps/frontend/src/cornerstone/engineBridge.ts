import type { CrosshairSize, ViewportTool } from './engine';

/**
 * Ponte verso il motore Cornerstone3D caricato **dinamicamente**. Il guscio
 * dell'applicazione (App, toolbar, pannello) usa queste funzioni async, così
 * Cornerstone3D/VTK.js restano fuori dal bundle iniziale e vengono scaricati
 * solo quando il viewer serve davvero (lazy loading delle viste, P2-08).
 */
type EngineModule = typeof import('./engine');
type ControlsModule = typeof import('./viewportControls');

let modulePromise: Promise<EngineModule> | null = null;
let controlsPromise: Promise<ControlsModule> | null = null;

function engine(): Promise<EngineModule> {
  modulePromise ??= import('./engine');
  return modulePromise;
}

function controls(): Promise<ControlsModule> {
  controlsPromise ??= import('./viewportControls');
  return controlsPromise;
}

/** Attiva lo strumento selezionato, creando il tool group se necessario. */
export async function activateTool(tool: ViewportTool): Promise<void> {
  const { ensureToolGroup, setActiveViewportTool } = await engine();
  const toolGroup = await ensureToolGroup();
  setActiveViewportTool(toolGroup, tool);
}

export async function setMeasurementColor(color: string): Promise<void> {
  const { setMeasurementColor: apply } = await engine();
  apply(color);
}

export async function setCrosshairSize(size: CrosshairSize): Promise<void> {
  const { setCrosshairSize: apply } = await engine();
  apply(size);
}

export async function deleteSelectedAnnotations(): Promise<number> {
  const { deleteSelectedAnnotations: remove } = await engine();
  return remove();
}

export async function getSelectedAnnotationLabel(): Promise<string> {
  const { getSelectedAnnotationLabel: read } = await engine();
  return read();
}

export async function setSelectedAnnotationLabel(label: string): Promise<number> {
  const { setSelectedAnnotationLabel: write } = await engine();
  return write(label);
}

export async function rotateViewport(viewportId: string, deltaDeg = 90): Promise<number> {
  const { rotateViewport: rotate } = await controls();
  return rotate(viewportId, deltaDeg);
}

export async function toggleViewportInvert(viewportId: string): Promise<boolean> {
  const { toggleViewportInvert: toggle } = await controls();
  return toggle(viewportId);
}

export async function isViewportInverted(viewportId: string): Promise<boolean> {
  const { isViewportInverted: read } = await controls();
  return read(viewportId);
}

export async function resetViewports(): Promise<void> {
  const { resetViewports: reset } = await controls();
  reset();
}

export async function fitViewports(): Promise<void> {
  const { fitViewports: fit } = await controls();
  fit();
}

/**
 * Sottoscrive il numero di annotazioni selezionate: carica il motore in modo
 * differito e inoltra gli aggiornamenti al listener.
 */
export function subscribeAnnotationSelection(listener: (count: number) => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let cancelled = false;

  void engine().then(({ subscribeAnnotationSelection: subscribe }) => {
    if (cancelled) return;
    unsubscribe = subscribe(listener);
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
