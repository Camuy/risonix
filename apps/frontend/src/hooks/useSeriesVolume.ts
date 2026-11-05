import { useCallback, useEffect, useState } from 'react';

import type { VolumeSummary } from '../api/client';
import type { SeriesSelection } from '../api/stack';
import { loadSeriesVolumes, selectPrimaryVolume } from '../api/volumes';

export type SeriesVolumeState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'empty' }
  | { state: 'error'; message: string }
  | { state: 'ready'; volume: VolumeSummary };

/**
 * Volume derivato della serie selezionata (P3-01). Resta in ``idle`` finché non
 * c'è selezione o l'API non è operativa; annulla la richiesta in volo al cambio
 * di selezione o allo smontaggio.
 */
export function useSeriesVolume(selection: SeriesSelection | null, enabled: boolean) {
  const [state, setState] = useState<SeriesVolumeState>({ state: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !selection) {
      setState({ state: 'idle' });
      return;
    }

    const controller = new AbortController();
    setState({ state: 'loading' });

    loadSeriesVolumes(selection.series.id, controller.signal)
      .then((volumes) => {
        if (controller.signal.aborted) return;
        const volume = selectPrimaryVolume(volumes);
        setState(volume ? { state: 'ready', volume } : { state: 'empty' });
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
