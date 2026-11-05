import { useCallback, useState } from 'react';

interface PanelWidths {
  left: number;
  right: number;
}

export const PANEL_WIDTH_MIN = 200;
export const PANEL_WIDTH_MAX = 520;

const STORAGE_KEY = 'risonix.layout.v1';
const DEFAULTS: PanelWidths = { left: 264, right: 300 };

function clampWidth(value: number): number {
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(value)));
}

function loadWidths(): PanelWidths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULTS;
    }
    const parsed = JSON.parse(raw) as Partial<PanelWidths>;
    return {
      left: clampWidth(parsed.left ?? DEFAULTS.left),
      right: clampWidth(parsed.right ?? DEFAULTS.right),
    };
  } catch {
    return DEFAULTS;
  }
}

function saveWidths(widths: PanelWidths): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    /* storage non disponibile: la larghezza resta solo in memoria */
  }
}

/** Larghezze dei pannelli laterali, ridimensionabili e persistite. */
export function useResizablePanels() {
  const [widths, setWidths] = useState<PanelWidths>(loadWidths);

  const setLeftWidth = useCallback((left: number) => {
    setWidths((current) => {
      const next = { ...current, left: clampWidth(left) };
      saveWidths(next);
      return next;
    });
  }, []);

  const setRightWidth = useCallback((right: number) => {
    setWidths((current) => {
      const next = { ...current, right: clampWidth(right) };
      saveWidths(next);
      return next;
    });
  }, []);

  return { leftWidth: widths.left, rightWidth: widths.right, setLeftWidth, setRightWidth };
}
