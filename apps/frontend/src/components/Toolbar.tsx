import { IconButton } from './Button';
import { Icon } from './Icon';

interface ToolbarProps {
  leftOpen: boolean;
  rightOpen: boolean;
  isFullscreen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleFullscreen: () => void;
}

/** Barra dei comandi superiore: brand, toggle pannelli, schermo intero. */
export function Toolbar({
  leftOpen,
  rightOpen,
  isFullscreen,
  onToggleLeft,
  onToggleRight,
  onToggleFullscreen,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__mark" aria-hidden="true">
          <Icon name="scan" size={16} />
        </span>
        <div>
          <div className="toolbar__title">Risonix</div>
          <div className="toolbar__subtitle">MRI Explorer</div>
        </div>
      </div>

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="toolbar__group">
        <IconButton
          label={leftOpen ? 'Nascondi pannello studi' : 'Mostra pannello studi'}
          icon="panel-left"
          pressed={leftOpen}
          onClick={onToggleLeft}
        />
        <IconButton
          label={rightOpen ? 'Nascondi pannello proprietà' : 'Mostra pannello proprietà'}
          icon="panel-right"
          pressed={rightOpen}
          onClick={onToggleRight}
        />
      </div>

      <div className="toolbar__group toolbar__group--end">
        <IconButton
          label={isFullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
          icon={isFullscreen ? 'minimize' : 'maximize'}
          pressed={isFullscreen}
          onClick={onToggleFullscreen}
        />
      </div>
    </header>
  );
}
