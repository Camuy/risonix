import type { ApiStatus } from '../hooks/useApiStatus';
import { Button } from './Button';
import { StateMessage } from './StateMessage';

interface ViewportProps {
  status: ApiStatus;
  onRetry: () => void;
}

/** Area viewport: ospiterà i canvas Cornerstone (P2-02). Per ora mostra lo stato. */
export function Viewport({ status, onRetry }: ViewportProps) {
  return (
    <section className="viewport" aria-label="Viewport immagini">
      <div className="viewport__stage">
        {status.state === 'checking' ? (
          <StateMessage
            variant="loading"
            title="Connessione ai servizi…"
            description="Verifica dello stato dell'API di import."
          />
        ) : status.state === 'down' ? (
          <StateMessage
            variant="error"
            title="API non raggiungibile"
            description={`Impossibile contattare ${status.url}. Verifica che il servizio mri-api sia avviato.`}
            action={
              <Button icon="refresh" onClick={onRetry}>
                Riprova la connessione
              </Button>
            }
          />
        ) : (
          <StateMessage
            variant="empty"
            title="Nessuno studio caricato"
            description="Importa un esame DICOM o selezionane uno dal pannello Studi per iniziare la lettura."
          />
        )}
      </div>
    </section>
  );
}
