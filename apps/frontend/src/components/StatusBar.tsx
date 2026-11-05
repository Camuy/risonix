import type { ApiStatus, ServiceState } from '../hooks/useApiStatus';

const STATE_LABEL: Record<ServiceState, string> = {
  checking: 'verifica…',
  up: 'operativo',
  down: 'non raggiungibile',
};

interface StatusBarProps {
  status: ApiStatus;
}

/** Barra di stato inferiore: salute dei servizi e contesto applicativo. */
export function StatusBar({ status }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <span className="statusbar__item">
          <span className="status-dot" data-state={status.state} aria-hidden="true" />
          <span className="statusbar__label">mri-api</span>
          <span className="statusbar__value">{STATE_LABEL[status.state]}</span>
        </span>
        {status.version ? (
          <span className="statusbar__item">
            <span className="statusbar__label">versione</span>
            <span className="statusbar__value">v{status.version}</span>
          </span>
        ) : null}
      </div>

      <div className="statusbar__group statusbar__group--end">
        <span className="statusbar__item text-faint">Read-only locale</span>
        <span className="statusbar__item">
          <span className="statusbar__label">Risonix</span>
          <span className="statusbar__value">v0.1.0</span>
        </span>
      </div>
    </footer>
  );
}
