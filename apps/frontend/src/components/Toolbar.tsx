import { useEffect, useRef, useState } from 'react';

import type { CrosshairSize, ViewportTool } from '../cornerstone/engine';
import type { ViewportLayout } from '../hooks/useViewportLayout';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';

interface ToolbarProps {
  leftOpen: boolean;
  rightOpen: boolean;
  isFullscreen: boolean;
  layout: ViewportLayout;
  activeTool: ViewportTool;
  crosshairSize: CrosshairSize;
  measurementColor: string;
  selectedCount: number;
  inverted: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleFullscreen: () => void;
  onLayoutChange: (layout: ViewportLayout) => void;
  onToolChange: (tool: ViewportTool) => void;
  onCrosshairSizeChange: (size: CrosshairSize) => void;
  onMeasurementColorChange: (color: string) => void;
  onDeleteSelected: () => void;
  onEditNote: () => void;
  onRotate: () => void;
  onToggleInvert: () => void;
  onResetView: () => void;
  onFitView: () => void;
}

const LAYOUTS: Array<{ value: ViewportLayout; label: string; icon: 'layout-single' | 'layout-columns' | 'layout-rows' | 'layout-grid' }> = [
  { value: '1x1', label: 'Un viewport', icon: 'layout-single' },
  { value: '2x1', label: 'Due viewport affiancati', icon: 'layout-columns' },
  { value: '1x2', label: 'Due viewport impilati', icon: 'layout-rows' },
  { value: '2x2', label: 'Quattro viewport', icon: 'layout-grid' },
];

interface ToolOption {
  value: ViewportTool;
  label: string;
  icon: IconName;
}

const TOOL_GROUPS: Array<{ label: string; tools: ToolOption[] }> = [
  {
    label: 'Puntatore',
    tools: [{ value: 'reference', label: 'Puntatore e crosshair', icon: 'crosshair' }],
  },
  {
    label: 'Misure',
    tools: [
      { value: 'length', label: 'Lunghezza', icon: 'ruler' },
      { value: 'angle', label: 'Angolo (due segmenti)', icon: 'angle' },
      { value: 'probe', label: 'Sonda valori', icon: 'probe' },
    ],
  },
  {
    label: 'Aree',
    tools: [
      { value: 'spline', label: 'Polilinea concatenata', icon: 'spline' },
      { value: 'freehand', label: 'Mano libera', icon: 'freehand' },
    ],
  },
  {
    label: 'Navigazione',
    tools: [
      { value: 'pan', label: 'Sposta immagine', icon: 'hand' },
      { value: 'zoom', label: 'Zoom', icon: 'zoom' },
      { value: 'windowLevel', label: 'Finestra e livello', icon: 'contrast' },
    ],
  },
];

const ALL_TOOLS = TOOL_GROUPS.flatMap((group) => group.tools);

const MEASUREMENT_TOOLS: ViewportTool[] = [
  'length',
  'angle',
  'spline',
  'freehand',
  'probe',
];

const CROSSHAIR_SIZES: Array<{ value: CrosshairSize; label: string; short: string }> = [
  { value: 'small', label: 'Crosshair piccolo', short: 'S' },
  { value: 'medium', label: 'Crosshair standard', short: 'M' },
  { value: 'large', label: 'Crosshair grande', short: 'L' },
];

/** Barra dei comandi superiore: un solo selettore strumento apre il menu funzioni. */
export function Toolbar({
  leftOpen,
  rightOpen,
  isFullscreen,
  layout,
  activeTool,
  crosshairSize,
  measurementColor,
  selectedCount,
  inverted,
  onToggleLeft,
  onToggleRight,
  onToggleFullscreen,
  onLayoutChange,
  onToolChange,
  onCrosshairSizeChange,
  onMeasurementColorChange,
  onDeleteSelected,
  onEditNote,
  onRotate,
  onToggleInvert,
  onResetView,
  onFitView,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentTool = ALL_TOOLS.find((tool) => tool.value === activeTool) ?? ALL_TOOLS[0];
  const isReference = activeTool === 'reference';
  const isMeasurement = MEASUREMENT_TOOLS.includes(activeTool);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const selectTool = (tool: ViewportTool) => {
    onToolChange(tool);
    setMenuOpen(false);
  };

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

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="toolbar__group" role="group" aria-label="Layout viewport">
        {LAYOUTS.map((option) => (
          <IconButton
            key={option.value}
            label={option.label}
            icon={option.icon}
            pressed={layout === option.value}
            onClick={() => onLayoutChange(option.value)}
          />
        ))}
      </div>

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="toolbar__group" role="group" aria-label="Vista immagine">
        <IconButton label="Ruota di 90°" icon="rotate" onClick={onRotate} />
        <IconButton
          label={inverted ? 'Ripristina i toni' : 'Inverti i toni'}
          icon="invert"
          pressed={inverted}
          onClick={onToggleInvert}
        />
        <IconButton label="Reimposta vista" icon="reset" onClick={onResetView} />
        <IconButton label="Adatta all'immagine" icon="fit" onClick={onFitView} />
      </div>

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="tool-menu" ref={menuRef}>
        <button
          type="button"
          className="tool-menu__trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Strumento attivo: ${currentTool.label}. Apri elenco funzioni`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={currentTool.icon} />
          <span className="tool-menu__current">{currentTool.label}</span>
          <Icon name="chevron-down" size={14} />
        </button>

        {menuOpen ? (
          <div className="tool-menu__panel" role="menu" aria-label="Funzioni disponibili">
            {TOOL_GROUPS.map((group) => (
              <div className="tool-menu__group" key={group.label}>
                <div className="tool-menu__group-label">{group.label}</div>
                {group.tools.map((tool) => (
                  <button
                    key={tool.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeTool === tool.value}
                    data-tool={tool.value}
                    className="tool-menu__item"
                    onClick={() => selectTool(tool.value)}
                  >
                    <Icon name={tool.icon} />
                    <span>{tool.label}</span>
                    {activeTool === tool.value ? <Icon name="check" size={14} /> : null}
                  </button>
                ))}
              </div>
            ))}

            {isReference ? (
              <div className="tool-menu__settings" aria-label="Aspetto crosshair">
                <div className="tool-menu__settings-label">Crosshair</div>
                <div className="tool-menu__settings-row">
                  {CROSSHAIR_SIZES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="toolbar__size"
                      aria-label={option.label}
                      aria-pressed={crosshairSize === option.value}
                      onClick={() => onCrosshairSizeChange(option.value)}
                    >
                      {option.short}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isMeasurement ? (
              <div className="tool-menu__settings" aria-label="Aspetto misure">
                <div className="tool-menu__settings-label">Misure</div>
                <div className="tool-menu__settings-row">
                  <label className="toolbar__color" title="Colore delle misure">
                    <input
                      type="color"
                      value={measurementColor}
                      aria-label="Colore delle misure"
                      onChange={(event) => onMeasurementColorChange(event.target.value)}
                    />
                  </label>
                  <span className="tool-menu__hint">
                    {activeTool === 'probe'
                      ? 'Trascina il bordo della sfera per cambiarne il raggio.'
                      : 'Seleziona una misura sull\'immagine per modificarla o eliminarla.'}
                  </span>
                </div>
                <button
                  type="button"
                  className="tool-menu__action"
                  disabled={selectedCount === 0}
                  onClick={onDeleteSelected}
                >
                  <Icon name="trash" size={14} />
                  Elimina selezionata
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <>
          <IconButton
            label="Aggiungi o modifica nota alla misura selezionata"
            icon="note"
            onClick={onEditNote}
          />
          <IconButton
            label="Elimina misura selezionata"
            icon="trash"
            onClick={onDeleteSelected}
          />
        </>
      ) : null}

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
