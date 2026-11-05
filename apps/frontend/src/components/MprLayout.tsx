import { useEffect, useState } from 'react';

import type { SeriesSelection } from '../api/stack';
import {
  ensureSeriesVolume,
  startSeriesVolumeLoad,
  type SeriesVolume,
} from '../cornerstone/volume';
import type { ApiStatus } from '../hooks/useApiStatus';
import { useSeriesStack } from '../hooks/useSeriesStack';
import { Button } from './Button';
import { MPR_ORIENTATION_LABEL, MPR_ORIENTATIONS, type MprOrientation } from '../cornerstone/mpr';
import { MprViewport } from './MprViewport';
import { StateMessage } from './StateMessage';

interface MprLayoutProps {
  selection: SeriesSelection | null;
  status: ApiStatus;
  onRetry: () => void;
}

type VolumeState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; volume: SeriesVolume };

/**
 * Vista MPR (P3-02): tre piani ortogonali dello stesso volume, con crosshair
 * world-space sincronizzato. Il volume è quello predisposto in P3-01
 * (streaming dagli imageId dello stack), quindi la geometria coincide con il
 * volume su disco esposto dall'API.
 */
export function MprLayout({ selection, status, onRetry }: MprLayoutProps) {
  const { state: stackState, reload } = useSeriesStack(selection, status.state === 'up');
  const [volume, setVolume] = useState<VolumeState>({ state: 'idle' });
  const [activePane, setActivePane] = useState(0);

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

  if (status.state === 'checking') {
    return (
      <section className="viewport-grid" data-layout="mpr" aria-label="Viewport MPR">
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
      <section className="viewport-grid" data-layout="mpr" aria-label="Viewport MPR">
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
  const message = mprMessage(stackState, volume);

  return (
    <section className="viewport-grid" data-layout="mpr" aria-label="Viewport MPR">
      {MPR_ORIENTATIONS.map((orientation, index) => (
        <MprPane
          key={orientation}
          orientation={orientation}
          active={index === activePane}
          onActivate={() => setActivePane(index)}
          volumeId={seriesVolume?.volumeId ?? null}
          ready={ready}
          message={message}
          onReload={() => {
            reload();
            setVolume({ state: 'idle' });
          }}
          anisotropic={seriesVolume ? paneIsAnisotropic(seriesVolume, orientation) : false}
          spacingRatio={seriesVolume?.spacingRatio ?? 1}
        />
      ))}
    </section>
  );
}

/** Normale di vista (assi paziente LPS) dei tre piani MPR. */
const PANE_NORMAL: Record<MprOrientation, [number, number, number]> = {
  axial: [0, 0, 1],
  coronal: [0, 1, 0],
  sagittal: [1, 0, 0],
};

/**
 * Un piano è affetto da spacing anisotropo solo se ricampiona l'asse delle
 * fette: accade quando la normale al volume (colonna "normal" della direzione)
 * giace nel piano della vista invece di esserle parallela. La vista assiale di
 * una serie trasversale resta isotropa; coronale e sagittale no.
 */
function paneIsAnisotropic(volume: SeriesVolume, orientation: MprOrientation): boolean {
  if (!volume.anisotropic) return false;
  const normal = volume.geometry.direction;
  if (normal.length < 9) return volume.anisotropic;
  const sliceAxis: [number, number, number] = [normal[6], normal[7], normal[8]];
  const viewNormal = PANE_NORMAL[orientation];
  const dot = Math.abs(
    sliceAxis[0] * viewNormal[0] + sliceAxis[1] * viewNormal[1] + sliceAxis[2] * viewNormal[2],
  );
  return dot < 0.5;
}

interface MprPaneProps {
  orientation: MprOrientation;
  active: boolean;
  onActivate: () => void;
  volumeId: string | null;
  ready: boolean;
  message: string;
  onReload: () => void;
  anisotropic: boolean;
  spacingRatio: number;
}

function MprPane({
  orientation,
  active,
  onActivate,
  volumeId,
  ready,
  message,
  onReload,
  anisotropic,
  spacingRatio,
}: MprPaneProps) {
  return (
    <div className="pane" data-active={active} onMouseDown={onActivate}>
      <div className="pane__stage">
        {ready && volumeId ? (
          <MprViewport
            viewportId={`risonix-mpr-${orientation}`}
            orientation={orientation}
            volumeId={volumeId}
          />
        ) : (
          <StateMessage
            compact
            variant="loading"
            title={message}
            action={
              <Button icon="refresh" onClick={onReload}>
                Riprova
              </Button>
            }
          />
        )}
      </div>

      <div className="viewport__overlay" aria-live="polite">
        <span className="viewport__overlay-line">{MPR_ORIENTATION_LABEL[orientation]}</span>
      </div>

      {anisotropic ? (
        <div className="viewport__overlay viewport__overlay--hint">
          <span className="viewport__overlay-line">
            Spacing anisotropo ×{spacingRatio.toFixed(2)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function mprMessage(
  stackState: ReturnType<typeof useSeriesStack>['state'],
  volume: VolumeState,
): string {
  if (stackState.state === 'error') return 'Caricamento dello stack non riuscito';
  if (stackState.state === 'empty') return 'La serie non contiene immagini';
  if (volume.state === 'error') return 'Preparazione del volume non riuscita';
  if (stackState.state === 'ready' && volume.state === 'loading') {
    return 'Preparazione del volume MPR…';
  }
  if (stackState.state === 'idle') return 'Seleziona una serie per l’MPR';
  return 'Preparazione dell’MPR…';
}
