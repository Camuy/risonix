import { useCallback, useEffect, useState } from 'react';

import type { SeriesSelection } from '../api/stack';
import {
  ensureSeriesVolume,
  startSeriesVolumeLoad,
  type SeriesVolume,
} from '../cornerstone/volume';
import { useSeriesStack, type SeriesStackState } from './useSeriesStack';

export type CornerstoneVolumeState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; volume: SeriesVolume };

export interface CornerstoneVolumeResult {
  stackState: SeriesStackState;
  volume: CornerstoneVolumeState;
  reload: () => void;
}

/**
 * Volume streaming Cornerstone della serie selezionata (P3-01), condiviso dalle
 * viste che lavorano sul volume (MPR P3-02, scena 3D P3-03).
 *
 * Costruisce lo stack della serie, ne deriva il volume dagli stessi ``imageId``
 * e avvia il caricamento progressivo dei voxel. ``reload`` riavvia l'intero
 * percorso (stack + volume) per il pulsante "Riprova".
 */
export function useCornerstoneVolume(
  selection: SeriesSelection | null,
  enabled: boolean,
): CornerstoneVolumeResult {
  const { state: stackState, reload: reloadStack } = useSeriesStack(selection, enabled);
  const [volume, setVolume] = useState<CornerstoneVolumeState>({ state: 'idle' });

  useEffect(() => {
    if (stackState.state !== 'ready') {
      setVolume({ state: 'idle' });
      return;
    }

    let cancelled = false;
    setVolume({ state: 'loading' });

    ensureSeriesVolume(stackState.stack.series.id, stackState.stack.imageIds)
      .then((seriesVolume) => {
        if (cancelled) return;
        startSeriesVolumeLoad(seriesVolume.volumeId);
        setVolume({ state: 'ready', volume: seriesVolume });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setVolume({
          state: 'error',
          message: cause instanceof Error ? cause.message : 'Errore imprevisto',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [stackState]);

  const reload = useCallback(() => {
    setVolume({ state: 'idle' });
    reloadStack();
  }, [reloadStack]);

  return { stackState, volume, reload };
}
