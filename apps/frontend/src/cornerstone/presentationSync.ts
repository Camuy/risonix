import { synchronizers } from '@cornerstonejs/tools';

import { RENDERING_ENGINE_ID } from './engine';

type Synchronizer = ReturnType<typeof synchronizers.createVOISynchronizer>;

interface PresentationSync {
  voi: Synchronizer;
  zoomPan: Synchronizer;
}

/**
 * Sincronizzatori per FrameOfReference: finestra/livello, zoom e pan applicati
 * in una viewport si riflettono sulle altre dello stesso studio (P2-06).
 * Le istanze restano registrate anche senza viewport per evitare di ricreare
 * un id già esistente quando un layout viene rimontato.
 */
const entries = new Map<string, PresentationSync>();

function getEntry(forUID: string): PresentationSync {
  const existing = entries.get(forUID);
  if (existing) return existing;

  const entry: PresentationSync = {
    voi: synchronizers.createVOISynchronizer(`risonix-voi-${forUID}`, {
      syncInvertState: true,
      syncColormap: true,
    }),
    zoomPan: synchronizers.createZoomPanSynchronizer(`risonix-zoompan-${forUID}`),
  };
  entries.set(forUID, entry);
  return entry;
}

export function registerPresentationSync(forUID: string, viewportId: string): void {
  if (!forUID || !viewportId) return;
  const entry = getEntry(forUID);
  const info = { renderingEngineId: RENDERING_ENGINE_ID, viewportId };
  entry.voi.add(info);
  entry.zoomPan.add(info);
}

export function unregisterPresentationSync(forUID: string, viewportId: string): void {
  const entry = entries.get(forUID);
  if (!entry) return;
  const info = { renderingEngineId: RENDERING_ENGINE_ID, viewportId };
  entry.voi.remove(info);
  entry.zoomPan.remove(info);
}
