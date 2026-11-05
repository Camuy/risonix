import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import { annotation } from '@cornerstonejs/tools';

import { RENDERING_ENGINE_ID } from './engine';

interface DebugAnnotation {
  annotationUID: string;
  toolName: string | undefined;
  viewPlaneNormal: number[] | undefined;
  label: string | undefined;
  closed: boolean;
  points: number[][];
}

interface DebugViewport {
  viewportId: string;
  imageIdIndex: number;
  zoom: number;
  pan: number[];
  voiRange: { lower?: number; upper?: number } | undefined;
}

interface DebugWindow extends Window {
  __risonix?: {
    viewports: () => DebugViewport[];
    annotations: () => DebugAnnotation[];
  };
}

/** Hook di sola diagnostica (dev): stato viewport e annotazioni per i test E2E. */
export function installDebugHooks(): void {
  if (!import.meta.env.DEV) return;

  (window as DebugWindow).__risonix = {
    viewports: () => {
      const engine = getRenderingEngine(RENDERING_ENGINE_ID);
      if (!engine) return [];
      return engine.getViewports().map((viewport) => {
        const stack = viewport as Types.IStackViewport;
        const properties = viewport.getProperties();
        return {
          viewportId: viewport.id,
          imageIdIndex: stack.getCurrentImageIdIndex?.() ?? -1,
          zoom: viewport.getZoom?.() ?? 0,
          pan: viewport.getPan?.() ?? [],
          voiRange: properties?.voiRange,
        };
      });
    },
    annotations: () =>
      annotation.state.getAllAnnotations().map((item) => ({
        annotationUID: item.annotationUID ?? '',
        toolName: item.metadata?.toolName,
        viewPlaneNormal: item.metadata?.viewPlaneNormal
          ? [...item.metadata.viewPlaneNormal]
          : undefined,
        label: typeof item.data?.label === 'string' ? item.data.label : undefined,
        closed: Boolean(item.data?.contour?.closed),
        points: (item.data?.handles?.points ?? []).map((point) => [...point]),
      })),
  };
}
