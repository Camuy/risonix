import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

import type { vtkColorTransferFunction as VtkColorTransferFunction } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type { vtkPiecewiseFunction as VtkPiecewiseFunction } from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

/**
 * Transfer function e preset di volume rendering per la scena 3D (P3-04).
 *
 * Il rendering a volume è tanto più leggibile quanto più la trasferta di
 * colore/opacità riflette la modalità di acquisizione: i CT sono quantificati
 * in unità Hounsfield (HU), quindi le soglie possono essere ancorate a valori
 * fisici; MR e PET non hanno scala assoluta e vanno mappati in modo relativo
 * alla finestra di visualizzazione. Questo modulo raccoglie i preset e li
 * traduce in ``vtkColorTransferFunction``/``vtkPiecewiseFunction``.
 */

/** Modalità di composizione dei campioni lungo il raggio. */
export type VolumeBlendMode = 'composite' | 'mip';

/** Punto di colore: ``x`` è nell'unità dell'ancora del preset. */
export interface RgbPoint {
  x: number;
  r: number;
  g: number;
  b: number;
}

/** Punto di opacità: ``x`` è nell'unità dell'ancora del preset. */
export interface OpacityPoint {
  x: number;
  opacity: number;
}

/**
 * Parametri della gradient opacity: modula l'opacità in base al modulo del
 * gradiente locale dell'intensità. I valori sono espressi in intensità per
 * unità di distanza fisica (il gradiente di vtk.js è già normalizzato sulla
 * spaziatura), quindi per i CT sono HU/mm.
 */
export interface GradientOpacitySettings {
  enabled: boolean;
  minimumValue: number;
  maximumValue: number;
  minimumOpacity: number;
  maximumOpacity: number;
}

/** Preset di volume rendering selezionabile per modalità/sequenza. */
export interface VolumePreset {
  id: string;
  label: string;
  /** ``hu``: punti in unità Hounsfield; ``relative``: punti in 0..1 del range. */
  anchor: 'hu' | 'relative';
  /** Finestra HU assunta quando il dataset non è in HU (solo per il fallback). */
  huRange?: [number, number];
  color: RgbPoint[];
  opacity: OpacityPoint[];
  gradientOpacity: GradientOpacitySettings;
  /** Modalità di blend suggerita quando il preset viene selezionato. */
  blend?: VolumeBlendMode;
}

const GRADIENT_OFF: GradientOpacitySettings = {
  enabled: false,
  minimumValue: 0,
  maximumValue: 0,
  minimumOpacity: 0,
  maximumOpacity: 0,
};

/**
 * Preset disponibili. I CT usano ancore HU con un intervallo di fallback per i
 * dataset salvati senza rescale (proprietà fisiche assenti); MR e PET usano
 * ancore relative sulla finestra di visualizzazione robusta.
 */
export const VOLUME_PRESETS: readonly VolumePreset[] = [
  {
    id: 'ct-bone',
    label: 'CT · Osso',
    anchor: 'hu',
    huRange: [-1000, 3000],
    color: [
      { x: -1000, r: 0, g: 0, b: 0 },
      { x: -150, r: 0.11, g: 0.09, b: 0.07 },
      { x: 60, r: 0.55, g: 0.4, b: 0.3 },
      { x: 300, r: 0.84, g: 0.68, b: 0.53 },
      { x: 700, r: 0.96, g: 0.88, b: 0.77 },
      { x: 1500, r: 1, g: 1, b: 1 },
    ],
    opacity: [
      { x: -1000, opacity: 0 },
      { x: -150, opacity: 0 },
      { x: 60, opacity: 0.02 },
      { x: 200, opacity: 0.12 },
      { x: 400, opacity: 0.42 },
      { x: 700, opacity: 0.72 },
      { x: 1000, opacity: 0.86 },
      { x: 3000, opacity: 0.95 },
    ],
    gradientOpacity: {
      enabled: true,
      minimumValue: 10,
      maximumValue: 250,
      minimumOpacity: 0,
      maximumOpacity: 1,
    },
    blend: 'composite',
  },
  {
    id: 'ct-soft',
    label: 'CT · Tessuti molli',
    anchor: 'hu',
    huRange: [-250, 350],
    color: [
      { x: -1000, r: 0, g: 0, b: 0 },
      { x: -120, r: 0.14, g: 0.1, b: 0.08 },
      { x: 0, r: 0.42, g: 0.31, b: 0.26 },
      { x: 40, r: 0.76, g: 0.56, b: 0.46 },
      { x: 90, r: 0.9, g: 0.76, b: 0.66 },
      { x: 220, r: 0.96, g: 0.92, b: 0.88 },
    ],
    opacity: [
      { x: -1000, opacity: 0 },
      { x: -200, opacity: 0 },
      { x: -40, opacity: 0.02 },
      { x: 0, opacity: 0.08 },
      { x: 40, opacity: 0.32 },
      { x: 90, opacity: 0.56 },
      { x: 220, opacity: 0.78 },
      { x: 350, opacity: 0.86 },
    ],
    gradientOpacity: GRADIENT_OFF,
    blend: 'composite',
  },
  {
    id: 'ct-angio',
    label: 'CT · Angio (MIP)',
    anchor: 'hu',
    huRange: [0, 900],
    color: [
      { x: -1000, r: 0, g: 0, b: 0 },
      { x: 80, r: 0.2, g: 0.04, b: 0.04 },
      { x: 150, r: 0.68, g: 0.1, b: 0.1 },
      { x: 300, r: 0.94, g: 0.42, b: 0.32 },
      { x: 500, r: 1, g: 0.86, b: 0.72 },
      { x: 900, r: 1, g: 1, b: 1 },
    ],
    opacity: [
      { x: -1000, opacity: 0 },
      { x: 120, opacity: 0 },
      { x: 200, opacity: 0.12 },
      { x: 300, opacity: 0.38 },
      { x: 450, opacity: 0.72 },
      { x: 900, opacity: 0.92 },
    ],
    gradientOpacity: {
      enabled: true,
      minimumValue: 5,
      maximumValue: 160,
      minimumOpacity: 0,
      maximumOpacity: 1,
    },
    blend: 'mip',
  },
  {
    id: 'mr-t1',
    label: 'MR · T1',
    anchor: 'relative',
    color: [
      { x: 0, r: 0, g: 0, b: 0 },
      { x: 0.15, r: 0.18, g: 0.16, b: 0.15 },
      { x: 0.35, r: 0.45, g: 0.41, b: 0.36 },
      { x: 0.55, r: 0.72, g: 0.68, b: 0.63 },
      { x: 0.75, r: 0.92, g: 0.9, b: 0.87 },
      { x: 1, r: 1, g: 1, b: 1 },
    ],
    opacity: [
      { x: 0, opacity: 0 },
      { x: 0.08, opacity: 0 },
      { x: 0.18, opacity: 0.03 },
      { x: 0.35, opacity: 0.16 },
      { x: 0.55, opacity: 0.42 },
      { x: 0.75, opacity: 0.72 },
      { x: 1, opacity: 0.9 },
    ],
    gradientOpacity: GRADIENT_OFF,
    blend: 'composite',
  },
  {
    id: 'mr-t2',
    label: 'MR · T2',
    anchor: 'relative',
    color: [
      { x: 0, r: 0, g: 0, b: 0 },
      { x: 0.15, r: 0.13, g: 0.15, b: 0.2 },
      { x: 0.4, r: 0.34, g: 0.42, b: 0.52 },
      { x: 0.65, r: 0.58, g: 0.72, b: 0.82 },
      { x: 0.85, r: 0.84, g: 0.92, b: 0.98 },
      { x: 1, r: 1, g: 1, b: 1 },
    ],
    opacity: [
      { x: 0, opacity: 0 },
      { x: 0.1, opacity: 0 },
      { x: 0.25, opacity: 0.04 },
      { x: 0.45, opacity: 0.2 },
      { x: 0.65, opacity: 0.48 },
      { x: 0.85, opacity: 0.76 },
      { x: 1, opacity: 0.92 },
    ],
    gradientOpacity: GRADIENT_OFF,
    blend: 'composite',
  },
  {
    id: 'mr-pd',
    label: 'MR · Proton density',
    anchor: 'relative',
    color: [
      { x: 0, r: 0, g: 0, b: 0 },
      { x: 0.2, r: 0.2, g: 0.2, b: 0.2 },
      { x: 0.45, r: 0.5, g: 0.5, b: 0.5 },
      { x: 0.7, r: 0.8, g: 0.8, b: 0.8 },
      { x: 1, r: 1, g: 1, b: 1 },
    ],
    opacity: [
      { x: 0, opacity: 0 },
      { x: 0.12, opacity: 0 },
      { x: 0.3, opacity: 0.05 },
      { x: 0.5, opacity: 0.22 },
      { x: 0.7, opacity: 0.52 },
      { x: 1, opacity: 0.88 },
    ],
    gradientOpacity: GRADIENT_OFF,
    blend: 'composite',
  },
  {
    id: 'pet',
    label: 'PET · Hot iron',
    anchor: 'relative',
    color: [
      { x: 0, r: 0, g: 0, b: 0 },
      { x: 0.2, r: 0.15, g: 0, b: 0.04 },
      { x: 0.4, r: 0.55, g: 0.05, b: 0 },
      { x: 0.6, r: 0.9, g: 0.3, b: 0 },
      { x: 0.8, r: 1, g: 0.72, b: 0.1 },
      { x: 1, r: 1, g: 1, b: 0.9 },
    ],
    opacity: [
      { x: 0, opacity: 0 },
      { x: 0.15, opacity: 0 },
      { x: 0.3, opacity: 0.06 },
      { x: 0.5, opacity: 0.22 },
      { x: 0.7, opacity: 0.52 },
      { x: 0.85, opacity: 0.8 },
      { x: 1, opacity: 0.95 },
    ],
    gradientOpacity: GRADIENT_OFF,
    blend: 'mip',
  },
];

/** Preset generico usato quando la modalità non è nota o non mappata. */
const FALLBACK_PRESET_ID = 'mr-t1';

const PRESET_BY_ID = new Map(VOLUME_PRESETS.map((preset) => [preset.id, preset]));

function normalizeModality(modality: string | null | undefined): string {
  return (modality ?? '').trim().toUpperCase();
}

/** Preset applicabili a una modalità (per il selettore dell'interfaccia). */
export function presetsForModality(modality: string | null | undefined): readonly VolumePreset[] {
  const normalized = normalizeModality(modality);
  if (normalized === 'CT') {
    return VOLUME_PRESETS.filter((preset) => preset.id.startsWith('ct-'));
  }
  if (normalized === 'MR') {
    return VOLUME_PRESETS.filter((preset) => preset.id.startsWith('mr-'));
  }
  if (normalized === 'PT' || normalized === 'PET') {
    return VOLUME_PRESETS.filter((preset) => preset.id === 'pet');
  }
  return VOLUME_PRESETS;
}

/** Preset predefinito per una modalità. */
export function defaultPresetIdForModality(modality: string | null | undefined): string {
  const normalized = normalizeModality(modality);
  if (normalized === 'CT') return 'ct-bone';
  if (normalized === 'MR') return 'mr-t1';
  if (normalized === 'PT' || normalized === 'PET') return 'pet';
  return FALLBACK_PRESET_ID;
}

/** Preset per id, oppure ``undefined`` se sconosciuto. */
export function getPreset(id: string): VolumePreset | undefined {
  return PRESET_BY_ID.get(id);
}

/** Preset per id con fallback garantito (mai ``undefined``). */
export function resolvePreset(id: string | null | undefined): VolumePreset {
  return (id ? PRESET_BY_ID.get(id) : undefined) ?? PRESET_BY_ID.get(FALLBACK_PRESET_ID)!;
}

/**
 * Un dataset è considerato in HU se il range copre l'aria (valori molto
 * negativi) e supera lo zero: è la firma tipica dei CT con rescale applicato.
 */
export function looksLikeHounsfield(min: number, max: number): boolean {
  return min <= -150 && max >= 100;
}

export interface TransferFunctions {
  color: VtkColorTransferFunction;
  opacity: VtkPiecewiseFunction;
  gradientOpacity: GradientOpacitySettings;
}

/**
 * Costruisce le transfer function VTK da un preset.
 *
 * ``intensityRange`` è il range grezzo (min/max) di tutti i voxel; ``viewRange``
 * è il range robusto ai percentili usato per il rendering. I preset relativi
 * mappano su ``viewRange``, quelli HU usano valori assoluti quando il dataset è
 * effettivamente in HU, altrimenti riproiettano la finestra ``huRange`` su
 * ``intensityRange``.
 */
export function buildTransferFunctions(
  preset: VolumePreset,
  intensityRange: [number, number],
  viewRange: [number, number],
): TransferFunctions {
  const useAbsoluteHu = preset.anchor === 'hu' && looksLikeHounsfield(...intensityRange);

  const mapX = (x: number): number => {
    if (preset.anchor === 'relative') return viewRange[0] + x * (viewRange[1] - viewRange[0]);
    if (useAbsoluteHu) return x;
    const [low, high] = preset.huRange ?? [-1000, 3000];
    const t = (x - low) / (high - low || 1);
    return intensityRange[0] + t * (intensityRange[1] - intensityRange[0]);
  };

  const color = vtkColorTransferFunction.newInstance();
  let lastColorX = -Infinity;
  for (const point of preset.color) {
    const x = mapX(point.x);
    if (x <= lastColorX + 1e-6) continue;
    color.addRGBPoint(x, point.r, point.g, point.b);
    lastColorX = x;
  }
  if (lastColorX === -Infinity) {
    color.addRGBPoint(viewRange[0], 0, 0, 0);
    color.addRGBPoint(viewRange[1], 1, 1, 1);
  }

  const opacity = vtkPiecewiseFunction.newInstance();
  let lastOpacityX = -Infinity;
  for (const point of preset.opacity) {
    const x = mapX(point.x);
    if (x <= lastOpacityX + 1e-6) continue;
    opacity.addPoint(x, point.opacity);
    lastOpacityX = x;
  }
  if (lastOpacityX === -Infinity) {
    opacity.addPoint(viewRange[0], 0);
    opacity.addPoint(viewRange[1], 1);
  }

  return { color, opacity, gradientOpacity: preset.gradientOpacity };
}
