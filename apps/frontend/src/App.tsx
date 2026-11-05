import { useRef, useState } from 'react';

import { IconButton } from './components/Button';
import { Panel } from './components/Panel';
import { Resizer } from './components/Resizer';
import { StateMessage } from './components/StateMessage';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { Viewport } from './components/Viewport';
import { useApiStatus, type ApiStatus } from './hooks/useApiStatus';
import { useFullscreen } from './hooks/useFullscreen';
import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, useResizablePanels } from './hooks/useResizablePanels';

function StudiesContent({ status }: { status: ApiStatus }) {
  if (status.state === 'checking') {
    return <StateMessage compact variant="loading" title="Caricamento studi…" />;
  }
  if (status.state === 'down') {
    return (
      <StateMessage
        compact
        variant="error"
        title="API offline"
        description="Impossibile elencare gli studi finché il servizio non è raggiungibile."
      />
    );
  }
  return (
    <StateMessage
      compact
      variant="empty"
      title="Nessuno studio importato"
      description="Gli studi importati compariranno qui, ordinati per data."
    />
  );
}

function PropertiesContent({ status }: { status: ApiStatus }) {
  if (status.state === 'up') {
    return (
      <StateMessage
        compact
        variant="empty"
        title="Nessuna serie selezionata"
        description="Seleziona una serie per consultarne metadati e parametri geometrici."
      />
    );
  }
  return (
    <StateMessage
      compact
      variant={status.state === 'down' ? 'error' : 'loading'}
      title={status.state === 'down' ? 'API offline' : 'In attesa dei dati…'}
    />
  );
}

export default function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const { status, refresh } = useApiStatus();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef);
  const { leftWidth, rightWidth, setLeftWidth, setRightWidth } = useResizablePanels();
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <div className="app-shell" ref={shellRef}>
      <Toolbar
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        isFullscreen={isFullscreen}
        onToggleLeft={() => setLeftOpen((open) => !open)}
        onToggleRight={() => setRightOpen((open) => !open)}
        onToggleFullscreen={toggleFullscreen}
      />

      <div className="app-body">
        {leftOpen ? (
          <Panel
            side="left"
            width={leftWidth}
            title="Studi"
            actions={<IconButton label="Aggiorna elenco studi" icon="refresh" onClick={refresh} />}
          >
            <StudiesContent status={status} />
          </Panel>
        ) : null}

        {leftOpen ? (
          <Resizer
            side="left"
            value={leftWidth}
            min={PANEL_WIDTH_MIN}
            max={PANEL_WIDTH_MAX}
            onChange={setLeftWidth}
            label="Ridimensiona pannello studi"
          />
        ) : null}

        <Viewport status={status} onRetry={refresh} />

        {rightOpen ? (
          <Resizer
            side="right"
            value={rightWidth}
            min={PANEL_WIDTH_MIN}
            max={PANEL_WIDTH_MAX}
            onChange={setRightWidth}
            label="Ridimensiona pannello proprietà"
          />
        ) : null}

        {rightOpen ? (
          <Panel side="right" width={rightWidth} title="Proprietà">
            <PropertiesContent status={status} />
          </Panel>
        ) : null}
      </div>

      <StatusBar status={status} />
    </div>
  );
}
