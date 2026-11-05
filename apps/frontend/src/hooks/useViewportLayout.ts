import { useCallback, useState } from 'react';

export type ViewportLayout = '1x1' | '2x1' | '1x2' | '2x2' | 'mpr';

/**
 * Capacità della griglia per ciascun layout. La modalità MPR mostra tre piani
 * dello stesso volume: espone un solo slot (la serie di riferimento).
 */
export const LAYOUT_CAPACITY: Record<ViewportLayout, number> = {
  '1x1': 1,
  '2x1': 2,
  '1x2': 2,
  '2x2': 4,
  mpr: 1,
};

/** Vero se il layout è la modalità multiplanare (P3-02). */
export function isMprLayout(layout: ViewportLayout): boolean {
  return layout === 'mpr';
}

const STORAGE_KEY = 'risonix.viewport.layout.v1';
const LAYOUTS: readonly ViewportLayout[] = ['1x1', '2x1', '1x2', '2x2', 'mpr'];

function loadLayout(): ViewportLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (LAYOUTS as readonly string[]).includes(raw)) {
      return raw as ViewportLayout;
    }
  } catch {
    /* storage non disponibile: si usa il default */
  }
  return '1x1';
}

/** Layout multi-viewport selezionato, persistito (P2-05). */
export function useViewportLayout() {
  const [layout, setLayoutState] = useState<ViewportLayout>(loadLayout);

  const setLayout = useCallback((next: ViewportLayout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage non disponibile: il layout resta in memoria */
    }
  }, []);

  return { layout, setLayout, capacity: LAYOUT_CAPACITY[layout] };
}
