import { useCallback, useState } from 'react';

export type ViewportLayout = '1x1' | '2x1' | '1x2' | '2x2';

export const LAYOUT_CAPACITY: Record<ViewportLayout, number> = {
  '1x1': 1,
  '2x1': 2,
  '1x2': 2,
  '2x2': 4,
};

const STORAGE_KEY = 'risonix.viewport.layout.v1';

function loadLayout(): ViewportLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '1x1' || raw === '2x1' || raw === '1x2' || raw === '2x2') {
      return raw;
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
