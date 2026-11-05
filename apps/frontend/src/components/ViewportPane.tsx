import type { SeriesSelection } from '../api/stack';
import { useSeriesStack } from '../hooks/useSeriesStack';
import type { ApiStatus } from '../hooks/useApiStatus';
import { Button } from './Button';
import { StackViewport } from './StackViewport';
import { StateMessage } from './StateMessage';

interface ViewportPaneProps {
  viewportId: string;
  active: boolean;
  selection: SeriesSelection | null;
  status: ApiStatus;
  onActivate: () => void;
  onRetry: () => void;
}

/** Singolo riquadro multi-viewport: stato, stack e attivazione (P2-05). */
export function ViewportPane({
  viewportId,
  active,
  selection,
  status,
  onActivate,
  onRetry,
}: ViewportPaneProps) {
  const { state, reload } = useSeriesStack(selection, status.state === 'up');

  return (
    <div className="pane" data-active={active} onMouseDown={onActivate}>
      <div className="pane__stage">
        {status.state === 'checking' ? (
          <StateMessage compact variant="loading" title="Connessione ai servizi…" />
        ) : status.state === 'down' ? (
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
        ) : !selection ? (
          <StateMessage
            compact
            variant="empty"
            title="Viewport vuoto"
            description="Seleziona una serie dal pannello Studi per assegnarla a questo riquadro."
          />
        ) : state.state === 'loading' ? (
          <StateMessage compact variant="loading" title="Preparazione dello stack…" />
        ) : state.state === 'error' ? (
          <StateMessage
            compact
            variant="error"
            title="Caricamento non riuscito"
            description={state.message}
            action={
              <Button icon="refresh" onClick={reload}>
                Riprova
              </Button>
            }
          />
        ) : state.state === 'ready' ? (
          <StackViewport
            stack={state.stack}
            viewportId={viewportId}
            active={active}
            onActivate={onActivate}
          />
        ) : (
          <StateMessage compact variant="empty" title="La serie non contiene immagini" />
        )}
      </div>
    </div>
  );
}
