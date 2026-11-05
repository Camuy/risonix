import { useCallback, useEffect, useState } from 'react';

import type { StudyDetail } from '../api/client';
import { loadCatalog } from '../api/stack';
import type { ApiStatus } from './useApiStatus';

export type CatalogState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; studies: StudyDetail[] };

/**
 * Carica il catalogo studi/serie non appena l'API è operativa. Riprova su
 * richiesta e annulla la richiesta in volo allo smontaggio (P2-03).
 */
export function useStudyCatalog(status: ApiStatus) {
  const [state, setState] = useState<CatalogState>({ state: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (status.state !== 'up') {
      setState({ state: 'idle' });
      return;
    }

    const controller = new AbortController();
    setState({ state: 'loading' });

    loadCatalog(controller.signal)
      .then((studies) => {
        if (controller.signal.aborted) return;
        setState({ state: 'ready', studies });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          state: 'error',
          message: error instanceof Error ? error.message : 'Errore imprevisto',
        });
      });

    return () => controller.abort();
  }, [status.state, attempt]);

  return { state, reload };
}
