import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core';
import { useEffect, useRef, useState } from 'react';

import { ensureEngine, RENDERING_ENGINE_ID } from '../cornerstone/engine';
import {
  ensureMprToolGroup,
  MPR_ORIENTATION_AXIS,
  registerMprViewportColor,
  unregisterMprViewport,
  type MprOrientation,
} from '../cornerstone/mpr';
import {
  registerPresentationSync,
  unregisterPresentationSync,
} from '../cornerstone/presentationSync';
import { addVolumeToViewports } from '../cornerstone/volume';
import { StateMessage } from './StateMessage';

interface MprViewportProps {
  viewportId: string;
  orientation: MprOrientation;
  volumeId: string;
}

/**
 * Viewport volume ortogonale per l'MPR (P3-02). Ogni pane mostra lo stesso
 * volume secondo il proprio piano; il ``CrosshairsTool`` del tool group MPR
 * tiene allineate le tre telecamere sul punto 3D condiviso.
 */
export function MprViewport({ viewportId, orientation, volumeId }: MprViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let disposed = false;
    let frameOfReferenceUID: string | null = null;

    const setup = async () => {
      const engine = await ensureEngine();
      const toolGroup = await ensureMprToolGroup();
      if (disposed) return;

      if (engine.getViewport(viewportId)) {
        engine.disableElement(viewportId);
      }
      engine.enableElement({
        viewportId,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element,
        defaultOptions: { orientation: MPR_ORIENTATION_AXIS[orientation] },
      });
      const viewport = engine.getViewport(viewportId) as Types.IVolumeViewport | undefined;
      if (!viewport || disposed) return;

      await addVolumeToViewports([viewportId], volumeId, true);
      if (disposed) return;

      registerMprViewportColor(viewportId, orientation);
      toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID);

      frameOfReferenceUID = viewport.getFrameOfReferenceUID() ?? null;
      if (frameOfReferenceUID) {
        registerPresentationSync(frameOfReferenceUID, viewportId);
      }
      viewport.resetCamera();
      viewport.render();
      setError(null);
    };

    setup().catch((cause: unknown) => {
      if (disposed) return;
      setError(cause instanceof Error ? cause.message : 'Errore di rendering MPR');
    });

    return () => {
      disposed = true;
      if (frameOfReferenceUID) {
        unregisterPresentationSync(frameOfReferenceUID, viewportId);
      }
      unregisterMprViewport(viewportId, element);
      getRenderingEngine(RENDERING_ENGINE_ID)?.disableElement(viewportId);
    };
  }, [viewportId, orientation, volumeId]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      void ensureEngine().then((engine) => engine.resize(true, true));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="viewport__canvas-host">
      <div ref={elementRef} className="viewport__canvas" />
      {error ? (
        <div className="viewport__overlay viewport__overlay--error">
          <StateMessage variant="error" title="Rendering MPR non riuscito" description={error} />
        </div>
      ) : null}
    </div>
  );
}
