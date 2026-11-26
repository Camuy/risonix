import { useCallback, useEffect, useRef, useState } from 'react';

import type { VolumeGeometry } from '../cornerstone/volume';
import {
  DISPLAY_MODES,
  INITIAL_CUT_PLANE,
  Scene3D,
  type CutPlaneState,
  type DisplayMode,
} from '../vtk/scene';
import type { VolumeBlendMode, VolumePreset } from '../vtk/transferFunctions';
import { StateMessage } from './StateMessage';

interface VtkViewportProps {
  geometry: VolumeGeometry;
  volumeId?: string;
  modality?: string | null;
}

const ISO_STEP_RATIO = 0.01;
const ISO_DEBOUNCE_MS = 120;
const NORMAL_STEP = 0.05;
const POSITION_STEP = 0.01;

const MODE_LABEL: Record<DisplayMode, string> = {
  volume: 'Volume',
  surface: 'Superficie',
};

const BLEND_MODES: ReadonlyArray<{ value: VolumeBlendMode; label: string }> = [
  { value: 'composite', label: 'Composite' },
  { value: 'mip', label: 'MIP' },
];

const NORMAL_AXIS_LABEL = ['X', 'Y', 'Z'] as const;

/**
 * Viewport 3D VTK.js (P3-03/P3-04). Monta la ``Scene3D`` sull'elemento e ne
 * gestisce il ciclo di vita (resize via ``ResizeObserver``, rilascio allo
 * smontaggio). L'overlay offre la scelta della modalità di resa (volume,
 * superficie), l'isovalore della superficie e un piano di taglio arbitrario
 * definito da vettore normale e posizione.
 */
export function VtkViewport({ geometry, volumeId, modality }: VtkViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const isoDebounceRef = useRef<number | null>(null);
  const cutPlaneRef = useRef<CutPlaneState>(INITIAL_CUT_PLANE);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>('volume');
  const [modeReady, setModeReady] = useState(false);
  const [surfaceRange, setSurfaceRange] = useState<[number, number] | null>(null);
  const [isoValue, setIsoValue] = useState(0);
  const [cutPlane, setCutPlane] = useState<CutPlaneState>(INITIAL_CUT_PLANE);
  const [presets, setPresets] = useState<readonly VolumePreset[]>([]);
  const [presetId, setPresetId] = useState('');
  const [blendMode, setBlendMode] = useState<VolumeBlendMode>('composite');
  const [smoothing, setSmoothing] = useState(false);
  const [supersampling, setSupersampling] = useState(false);

  const handleSurfaceRange = useCallback((range: [number, number] | null, iso: number | null) => {
    setSurfaceRange(range);
    if (range && iso !== null) setIsoValue(iso);
  }, []);

  const handleDisplayMode = useCallback((next: DisplayMode, applied: boolean) => {
    setMode(next);
    setModeReady(applied);
  }, []);

  const handleTransferPreset = useCallback((next: string) => setPresetId(next), []);

  const handleBlendMode = useCallback((next: VolumeBlendMode) => setBlendMode(next), []);

  const handleSurfaceSmoothing = useCallback((next: boolean) => setSmoothing(next), []);

  const handleRenderScale = useCallback((scale: number) => setSupersampling(scale > 1), []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    setMode('volume');
    setModeReady(false);
    setSurfaceRange(null);
    setIsoValue(0);
    setCutPlane(INITIAL_CUT_PLANE);
    cutPlaneRef.current = INITIAL_CUT_PLANE;
    setPresets([]);
    setPresetId('');
    setBlendMode('composite');
    setSmoothing(false);
    setSupersampling(false);

    let scene: Scene3D | null = null;
    try {
      scene = new Scene3D(element, geometry, {
        volumeId,
        modality,
        onSurfaceRangeChanged: handleSurfaceRange,
        onDisplayModeChanged: handleDisplayMode,
        onTransferPresetChanged: handleTransferPreset,
        onBlendModeChanged: handleBlendMode,
        onSurfaceSmoothingChanged: handleSurfaceSmoothing,
        onRenderScaleChanged: handleRenderScale,
      });
      sceneRef.current = scene;
      setPresets(scene.getTransferPresets());
      setPresetId(scene.getActiveTransferPresetId());
      setBlendMode(scene.getBlendMode());
      setSmoothing(scene.getSurfaceSmoothingEnabled());
      setSupersampling(scene.getRenderScale() > 1);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore di rendering 3D');
    }

    return () => {
      if (isoDebounceRef.current !== null) {
        window.clearTimeout(isoDebounceRef.current);
        isoDebounceRef.current = null;
      }
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [
    geometry,
    volumeId,
    modality,
    handleSurfaceRange,
    handleDisplayMode,
    handleTransferPreset,
    handleBlendMode,
    handleSurfaceSmoothing,
    handleRenderScale,
  ]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => sceneRef.current?.resize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const changeMode = useCallback((next: DisplayMode) => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Lo stato (mode/modeReady) è aggiornato da handleDisplayMode: se i voxel
    // non sono pronti la richiesta resta attiva e viene applicata al termine.
    scene.setDisplayMode(next);
    if (next === 'surface') {
      setSurfaceRange(scene.getSurfaceRange());
      const iso = scene.getSurfaceIsoValue();
      if (iso !== null) setIsoValue(iso);
    }
  }, []);

  const changeIsoValue = useCallback((value: number) => {
    setIsoValue(value);
    if (isoDebounceRef.current !== null) window.clearTimeout(isoDebounceRef.current);
    isoDebounceRef.current = window.setTimeout(() => {
      isoDebounceRef.current = null;
      sceneRef.current?.setSurfaceIsoValue(value);
    }, ISO_DEBOUNCE_MS);
  }, []);

  const changePreset = useCallback((id: string) => {
    sceneRef.current?.setTransferPreset(id);
  }, []);

  const changeBlendMode = useCallback((next: VolumeBlendMode) => {
    sceneRef.current?.setBlendMode(next);
  }, []);

  const changeSmoothing = useCallback((enabled: boolean) => {
    sceneRef.current?.setSurfaceSmoothingEnabled(enabled);
  }, []);

  const changeSupersampling = useCallback((enabled: boolean) => {
    sceneRef.current?.setRenderScale(enabled ? 2 : 1);
  }, []);

  const applyCutPlane = useCallback((next: CutPlaneState) => {
    cutPlaneRef.current = next;
    setCutPlane(next);
  }, []);

  const toggleCutPlane = useCallback(
    (enabled: boolean) => {
      applyCutPlane({ ...cutPlaneRef.current, enabled });
      sceneRef.current?.setCutPlaneEnabled(enabled);
    },
    [applyCutPlane],
  );

  const changeNormal = useCallback(
    (axis: 0 | 1 | 2, value: number) => {
      const current = cutPlaneRef.current;
      const normal: [number, number, number] = [...current.normal];
      normal[axis] = value;
      applyCutPlane({ ...current, normal });
      sceneRef.current?.setCutPlaneNormal(normal);
    },
    [applyCutPlane],
  );

  const changeCutPosition = useCallback(
    (value: number) => {
      applyCutPlane({ ...cutPlaneRef.current, position: value });
      sceneRef.current?.setCutPlanePosition(value);
    },
    [applyCutPlane],
  );

  const resetCutPlane = useCallback(() => {
    const next: CutPlaneState = { ...INITIAL_CUT_PLANE, normal: [1, 0, 0] };
    applyCutPlane(next);
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setCutPlaneNormal(next.normal);
    scene.setCutPlanePosition(next.position);
    scene.setCutPlaneEnabled(next.enabled);
  }, [applyCutPlane]);

  const fit = useCallback(() => sceneRef.current?.resetCamera(), []);

  return (
    <div className="viewport__canvas-host">
      <div ref={elementRef} className="viewport__canvas" />

      <div className="viewport__overlay" aria-live="polite">
        <span className="viewport__overlay-line">Scena 3D · volume</span>
        <span className="viewport__overlay-hint">
          Trascina per ruotare · rotella per zoom · tasto centrale per pan
        </span>
      </div>

      <div className="viewport__clip" role="group" aria-label="Controlli 3D">
        <div className="viewport__modes" role="group" aria-label="Modalità di rendering">
          <span className="viewport__clip-title">Rendering</span>
          <div className="viewport__modes-buttons">
            {DISPLAY_MODES.map((value) => (
              <button
                key={value}
                type="button"
                className={
                  mode === value
                    ? 'viewport__clip-action viewport__clip-action--active'
                    : 'viewport__clip-action'
                }
                aria-pressed={mode === value}
                onClick={() => changeMode(value)}
              >
                {MODE_LABEL[value]}
              </button>
            ))}
          </div>
          {!modeReady ? (
            <span className="viewport__overlay-hint">
              {mode === 'volume' ? 'Caricamento volume…' : 'Preparazione superficie…'}
            </span>
          ) : null}
        </div>

        {mode === 'volume' ? (
          <div className="viewport__volume" role="group" aria-label="Resa volumetrica">
            <div className="viewport__clip-head">
              <span className="viewport__clip-title">Transfer function</span>
            </div>
            <select
              className="viewport__select"
              value={presetId}
              aria-label="Preset di volume rendering"
              onChange={(event) => changePreset(event.target.value)}
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>

            <div className="viewport__clip-head">
              <span className="viewport__clip-title">Composizione</span>
            </div>
            <div className="viewport__modes-buttons">
              {BLEND_MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    blendMode === option.value
                      ? 'viewport__clip-action viewport__clip-action--active'
                      : 'viewport__clip-action'
                  }
                  aria-pressed={blendMode === option.value}
                  onClick={() => changeBlendMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mode === 'surface' && surfaceRange ? (
          <div className="viewport__surface" role="group" aria-label="Ricostruzione di superficie">
            <div className="viewport__clip-head">
              <span className="viewport__clip-title">Superficie</span>
              <span className="viewport__clip-axis">{isoValue.toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="viewport__clip-range"
              min={surfaceRange[0]}
              max={surfaceRange[1]}
              step={(surfaceRange[1] - surfaceRange[0]) * ISO_STEP_RATIO || 1}
              value={isoValue}
              aria-label="Isovalore della superficie"
              onChange={(event) => changeIsoValue(Number(event.target.value))}
            />
            <label className="viewport__cut-toggle">
              <input
                type="checkbox"
                checked={smoothing}
                aria-label="Levigatura della superficie"
                onChange={(event) => changeSmoothing(event.target.checked)}
              />
              <span className="viewport__clip-title">Levigatura</span>
            </label>
          </div>
        ) : null}

        <div className="viewport__cut" role="group" aria-label="Piano di taglio">
          <div className="viewport__clip-head">
            <label className="viewport__cut-toggle">
              <input
                type="checkbox"
                checked={cutPlane.enabled}
                aria-label="Abilita piano di taglio"
                onChange={(event) => toggleCutPlane(event.target.checked)}
              />
              <span className="viewport__clip-title">Piano di taglio</span>
            </label>
            <button type="button" className="viewport__clip-action" onClick={resetCutPlane}>
              Reset
            </button>
          </div>

          <span className="viewport__cut-subtitle">Normale</span>
          {NORMAL_AXIS_LABEL.map((label, index) => {
            const axis = index as 0 | 1 | 2;
            return (
              <label key={label} className="viewport__cut-row">
                <span className="viewport__clip-axis">{label}</span>
                <span className="viewport__cut-value">{cutPlane.normal[axis].toFixed(2)}</span>
                <input
                  type="range"
                  className="viewport__clip-range"
                  min={-1}
                  max={1}
                  step={NORMAL_STEP}
                  value={cutPlane.normal[axis]}
                  disabled={!cutPlane.enabled}
                  aria-label={`Componente ${label} del vettore normale`}
                  onChange={(event) => changeNormal(axis, Number(event.target.value))}
                />
              </label>
            );
          })}

          <label className="viewport__cut-row">
            <span className="viewport__clip-axis">Pos</span>
            <span className="viewport__cut-value">{Math.round(cutPlane.position * 100)}%</span>
            <input
              type="range"
              className="viewport__clip-range"
              min={0}
              max={1}
              step={POSITION_STEP}
              value={cutPlane.position}
              disabled={!cutPlane.enabled}
              aria-label="Posizione del piano di taglio"
              onChange={(event) => changeCutPosition(Number(event.target.value))}
            />
          </label>
        </div>

        <label className="viewport__cut-toggle">
          <input
            type="checkbox"
            checked={supersampling}
            aria-label="Antialiasing per supersampling"
            onChange={(event) => changeSupersampling(event.target.checked)}
          />
          <span className="viewport__clip-title">Antialiasing 2×</span>
        </label>

        <button type="button" className="viewport__clip-action" onClick={fit}>
          Adatta vista
        </button>
      </div>

      {error ? (
        <div className="viewport__overlay viewport__overlay--error">
          <StateMessage variant="error" title="Rendering 3D non riuscito" description={error} />
        </div>
      ) : null}
    </div>
  );
}
