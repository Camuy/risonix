import { useCallback, useEffect, useState } from 'react';

import { loadSeriesStack, type ImageStack, type SeriesSelection } from '../api/stack';

export type SeriesStackState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'error'; message: string }
  | { state: 'ready'; stack: ImageStack };

/**
 * Prepara lo stack della serie selezionata nell'explorer (P2-04). Resta in
 * ``idle`` finché non c'è selezione o l'API non è operativa; annulla la
 * richiesta in volo quando cambia selezione o allo smontaggio.
 */
export function useSeriesStack(selection: SeriesSelection | null, enabled: boolean) {
  const [state, setState] = useState<SeriesStackState>({ state: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !selection) {
      setState({ state: 'idle' });
      return;
    }

    const controller = new AbortController();
    setState({ state: 'loading' });

    loadSeriesStack(selection, controller.signal)
      .then((stack) => {
        if (controller.signal.aborted) return;
        setState(stack.imageIds.length > 0 ? { state: 'ready', stack } : { state: 'empty' });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          state: 'error',
          message: error instanceof Error ? error.message : 'Errore imprevisto',
        });
      });

    return () => controller.abort();
  }, [enabled, selection, attempt]);

  return { state, reload };
}
