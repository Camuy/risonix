import { useCallback, useEffect, useRef, useState } from 'react';

import type { VolumeGeometry } from '../cornerstone/volume';
import { CLIP_AXES, CLIP_AXIS_LABEL, Scene3D, type ClipAxis, type ClipBound } from '../vtk/scene';
import { StateMessage } from './StateMessage';

interface VtkViewportProps {
  geometry: VolumeGeometry;
}

interface ClipState {
  enabled: boolean;
  value: number;
}

type ClipStates = Record<ClipAxis, ClipState>;

const CLIP_STEP_RATIO = 0.004;

function initialClip(bounds: Record<ClipAxis, ClipBound>): ClipStates {
  return {
    x: { enabled: false, value: bounds.x.min },
    y: { enabled: false, value: bounds.y.min },
    z: { enabled: false, value: bounds.z.min },
  };
}

/**
 * Viewport 3D VTK.js (P3-03). Monta la ``Scene3D`` sull'elemento e ne gestisce
 * il ciclo di vita (resize via ``ResizeObserver``, rilascio allo smontaggio).
 * L'overlay offre i tre piani di clipping (assi paziente) e il fit della vista.
 */
export function VtkViewport({ geometry }: VtkViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Record<ClipAxis, ClipBound> | null>(null);
  const [clip, setClip] = useState<ClipStates | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let scene: Scene3D | null = null;
    try {
      scene = new Scene3D(element, geometry);
      sceneRef.current = scene;
      const clipBounds = scene.getClipBounds();
      setBounds(clipBounds);
      setClip(initialClip(clipBounds));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore di rendering 3D');
    }

    return () => {
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => sceneRef.current?.resize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggleClip = useCallback((axis: ClipAxis, enabled: boolean) => {
    setClip((current) =>
      current ? { ...current, [axis]: { ...current[axis], enabled } } : current,
    );
    sceneRef.current?.setClipEnabled(axis, enabled);
  }, []);

  const moveClip = useCallback((axis: ClipAxis, value: number) => {
    setClip((current) => (current ? { ...current, [axis]: { ...current[axis], value } } : current));
    sceneRef.current?.setClip(axis, value);
  }, []);

  const resetClip = useCallback(() => {
    setClip((current) => (bounds ? initialClip(bounds) : current));
    sceneRef.current?.resetClipping();
  }, [bounds]);

  const fit = useCallback(() => sceneRef.current?.resetCamera(), []);

  return (
    <div className="viewport__canvas-host">
      <div ref={elementRef} className="viewport__canvas" />

      <div className="viewport__overlay" aria-live="polite">
        <span className="viewport__overlay-line">Scena 3D · estensione volume</span>
        <span className="viewport__overlay-hint">
          Trascina per ruotare · rotella per zoom · tasto centrale per pan
        </span>
      </div>

      {bounds && clip ? (
        <div className="viewport__clip" role="group" aria-label="Piani di clipping">
          <div className="viewport__clip-head">
            <span className="viewport__clip-title">Clipping</span>
            <button type="button" className="viewport__clip-action" onClick={resetClip}>
              Reset
            </button>
          </div>
          {CLIP_AXES.map((axis) => (
            <label key={axis} className="viewport__clip-row">
              <input
                type="checkbox"
                checked={clip[axis].enabled}
                aria-label={`Abilita piano di clipping ${CLIP_AXIS_LABEL[axis]}`}
                onChange={(event) => toggleClip(axis, event.target.checked)}
              />
              <span className="viewport__clip-axis">{CLIP_AXIS_LABEL[axis]}</span>
              <input
                type="range"
                className="viewport__clip-range"
                min={bounds[axis].min}
                max={bounds[axis].max}
                step={(bounds[axis].max - bounds[axis].min) * CLIP_STEP_RATIO || 1}
                value={clip[axis].value}
                disabled={!clip[axis].enabled}
                aria-label={`Posizione piano di clipping ${CLIP_AXIS_LABEL[axis]}`}
                onChange={(event) => moveClip(axis, Number(event.target.value))}
              />
            </label>
          ))}
          <button type="button" className="viewport__clip-action" onClick={fit}>
            Adatta vista
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="viewport__overlay viewport__overlay--error">
          <StateMessage variant="error" title="Rendering 3D non riuscito" description={error} />
        </div>
      ) : null}
    </div>
  );
}
