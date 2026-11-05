import type { SeriesSelection } from '../api/stack';
import type { ApiStatus } from '../hooks/useApiStatus';
import { useCornerstoneVolume, type CornerstoneVolumeState } from '../hooks/useCornerstoneVolume';
import type { SeriesStackState } from '../hooks/useSeriesStack';
import { Button } from './Button';
import { StateMessage } from './StateMessage';
import { VtkViewport } from './VtkViewport';

interface VtkLayoutProps {
  selection: SeriesSelection | null;
  status: ApiStatus;
  onRetry: () => void;
}

/**
 * Vista 3D (P3-03): scena VTK.js isolata dal viewer MPR. Mostra l'estensione
 * spaziale del volume (bounding box orientato in spazio paziente) con gizmo di
 * orientamento e piani di clipping interattivi. Il volume rendering e la mesh
 * sono demandati a P3-04.
 */
export function VtkLayout({ selection, status, onRetry }: VtkLayoutProps) {
  const { stackState, volume, reload } = useCornerstoneVolume(selection, status.state === 'up');

  if (status.state === 'checking') {
    return (
      <section className="viewport-grid" data-layout="3d" aria-label="Viewport 3D">
        <div className="pane">
          <div className="pane__stage">
            <StateMessage compact variant="loading" title="Connessione ai servizi…" />
          </div>
        </div>
      </section>
    );
  }

  if (status.state === 'down') {
    return (
      <section className="viewport-grid" data-layout="3d" aria-label="Viewport 3D">
        <div className="pane">
          <div className="pane__stage">
            <StateMessage
              compact
              variant="error"
              title="API non raggiungibile"
              action={
                <Button icon="refresh" onClick={onRetry}>
                  Riprova
                </Button>
              }
            />
          </div>
        </div>
      </section>
    );
  }

  const seriesVolume = volume.state === 'ready' ? volume.volume : null;
  const ready = stackState.state === 'ready' && seriesVolume !== null;
  const message = viewerMessage(stackState, volume);

  return (
    <section className="viewport-grid" data-layout="3d" aria-label="Viewport 3D">
      <div className="pane" data-active="true">
        <div className="pane__stage">
          {ready && seriesVolume ? (
            <VtkViewport geometry={seriesVolume.geometry} />
          ) : (
            <StateMessage
              compact
              variant="loading"
              title={message}
              action={
                <Button icon="refresh" onClick={reload}>
                  Riprova
                </Button>
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}

function viewerMessage(stackState: SeriesStackState, volume: CornerstoneVolumeState): string {
  if (stackState.state === 'error') return 'Caricamento dello stack non riuscito';
  if (stackState.state === 'empty') return 'La serie non contiene immagini';
  if (volume.state === 'error') return 'Preparazione del volume non riuscita';
  if (stackState.state === 'ready' && volume.state === 'loading') {
    return 'Preparazione della scena 3D…';
  }
  if (stackState.state === 'idle') return 'Seleziona una serie per la vista 3D';
  return 'Preparazione della scena 3D…';
}
