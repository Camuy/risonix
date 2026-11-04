import { useEffect, useState } from 'react';

type ServiceState = 'checking' | 'up' | 'down';

interface ServiceStatus {
  name: string;
  url: string;
  state: ServiceState;
  detail?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function fetchApiStatus(signal: AbortSignal): Promise<ServiceStatus> {
  const base: ServiceStatus = { name: 'mri-api', url: API_BASE_URL, state: 'checking' };
  try {
    const response = await fetch(`${API_BASE_URL}/api/version`, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { version?: string };
    return { ...base, state: 'up', detail: data.version };
  } catch {
    return { ...base, state: 'down' };
  }
}

export default function App() {
  const [api, setApi] = useState<ServiceStatus>({
    name: 'mri-api',
    url: API_BASE_URL,
    state: 'checking',
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    void fetchApiStatus(controller.signal).then((status) => setApi(status));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const stateLabel: Record<ServiceState, string> = {
    checking: 'verifica…',
    up: 'operativo',
    down: 'non raggiungibile',
  };

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Risonix</h1>
        <p className="subtitle">MRI Explorer — ambiente Docker (Phase 0)</p>
      </header>

      <section className="card" aria-live="polite">
        <h2>Stato dei servizi</h2>
        <ul className="services">
          <li>
            <span className="dot" data-state={api.state} aria-hidden="true" />
            <span className="service-name">{api.name}</span>
            <span className="service-url">{api.url}</span>
            <span className="service-state">{stateLabel[api.state]}</span>
            {api.detail ? <span className="service-detail">v{api.detail}</span> : null}
          </li>
        </ul>
        <p className="hint">
          Il frontend è attivo. L&apos;API compare come operativa quando il container{' '}
          <code>mri-api</code> è avviato.
        </p>
      </section>

      <footer className="footer">
        UI di placeholder — il viewer DICOM (Cornerstone3D) arriverà nella Fase 2.
      </footer>
    </main>
  );
}
