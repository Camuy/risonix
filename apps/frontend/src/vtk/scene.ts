import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import { cache, eventTarget, EVENTS } from '@cornerstonejs/core';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkOrientationMarkerConstants from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget/Constants';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPolyDataNormals from '@kitware/vtk.js/Filters/Core/PolyDataNormals';
import vtkWindowedSincPolyDataFilter from '@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';

import type { vtkActor as VtkActor } from '@kitware/vtk.js/Rendering/Core/Actor';
import type { vtkAxesActor as VtkAxesActor } from '@kitware/vtk.js/Rendering/Core/AxesActor';
import type { vtkColorTransferFunction as VtkColorTransferFunction } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type { vtkDataArray as VtkDataArray } from '@kitware/vtk.js/Common/Core/DataArray';
import type { vtkGenericRenderWindow as VtkGenericRenderWindow } from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import type { vtkImageData as VtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { vtkImageMarchingCubes as VtkImageMarchingCubes } from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import type { vtkMapper as VtkMapper } from '@kitware/vtk.js/Rendering/Core/Mapper';
import type { vtkOrientationMarkerWidget as VtkOrientationMarkerWidget } from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import type { vtkPiecewiseFunction as VtkPiecewiseFunction } from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import type { vtkPlane as VtkPlane } from '@kitware/vtk.js/Common/DataModel/Plane';
import type { vtkPolyDataNormals as VtkPolyDataNormals } from '@kitware/vtk.js/Filters/Core/PolyDataNormals';
import type { vtkWindowedSincPolyDataFilter as VtkWindowedSincPolyDataFilter } from '@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter';
import type { vtkRenderer as VtkRenderer } from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { vtkVolume as VtkVolume } from '@kitware/vtk.js/Rendering/Core/Volume';
import type { vtkVolumeProperty as VtkVolumeProperty } from '@kitware/vtk.js/Rendering/Core/VolumeProperty';
import type { vtkVolumeMapper as VtkVolumeMapper } from '@kitware/vtk.js/Rendering/Core/VolumeMapper';

import type { VolumeGeometry } from '../cornerstone/volume';
import {
  buildTransferFunctions,
  defaultPresetIdForModality,
  getPreset,
  presetsForModality,
  resolvePreset,
  type GradientOpacitySettings,
  type VolumeBlendMode,
  type VolumePreset,
} from './transferFunctions';

/**
 * Scena 3D VTK.js (P3-03/P3-04): gestore isolato dal viewer MPR.
 *
 * Responsabilità: ciclo di vita della ``GenericRenderWindow`` (contesto WebGL,
 * camera, interattore), gestione degli attori e del piano di taglio,
 * ridimensionamento e rilascio completo delle risorse native.
 *
 * La scena espone due modalità di resa del volume:
 *
 * - ``volume``: volume rendering ray-casting sul ``vtkImageData`` del volume
 *   Cornerstone (trasferimento colore/opacità, campionamento sulla spaziatura);
 * - ``surface``: ricostruzione di superficie con ``ImageMarchingCubes`` a un
 *   isovalore regolabile, mappata sull'inviluppo orientato del volume.
 *
 * Un unico piano di taglio arbitrario, definito da un vettore normale e da una
 * posizione lungo la normale, agisce su entrambi i mapper attivi. I dati voxel
 * provengono dalla cache Cornerstone (``voxelManager``): vengono copiati in un
 * ``vtkImageData`` dedicato per non interferire con il rendering MPR.
 */

type Vec3 = [number, number, number];

/** Modalità di resa della scena 3D. */
export type DisplayMode = 'volume' | 'surface';

export const DISPLAY_MODES: readonly DisplayMode[] = ['volume', 'surface'];

/** Stato del piano di taglio: normale, posizione frazionaria e abilitazione. */
export interface CutPlaneState {
  enabled: boolean;
  /** Componenti del vettore normale (normalizzate prima dell'uso). */
  normal: Vec3;
  /** Frazione 0..1 lungo l'estensione del volume proiettata sulla normale. */
  position: number;
}

/** Stato iniziale del piano di taglio: disabilitato, normale +X, posizione 0. */
export const INITIAL_CUT_PLANE: CutPlaneState = {
  enabled: false,
  normal: [1, 0, 0],
  position: 0,
};

/** Ascoltatori opzionali per l'interfaccia (range/isovalore della superficie). */
export interface Scene3DListeners {
  onSurfaceRangeChanged?: (range: [number, number] | null, isoValue: number | null) => void;
  /** Notifica la modalità richiesta e se è stata applicata ai dati disponibili. */
  onDisplayModeChanged?: (mode: DisplayMode, applied: boolean) => void;
  /** Notifica il preset di volume rendering attivo (anche quando suggerisce un blend). */
  onTransferPresetChanged?: (presetId: string) => void;
  /** Notifica la modalità di composizione attiva (composite/MIP). */
  onBlendModeChanged?: (mode: VolumeBlendMode) => void;
  /** Notifica l'attivazione dello smoothing della superficie. */
  onSurfaceSmoothingChanged?: (enabled: boolean) => void;
  /** Notifica il fattore di supersampling attivo (1 = nativo, 2 = antialiasing). */
  onRenderScaleChanged?: (scale: number) => void;
}

export interface Scene3DOptions extends Scene3DListeners {
  /** Volume Cornerstone da cui estrarre i voxel per P3-04. */
  volumeId?: string;
  /** Modalità DICOM della serie (CT, MR, PT…): seleziona il preset di default. */
  modality?: string | null;
}

interface VolumeData {
  imageData: VtkImageData;
  scalars: VtkDataArray;
  /** Range grezzo (min/max) di tutti i voxel. */
  range: [number, number];
  /** Range robusto ai percentili, usato da transfer function e isovalore. */
  displayRange: [number, number];
}

/** Vista minima del volume Cornerstone necessaria a P3-04. */
interface CornerstoneVolumeLike {
  imageData?: VtkImageData;
  voxelManager?: {
    getCompleteScalarDataArray?: () => ArrayLike<number>;
    getScalarData?: () => ArrayLike<number>;
  };
  getScalarData?: () => ArrayLike<number>;
}

const BACKGROUND: Vec3 = [0.035, 0.045, 0.075];
const BACKGROUND_BOTTOM: Vec3 = [0.12, 0.15, 0.21];
const SURFACE_COLOR: Vec3 = [0.94, 0.86, 0.74];

/**
 * Parametri dello smoothing di superficie (``WindowedSincPolyDataFilter``).
 * La banda passante bassa e poche iterazioni levigano i gradini del marching
 * cubes preservando la forma d'insieme meglio di un filtro Laplaciano (P3-04).
 */
const SURFACE_SMOOTH_ITERATIONS = 15;
const SURFACE_SMOOTH_PASS_BAND = 0.1;
const SURFACE_SMOOTH_FEATURE_ANGLE = 45;

/**
 * Dimensione massima (px) di un lato del buffer di rendering. Con supersampling
 * attivo il buffer cresce fino a 2×: il cap evita di superare i limiti dei
 * framebuffer WebGL e di saturare le GPU integrate.
 */
const MAX_RENDER_DIMENSION = 8192;

/**
 * Percentili usati per il range di visualizzazione del volume. Tagliano gli
 * outlier (aria, metalli, rumore) che altrimenti schiacciano il transfer
 * function su una banda minima dell'istogramma.
 */
const DISPLAY_LOW_PERCENTILE = 0.005;
const DISPLAY_HIGH_PERCENTILE = 0.995;
const DISPLAY_HISTOGRAM_BINS = 4096;
/** Numero massimo di voxel campionati per stimare i percentili. */
const DISPLAY_SAMPLE_TARGET = 250_000;

/** Tolleranza sotto la quale il vettore normale è considerato nullo. */
const NORMAL_EPSILON = 1e-6;

/**
 * Stima il range di intensità "utile" campionando i voxel su una griglia
 * regolare (stride) e costruendo un istogramma a 4096 bin. Il range così
 * ottenuto esclude gli outlier e rende il transfer function stabile su CT, MR
 * e volumi con ampi spazi d'aria.
 */
function displayRange(values: ArrayLike<number>): [number, number] {
  const length = values.length;
  if (length === 0) return [0, 1];
  const stride = Math.max(1, Math.floor(length / DISPLAY_SAMPLE_TARGET));

  let sampleMin = Infinity;
  let sampleMax = -Infinity;
  let sampled = 0;
  for (let i = 0; i < length; i += stride) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    if (value < sampleMin) sampleMin = value;
    if (value > sampleMax) sampleMax = value;
    sampled++;
  }
  if (sampled === 0 || !Number.isFinite(sampleMin) || !Number.isFinite(sampleMax)) return [0, 1];
  if (sampleMax <= sampleMin) return [sampleMin, sampleMax];

  const span = sampleMax - sampleMin;
  const bins = new Uint32Array(DISPLAY_HISTOGRAM_BINS);
  const scale = (DISPLAY_HISTOGRAM_BINS - 1) / span;
  let counted = 0;
  for (let i = 0; i < length; i += stride) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    const bin = Math.min(
      DISPLAY_HISTOGRAM_BINS - 1,
      Math.max(0, Math.round((value - sampleMin) * scale)),
    );
    bins[bin]++;
    counted++;
  }
  if (counted === 0) return [sampleMin, sampleMax];

  const findPercentile = (fraction: number): number => {
    const target = counted * fraction;
    let cumulative = 0;
    for (let bin = 0; bin < bins.length; bin++) {
      cumulative += bins[bin];
      if (cumulative >= target) return sampleMin + bin / scale;
    }
    return sampleMax;
  };

  const low = findPercentile(DISPLAY_LOW_PERCENTILE);
  const high = findPercentile(DISPLAY_HIGH_PERCENTILE);
  if (high - low < span * 1e-4) return [sampleMin, sampleMax];
  return [low, high];
}

/** Coordinate mondo di un vertice del volume (indici voxel in spazio paziente). */
function voxelToWorld(geometry: VolumeGeometry, i: number, j: number, k: number): Vec3 {
  const [rx, ry, rz, cx, cy, cz, nx, ny, nz] = geometry.direction;
  const [sx, sy, sz] = geometry.spacing;
  const [ox, oy, oz] = geometry.origin;
  return [
    ox + (rx ?? 0) * sx * i + (cx ?? 0) * sy * j + (nx ?? 0) * sz * k,
    oy + (ry ?? 0) * sx * i + (cy ?? 0) * sy * j + (ny ?? 0) * sz * k,
    oz + (rz ?? 0) * sx * i + (cz ?? 0) * sy * j + (nz ?? 0) * sz * k,
  ];
}

/** Centro geometrico del volume orientato (coordinate mondo). */
function volumeCenter(geometry: VolumeGeometry): Vec3 {
  const [di, dj, dk] = geometry.dimensions;
  return voxelToWorld(geometry, (di - 1) / 2, (dj - 1) / 2, (dk - 1) / 2);
}

/** Otto vertici dell'inviluppo orientato del volume (coordinate mondo). */
function volumeCorners(geometry: VolumeGeometry): Vec3[] {
  const [di, dj, dk] = geometry.dimensions;
  const corners: Vec3[] = [];
  for (const i of [0, di - 1]) {
    for (const j of [0, dj - 1]) {
      for (const k of [0, dk - 1]) {
        corners.push(voxelToWorld(geometry, i, j, k));
      }
    }
  }
  return corners;
}

/**
 * Matrice che riporta in mondo i punti prodotti da ``ImageMarchingCubes``.
 *
 * Il filtro calcola i vertici come ``origin + spacing * indice`` ignorando la
 * direzione del volume. La trasformazione corretta è ``w = D * (p - origin) +
 * origin``: rotazione ``D`` attorno all'origine seguita dalla traslazione
 * ``origin - D * origin``.
 */
function surfaceOrientationMatrix(geometry: VolumeGeometry): Float32Array {
  const [rx, ry, rz, cx, cy, cz, nx, ny, nz] = geometry.direction;
  const [ox, oy, oz] = geometry.origin;
  const dx = (rx ?? 0) * ox + (cx ?? 0) * oy + (nx ?? 0) * oz;
  const dy = (ry ?? 0) * ox + (cy ?? 0) * oy + (ny ?? 0) * oz;
  const dz = (rz ?? 0) * ox + (cz ?? 0) * oy + (nz ?? 0) * oz;
  // prettier-ignore
  return new Float32Array([
    rx ?? 0, ry ?? 0, rz ?? 0, 0,
    cx ?? 0, cy ?? 0, cz ?? 0, 0,
    nx ?? 0, ny ?? 0, nz ?? 0, 0,
    ox - dx, oy - dy, oz - dz, 1,
  ]);
}

/** Normalizza un vettore; restituisce ``null`` se la lunghezza è trascurabile. */
function normalize(vector: Vec3): Vec3 | null {
  const [x, y, z] = vector;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length < NORMAL_EPSILON) return null;
  return [x / length, y / length, z / length];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Converte i valori voxel in un typed array adatto a VTK. */
function toTypedArray(values: ArrayLike<number>): ArrayBufferView | number[] {
  if (ArrayBuffer.isView(values)) return values as ArrayBufferView;
  return Float32Array.from(values as ArrayLike<number>);
}

/** Collega il piano di taglio al mapper indicato. */
function attachCutPlane(
  mapper: VtkMapper | VtkVolumeMapper,
  plane: VtkPlane,
  enabled: boolean,
): void {
  if (enabled) mapper.addClippingPlane(plane);
}

export class Scene3D {
  private readonly container: HTMLElement;
  private readonly geometry: VolumeGeometry;
  private readonly renderWindow: VtkGenericRenderWindow;
  private readonly renderer: VtkRenderer;
  private readonly cutPlane: VtkPlane;
  private readonly center: Vec3;
  private readonly corners: Vec3[];
  private readonly volumeId?: string;
  private readonly modality: string | null;
  private readonly listeners: Scene3DListeners;

  private orientationWidget: VtkOrientationMarkerWidget | null = null;
  private axesActor: VtkAxesActor | null = null;
  private framed = false;
  private disposed = false;
  private volumeModifiedTimer: number | null = null;

  private mode: DisplayMode = 'volume';
  /** Modalità scelta dall'utente: resta in attesa finché i voxel non sono pronti. */
  private requestedMode: DisplayMode = 'volume';

  /** Preset di volume rendering attivo (colore/opacità/gradient opacity). */
  private transferPresetId: string;
  /** Modalità di composizione lungo il raggio. */
  private blendMode: VolumeBlendMode = 'composite';
  /**
   * Fattore di supersampling del buffer di rendering (1 = nativo, 2 = buffer
   * 2× ricampionato dal browser → antialiasing). Aumenta i pixel da elaborare
   * di 4×: opt-in per non penalizzare le GPU integrate (P3-04).
   */
  private renderScale = 1;

  private cutPlaneEnabled = false;
  private cutPlaneNormal: Vec3 = [1, 0, 0];
  private cutPlanePosition = 0;

  private volumeData: VolumeData | null = null;
  private volumeActor: VtkVolume | null = null;
  private volumeMapper: VtkVolumeMapper | null = null;
  private volumeColor: VtkColorTransferFunction | null = null;
  private volumeOpacity: VtkPiecewiseFunction | null = null;

  private surfaceActor: VtkActor | null = null;
  private surfaceMapper: VtkMapper | null = null;
  private surfaceFilter: VtkImageMarchingCubes | null = null;
  private surfaceSmoother: VtkWindowedSincPolyDataFilter | null = null;
  private surfaceNormals: VtkPolyDataNormals | null = null;
  /** Smoothing della superficie: la mesh grezza resta sempre disponibile. */
  private surfaceSmoothing = false;
  private surfaceRange: [number, number] | null = null;
  private surfaceIsoValue: number | null = null;
  private surfaceIsoUserSet = false;

  constructor(container: HTMLElement, geometry: VolumeGeometry, options: Scene3DOptions = {}) {
    this.container = container;
    this.geometry = geometry;
    this.volumeId = options.volumeId;
    this.modality = options.modality ?? null;
    this.listeners = options;
    this.transferPresetId = defaultPresetIdForModality(this.modality);
    this.center = volumeCenter(geometry);
    this.corners = volumeCorners(geometry);

    this.renderWindow = vtkGenericRenderWindow.newInstance({
      background: BACKGROUND,
      listenWindowResize: false,
    });
    this.renderWindow.setContainer(container);
    this.renderer = this.renderWindow.getRenderer();
    this.renderer.setBackground(...BACKGROUND);
    this.renderer.setBackground2(...BACKGROUND_BOTTOM);
    this.renderer.setGradientBackground(true);

    this.cutPlane = vtkPlane.newInstance({ normal: [1, 0, 0], origin: this.center });

    eventTarget.addEventListener(
      EVENTS.IMAGE_VOLUME_LOADING_COMPLETED,
      this.handleVolumeLoadingCompleted,
    );
    eventTarget.addEventListener(EVENTS.IMAGE_VOLUME_MODIFIED, this.handleVolumeModified);

    this.installOrientationMarker();
    this.applyRequestedMode();
    this.resize();
  }

  /** Gizmo di orientamento anatomico nell'angolo, indipendente dalla camera. */
  private installOrientationMarker(): void {
    try {
      this.axesActor = vtkAxesActor.newInstance();
      this.orientationWidget = vtkOrientationMarkerWidget.newInstance({
        actor: this.axesActor,
        interactor: this.renderWindow.getInteractor(),
      });
      this.orientationWidget.setParentRenderer(this.renderer);
      this.orientationWidget.setViewportCorner(vtkOrientationMarkerConstants.Corners.TOP_RIGHT);
      this.orientationWidget.setViewportSize(0.16);
      this.orientationWidget.setMinPixelSize(80);
      this.orientationWidget.setMaxPixelSize(220);
      this.orientationWidget.setEnabled(true);
    } catch {
      // Il gizmo è decorativo: un errore non deve impedire il rendering del volume.
      this.orientationWidget = null;
      this.axesActor = null;
    }
  }

  /**
   * Al termine del caricamento progressivo del volume i voxel sono completi:
   * scarta i dati parziali e ricostruisce la modalità attiva.
   */
  private readonly handleVolumeLoadingCompleted = (event: Event): void => {
    if (this.disposed) return;
    const detail = (event as CustomEvent<{ volumeId?: string }>).detail;
    if (!detail || detail.volumeId !== this.volumeId) return;
    this.invalidateVolumeData();
  };

  /**
   * Fallback per il caso in cui l'evento di completamento sia già stato emesso
   * prima della costruzione della scena: ai successivi aggiornamenti dei voxel
   * tenta di costruire l'attore se i dati non sono ancora disponibili.
   */
  private readonly handleVolumeModified = (event: Event): void => {
    if (this.disposed) return;
    const detail = (event as CustomEvent<{ volumeId?: string }>).detail;
    if (!detail || detail.volumeId !== this.volumeId) return;
    if (this.volumeData) return;
    if (this.volumeModifiedTimer !== null) window.clearTimeout(this.volumeModifiedTimer);
    this.volumeModifiedTimer = window.setTimeout(() => {
      this.volumeModifiedTimer = null;
      if (this.disposed || this.volumeData) return;
      this.applyRequestedMode();
    }, 250);
  };

  /** Scarta i dati voxel e applica la modalità richiesta con i dati completi. */
  private invalidateVolumeData(): void {
    this.disposeSurfaceActor();
    this.disposeVolumeActor();
    this.volumeData = null;
    this.surfaceRange = null;
    this.notifySurfaceRange();
    this.applyRequestedMode();
  }

  /** Notifica all'interfaccia la modalità richiesta e se è stata applicata. */
  private notifyDisplayMode(mode: DisplayMode, applied: boolean): void {
    this.listeners.onDisplayModeChanged?.(mode, applied);
  }

  /** Modalità di resa corrente. */
  getDisplayMode(): DisplayMode {
    return this.mode;
  }

  /**
   * Cambia modalità di resa: volume rendering o superficie. La richiesta resta
   * memorizzata: se i voxel non sono ancora pronti la vista resta vuota finché
   * i dati non sono disponibili. Restituisce ``true`` se la modalità è già
   * attiva sui dati disponibili.
   */
  setDisplayMode(mode: DisplayMode): boolean {
    if (this.disposed) return false;
    this.requestedMode = mode;
    return this.applyRequestedMode();
  }

  /**
   * Applica la modalità richiesta. Costruisce l'attore necessario e ne
   * sincronizza la visibilità; se i dati voxel non sono disponibili notifica
   * lo stato all'interfaccia.
   */
  private applyRequestedMode(): boolean {
    if (this.disposed) return false;
    const mode = this.requestedMode;

    if (mode === 'volume') {
      const actor = this.ensureVolumeActor();
      if (!actor) {
        this.mode = 'volume';
        this.volumeActor?.setVisibility(false);
        this.surfaceActor?.setVisibility(false);
        this.render();
        this.notifyDisplayMode(mode, false);
        return false;
      }
      this.mode = 'volume';
      this.volumeActor?.setVisibility(true);
      this.surfaceActor?.setVisibility(false);
      this.render();
      this.notifyDisplayMode(mode, true);
      return true;
    }

    const actor = this.ensureSurfaceActor();
    if (!actor) {
      this.mode = 'surface';
      this.volumeActor?.setVisibility(false);
      this.surfaceActor?.setVisibility(false);
      this.render();
      this.notifyDisplayMode(mode, false);
      return false;
    }
    this.mode = 'surface';
    this.volumeActor?.setVisibility(false);
    this.surfaceActor?.setVisibility(true);
    this.render();
    this.notifyDisplayMode(mode, true);
    return true;
  }

  /** Range di intensità disponibile per l'isovalore della superficie. */
  getSurfaceRange(): [number, number] | null {
    const data = this.ensureVolumeData();
    return data ? this.surfaceRange : null;
  }

  /** Isovalore corrente della ricostruzione di superficie. */
  getSurfaceIsoValue(): number | null {
    this.ensureVolumeData();
    return this.surfaceIsoValue;
  }

  /** Imposta l'isovalore della superficie e ne ricostruisce la mesh. */
  setSurfaceIsoValue(value: number): void {
    if (this.disposed || !Number.isFinite(value)) return;
    const range = this.surfaceRange ?? this.ensureVolumeData()?.range ?? null;
    const clamped = range ? clamp(value, range[0], range[1]) : value;
    this.surfaceIsoValue = clamped;
    this.surfaceIsoUserSet = true;
    if (this.surfaceFilter) {
      this.surfaceFilter.setContourValue(clamped);
      this.surfaceFilter.update();
      this.surfaceNormals?.update();
      this.render();
    }
  }

  /** Smoothing della superficie attivo o meno. */
  getSurfaceSmoothingEnabled(): boolean {
    return this.surfaceSmoothing;
  }

  /**
   * Attiva/disattiva lo smoothing della superficie. La pipeline levigata
   * (``WindowedSincPolyDataFilter`` + ``PolyDataNormals``) è costruita in modo
   * pigro e derivata dalla mesh grezza, che resta sempre integra: disattivandolo
   * si torna esattamente alla geometria del marching cubes.
   */
  setSurfaceSmoothingEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.surfaceSmoothing) return;
    this.surfaceSmoothing = enabled;
    if (this.surfaceMapper) {
      this.attachSurfacePipeline();
      this.render();
    }
    this.listeners.onSurfaceSmoothingChanged?.(enabled);
  }

  /** Preset di volume rendering applicabili alla modalità della serie. */
  getTransferPresets(): readonly VolumePreset[] {
    return presetsForModality(this.modality);
  }

  /** Id del preset di volume rendering attivo. */
  getActiveTransferPresetId(): string {
    return this.transferPresetId;
  }

  /**
   * Applica un preset di volume rendering. Aggiorna le transfer function
   * dell'attore esistente senza ricostruire il mapper e applica la modalità di
   * composizione suggerita dal preset. Restituisce ``false`` per un id ignoto.
   */
  setTransferPreset(id: string): boolean {
    if (this.disposed) return false;
    const preset = getPreset(id);
    if (!preset) return false;
    this.transferPresetId = preset.id;
    if (this.volumeActor) this.applyTransferFunctions();
    if (preset.blend && preset.blend !== this.blendMode) {
      this.setBlendMode(preset.blend);
    }
    this.listeners.onTransferPresetChanged?.(preset.id);
    return true;
  }

  /** Modalità di composizione corrente del volume rendering. */
  getBlendMode(): VolumeBlendMode {
    return this.blendMode;
  }

  /** Imposta la modalità di composizione (composite/MIP). */
  setBlendMode(mode: VolumeBlendMode): void {
    if (this.disposed) return;
    if (mode !== 'composite' && mode !== 'mip') return;
    this.blendMode = mode;
    if (this.volumeMapper) {
      this.applyBlendMode(this.volumeMapper);
      this.render();
    }
    this.listeners.onBlendModeChanged?.(mode);
  }

  /** Fattore di supersampling corrente (1 = nativo, 2 = antialiasing 2×). */
  getRenderScale(): number {
    return this.renderScale;
  }

  /**
   * Imposta il fattore di supersampling. Valori ``>= 2`` abilitano il buffer
   * raddoppiato (antialiasing ricampionato dal browser); ``1`` lo disattiva.
   */
  setRenderScale(scale: number): void {
    if (this.disposed) return;
    const next = scale >= 2 ? 2 : 1;
    if (next === this.renderScale) return;
    this.renderScale = next;
    this.resize();
    this.listeners.onRenderScaleChanged?.(next);
  }

  /** Stato corrente del piano di taglio. */
  getCutPlaneState(): CutPlaneState {
    return {
      enabled: this.cutPlaneEnabled,
      normal: [...this.cutPlaneNormal],
      position: this.cutPlanePosition,
    };
  }

  /** Abilita/disabilita il piano di taglio su volume e superficie. */
  setCutPlaneEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.cutPlaneEnabled = enabled;
    const mappers: Array<VtkMapper | VtkVolumeMapper> = [];
    if (this.volumeMapper) mappers.push(this.volumeMapper);
    if (this.surfaceMapper) mappers.push(this.surfaceMapper);
    for (const mapper of mappers) {
      if (enabled) mapper.addClippingPlane(this.cutPlane);
      else mapper.removeClippingPlane(this.cutPlane);
    }
    this.render();
  }

  /**
   * Imposta il vettore normale del piano di taglio. Il vettore viene
   * normalizzato; se è nullo l'ultima normale valida resta invariata.
   */
  setCutPlaneNormal(normal: Vec3): void {
    if (this.disposed) return;
    const unit = normalize(normal);
    if (!unit) return;
    this.cutPlaneNormal = unit;
    this.applyCutPlane();
  }

  /** Sposta il piano lungo la normale (frazione 0..1 dell'estensione). */
  setCutPlanePosition(position: number): void {
    if (this.disposed || !Number.isFinite(position)) return;
    this.cutPlanePosition = clamp(position, 0, 1);
    this.applyCutPlane();
  }

  /** Riporta il piano allo stato iniziale (disabilitato, normale +X). */
  resetCutPlane(): void {
    if (this.disposed) return;
    this.setCutPlaneEnabled(false);
    this.cutPlaneNormal = [1, 0, 0];
    this.cutPlanePosition = 0;
    this.applyCutPlane();
  }

  /**
   * Intervallo di proiezione dei vertici del volume sulla normale: definisce
   * i limiti entro cui può scorrere il piano (coordinate mondo).
   */
  private projectionRange(normal: Vec3): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const corner of this.corners) {
      const offset = dot(
        [corner[0] - this.center[0], corner[1] - this.center[1], corner[2] - this.center[2]],
        normal,
      );
      if (offset < min) min = offset;
      if (offset > max) max = offset;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (max - min < NORMAL_EPSILON) return [min, min + 1];
    return [min, max];
  }

  /** Aggiorna normale/origine del piano e ridisegna la scena. */
  private applyCutPlane(): void {
    const normal = this.cutPlaneNormal;
    const [min, max] = this.projectionRange(normal);
    const offset = min + this.cutPlanePosition * (max - min);
    const origin: Vec3 = [
      this.center[0] + normal[0] * offset,
      this.center[1] + normal[1] * offset,
      this.center[2] + normal[2] * offset,
    ];
    this.cutPlane.setNormal(normal[0], normal[1], normal[2]);
    this.cutPlane.setOrigin(origin[0], origin[1], origin[2]);
    this.render();
  }

  /**
   * Inquadra l'intera scena con una vista 3D obliqua: il fit automatico del
   * renderer è seguito da una rotazione di azimuth/elevazione, così il volume
   * mostra profondità invece di una proiezione frontale piatta.
   */
  resetCamera(): void {
    if (this.disposed) return;
    this.renderer.resetCamera();
    const camera = this.renderer.getActiveCamera();
    camera.azimuth(35);
    camera.elevation(25);
    this.renderer.resetCameraClippingRange();
    this.framed = true;
    this.render();
  }

  /** Ridimensiona il contesto WebGL alla dimensione del contenitore. */
  resize(): void {
    if (this.disposed) return;
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) return;
    this.applyRenderSize();
    if (!this.framed) {
      this.resetCamera();
      return;
    }
    this.render();
  }

  /**
   * Imposta la dimensione del buffer al contenitore moltiplicato per il
   * ``devicePixelRatio`` e per il fattore di supersampling. Il canvas resta al
   * 100% del contenitore: il browser ricampiona verso il basso, ottenendo
   * l'antialiasing senza MSAA (non disponibile sui framebuffer di vtk.js).
   */
  private applyRenderSize(): void {
    const apiWindow = this.renderWindow.getApiSpecificRenderWindow();
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = this.container.getBoundingClientRect();
    const maxDimension = Math.max(width, height, 1);
    let scale = ratio * this.renderScale;
    if (maxDimension * scale > MAX_RENDER_DIMENSION) {
      scale = MAX_RENDER_DIMENSION / maxDimension;
    }
    apiWindow.setSize(
      Math.max(1, Math.floor(width * scale)),
      Math.max(1, Math.floor(height * scale)),
    );
    const canvas = apiWindow.getCanvas();
    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
  }

  /**
   * Estrae i voxel del volume Cornerstone in un ``vtkImageData`` dedicato.
   * ``getCompleteScalarDataArray`` restituisce una copia completa dei voxel;
   * il clone evita di alterare il ``vtkImageData`` usato dall'MPR.
   */
  private ensureVolumeData(): VolumeData | null {
    if (this.volumeData) return this.volumeData;
    if (!this.volumeId) return null;

    const volume = cache.getVolume(this.volumeId) as unknown as CornerstoneVolumeLike | undefined;
    if (!volume || !volume.imageData) return null;

    const source = volume.imageData;
    const voxelManager = (source as unknown as { get?: (key: string) => unknown }).get?.(
      'voxelManager',
    ) as CornerstoneVolumeLike['voxelManager'];

    let values: ArrayLike<number> | undefined;
    if (voxelManager?.getCompleteScalarDataArray) {
      values = voxelManager.getCompleteScalarDataArray();
    } else if (voxelManager?.getScalarData) {
      values = voxelManager.getScalarData();
    } else if (volume.voxelManager?.getCompleteScalarDataArray) {
      values = volume.voxelManager.getCompleteScalarDataArray();
    } else if (typeof volume.getScalarData === 'function') {
      values = volume.getScalarData();
    }
    if (!values || values.length === 0) return null;

    const scalars = vtkDataArray.newInstance({
      name: 'Pixels',
      values: toTypedArray(values) as unknown as number[],
    });

    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(source.getDimensions());
    imageData.setSpacing(source.getSpacing());
    imageData.setOrigin(source.getOrigin());
    imageData.setDirection(source.getDirection());
    imageData.getPointData().setScalars(scalars);

    const [min, max] = scalars.getRange();
    const range: [number, number] = [min, max];
    const robust = displayRange(values);
    if (!this.surfaceIsoUserSet || this.surfaceIsoValue === null) {
      this.surfaceIsoValue = (robust[0] + robust[1]) / 2;
    } else {
      this.surfaceIsoValue = clamp(this.surfaceIsoValue, min, max);
    }

    this.volumeData = { imageData, scalars, range, displayRange: robust };
    this.surfaceRange = range;
    this.notifySurfaceRange();
    return this.volumeData;
  }

  private notifySurfaceRange(): void {
    this.listeners.onSurfaceRangeChanged?.(this.surfaceRange, this.surfaceIsoValue);
  }

  /** Costruisce il volume rendering ray-casting sul volume corrente. */
  private ensureVolumeActor(): VtkVolume | null {
    if (this.volumeActor) return this.volumeActor;
    const data = this.ensureVolumeData();
    if (!data) return null;

    const mapper = vtkVolumeMapper.newInstance();
    mapper.setInputData(data.imageData);
    const spacing = data.imageData.getSpacing();
    const sampleDistance = Math.min(spacing[0], spacing[1], spacing[2]) / 4;
    mapper.setSampleDistance(sampleDistance);
    mapper.setMaximumSamplesPerRay(4096);
    mapper.setAutoAdjustSampleDistances(true);
    this.applyBlendMode(mapper);

    const actor = vtkVolume.newInstance();
    actor.setMapper(mapper);

    const { color, opacity, gradientOpacity } = buildTransferFunctions(
      resolvePreset(this.transferPresetId),
      data.range,
      data.displayRange,
    );

    const averageSpacing = (spacing[0] + spacing[1] + spacing[2]) / 3;
    const property = actor.getProperty();
    property.setRGBTransferFunction(0, color);
    property.setScalarOpacity(0, opacity);
    property.setInterpolationTypeToLinear();
    property.setShade(true);
    property.setAmbient(0.3);
    property.setDiffuse(0.7);
    property.setSpecular(0.25);
    property.setSpecularPower(20);
    property.setScalarOpacityUnitDistance(0, Math.max(averageSpacing, 1e-3));
    this.applyGradientOpacity(property, gradientOpacity);
    property.setVolumetricScatteringBlending(0.15);

    attachCutPlane(mapper, this.cutPlane, this.cutPlaneEnabled);

    this.renderer.addActor(actor);
    this.volumeActor = actor;
    this.volumeMapper = mapper;
    this.volumeColor = color;
    this.volumeOpacity = opacity;
    return actor;
  }

  /** Applica la modalità di composizione corrente al mapper di volume. */
  private applyBlendMode(mapper: VtkVolumeMapper): void {
    if (this.blendMode === 'mip') mapper.setBlendModeToMaximumIntensity();
    else mapper.setBlendModeToComposite();
  }

  /** Configura la gradient opacity sulla proprietà di volume. */
  private applyGradientOpacity(
    property: VtkVolumeProperty,
    settings: GradientOpacitySettings,
  ): void {
    property.setUseGradientOpacity(0, settings.enabled);
    if (!settings.enabled) return;
    property.setGradientOpacityMinimumValue(0, settings.minimumValue);
    property.setGradientOpacityMaximumValue(0, settings.maximumValue);
    property.setGradientOpacityMinimumOpacity(0, settings.minimumOpacity);
    property.setGradientOpacityMaximumOpacity(0, settings.maximumOpacity);
  }

  /** Ricostruisce colore, opacità e gradient opacity del preset attivo. */
  private applyTransferFunctions(): void {
    const actor = this.volumeActor;
    const data = this.volumeData;
    if (!actor || !data) return;
    const { color, opacity, gradientOpacity } = buildTransferFunctions(
      resolvePreset(this.transferPresetId),
      data.range,
      data.displayRange,
    );
    const property = actor.getProperty();
    property.setRGBTransferFunction(0, color);
    property.setScalarOpacity(0, opacity);
    this.applyGradientOpacity(property, gradientOpacity);
    this.volumeColor?.delete();
    this.volumeOpacity?.delete();
    this.volumeColor = color;
    this.volumeOpacity = opacity;
    this.render();
  }

  /** Costruisce la superficie iso con ``ImageMarchingCubes``. */
  private ensureSurfaceActor(): VtkActor | null {
    if (this.surfaceActor) return this.surfaceActor;
    const data = this.ensureVolumeData();
    if (!data) return null;
    if (this.surfaceIsoValue === null) {
      this.surfaceIsoValue = (data.range[0] + data.range[1]) / 2;
    }

    const filter = vtkImageMarchingCubes.newInstance({
      contourValue: this.surfaceIsoValue,
      computeNormals: true,
      mergePoints: true,
    });
    filter.setInputData(data.imageData);
    filter.update();

    const mapper = vtkMapper.newInstance();
    // La mesh non ha scalari propri: usa il colore del materiale dell'attore.
    mapper.setScalarVisibility(false);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.setUserMatrix(surfaceOrientationMatrix(this.geometry));

    const property = actor.getProperty();
    property.setColor(...SURFACE_COLOR);
    property.setOpacity(1);
    property.setInterpolationToPhong();
    property.setAmbient(0.2);
    property.setDiffuse(0.9);
    property.setSpecular(0.5);
    property.setSpecularPower(32);

    attachCutPlane(mapper, this.cutPlane, this.cutPlaneEnabled);

    this.renderer.addActor(actor);
    this.surfaceActor = actor;
    this.surfaceMapper = mapper;
    this.surfaceFilter = filter;
    this.attachSurfacePipeline();
    return actor;
  }

  /**
   * Collega il mapper alla mesh grezza del marching cubes oppure alla pipeline
   * levigata, in base allo stato dello smoothing. La geometria grezza resta
   * sempre integra e ripristinabile.
   */
  private attachSurfacePipeline(): void {
    const mapper = this.surfaceMapper;
    const filter = this.surfaceFilter;
    if (!mapper || !filter) return;
    if (this.surfaceSmoothing) {
      const normals = this.ensureSurfaceNormalsPipeline();
      if (normals) {
        mapper.setInputConnection(normals.getOutputPort());
        return;
      }
    }
    mapper.setInputConnection(filter.getOutputPort());
  }

  /**
   * Costruisce in modo pigro la pipeline di smoothing
   * (``WindowedSincPolyDataFilter`` + ``PolyDataNormals``) derivata dalla mesh
   * grezza. Le normali vanno ricalcolate perché la geometria levigata le rende
   * incoerenti; l'output finale è il filtro delle normali.
   */
  private ensureSurfaceNormalsPipeline(): VtkPolyDataNormals | null {
    const filter = this.surfaceFilter;
    if (!filter) return null;
    if (this.surfaceNormals) return this.surfaceNormals;

    const smoother = vtkWindowedSincPolyDataFilter.newInstance({
      numberOfIterations: SURFACE_SMOOTH_ITERATIONS,
      passBand: SURFACE_SMOOTH_PASS_BAND,
      featureAngle: SURFACE_SMOOTH_FEATURE_ANGLE,
      boundarySmoothing: true,
      featureEdgeSmoothing: false,
      nonManifoldSmoothing: false,
    });
    smoother.setInputConnection(filter.getOutputPort());

    const normals = vtkPolyDataNormals.newInstance({ computePointNormals: true });
    normals.setInputConnection(smoother.getOutputPort());
    normals.update();

    this.surfaceSmoother = smoother;
    this.surfaceNormals = normals;
    return normals;
  }

  private disposeVolumeActor(): void {
    if (!this.volumeActor) return;
    try {
      this.renderer.removeActor(this.volumeActor);
    } catch {
      /* attore già rimosso */
    }
    this.volumeMapper?.delete();
    this.volumeActor.delete();
    this.volumeColor?.delete();
    this.volumeOpacity?.delete();
    this.volumeMapper = null;
    this.volumeActor = null;
    this.volumeColor = null;
    this.volumeOpacity = null;
  }

  private disposeSurfaceActor(): void {
    if (!this.surfaceActor) return;
    try {
      this.renderer.removeActor(this.surfaceActor);
    } catch {
      /* attore già rimosso */
    }
    this.surfaceNormals?.delete();
    this.surfaceSmoother?.delete();
    this.surfaceMapper?.delete();
    this.surfaceFilter?.delete();
    this.surfaceActor.delete();
    this.surfaceNormals = null;
    this.surfaceSmoother = null;
    this.surfaceMapper = null;
    this.surfaceFilter = null;
    this.surfaceActor = null;
  }

  private render(): void {
    if (this.disposed) return;
    this.renderWindow.getRenderWindow().render();
  }

  /**
   * Perde in modo esplicito i contesti WebGL creati dalla scena.
   *
   * ``vtk.js`` non rilascia il contesto del ``GenericRenderWindow`` quando
   * l'oggetto viene eliminato: i canvas restano appesi al contenitore e il
   * contesto viene recuperato solo dal garbage collector, spesso troppo tardi.
   * Il browser ha un limite di contesti attivi per pagina (tipicamente 16);
   * senza questo rilascio, ogni apertura della vista 3D ne consuma altri due e
   * dopo qualche cambio di layout i contesti vengono espulsi, provocando
   * l'errore ``shaderSource must be an instance of WebGLShader``.
   */
  private releaseWebGLContexts(canvases?: readonly HTMLCanvasElement[]): void {
    const targets = canvases ?? Array.from(this.container.querySelectorAll('canvas'));
    for (const canvas of targets) {
      try {
        const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        const loseContext = (
          context as WebGL2RenderingContext | WebGLRenderingContext | null
        )?.getExtension('WEBGL_lose_context');
        loseContext?.loseContext();
      } catch {
        /* contesto già perso o non accessibile */
      }
    }
  }

  /** Rilascia contesto WebGL, attori e oggetti nativi. Idempotente. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    eventTarget.removeEventListener(
      EVENTS.IMAGE_VOLUME_LOADING_COMPLETED,
      this.handleVolumeLoadingCompleted,
    );
    eventTarget.removeEventListener(EVENTS.IMAGE_VOLUME_MODIFIED, this.handleVolumeModified);
    if (this.volumeModifiedTimer !== null) {
      window.clearTimeout(this.volumeModifiedTimer);
      this.volumeModifiedTimer = null;
    }

    this.disposeSurfaceActor();
    this.disposeVolumeActor();
    this.volumeData = null;

    try {
      this.orientationWidget?.setEnabled(false);
      this.orientationWidget?.delete();
    } catch {
      /* widget già rilasciato */
    }
    this.orientationWidget = null;
    this.axesActor?.delete();
    this.axesActor = null;

    this.cutPlane.delete();

    // ``renderWindow.delete()`` rimuove il canvas dal contenitore: catturiamo i
    // riferimenti prima, così possiamo comunque perdere i contesti WebGL.
    const canvases = Array.from(this.container.querySelectorAll('canvas'));
    this.renderWindow.delete();
    this.releaseWebGLContexts(canvases);
    this.container.replaceChildren();
  }
}
