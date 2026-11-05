import { useEffect, useState } from 'react';

import { subscribeAnnotationSelection } from '../cornerstone/engineBridge';

/**
 * Numero di annotazioni selezionate, aggiornato dagli eventi Cornerstone. Il
 * motore viene caricato in modo differito tramite il ponte, così questo hook
 * (usato dal guscio) non trascina Cornerstone nel bundle iniziale (P2-08).
 */
export function useAnnotationSelection(): number {
  const [count, setCount] = useState(0);

  useEffect(() => subscribeAnnotationSelection(setCount), []);

  return count;
}
