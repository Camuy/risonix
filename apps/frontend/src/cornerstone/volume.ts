import { addVolumesToViewports, cache, volumeLoader, type Types } from '@cornerstonejs/core';

import { ensureEngine } from './engine';
import { ensureCornerstone } from './init';

/**
 * Preparazione del volume lato client (P3-01). Il volume è costruito
 * **streaming** dagli stessi ``imageId`` già usati dallo stack, così la
 * geometria è per costruzione allineata al volume NIfTI/NRRD sul server
 * (stesso spacing, origine e orientamento). Nessun resampling MPR avviene qui:
 * la ricostruzione multiplanare è responsabilità del viewer (P3-02).
 */

const STREAMING_VOLUME_SCHEME = 'cornerstoneStreamingImageVolume';

/** Oltre questa soglia lo spacing è considerato anisotropo (30% di scarto). */
const ANISOTROPY_RATIO_THRESHOLD = 1.3;

export interface VolumeGeometry {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  /** Matrice 3×3 per colonne (row, column, normal) in coordinate paziente LPS. */
  direction: number[];
}

export interface SeriesVolume {
  volumeId: string;
  geometry: VolumeGeometry;
  /** Vero se gli spacing dei tre assi differiscono oltre la soglia. */
  anisotropic: boolean;
  /** Rapporto massimo/minimo fra gli spacing positivi (≥ 1). */
  spacingRatio: number;
}

/** Identificatore stabile e idempotente del volume di una serie. */
export function seriesVolumeId(seriesId: number): string {
  return `${STREAMING_VOLUME_SCHEME}:risonix-series-${seriesId}`;
}

function tuple3(values: readonly number[]): [number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

/** Estrae la geometria in coordinate paziente dal volume Cornerstone. */
export function geometryFromVolume(volume: Types.IImageVolume): VolumeGeometry {
  return {
    dimensions: tuple3(volume.dimensions),
    spacing: tuple3(volume.spacing),
    origin: tuple3(volume.origin),
    direction: Array.from(volume.direction),
  };
}

/**
 * Affinità voxel→paziente (LPS) del volume: le colonne sono i versori degli
 * assi scalati per lo spacing, l'ultima colonna è l'origine.
 */
export function affineFromGeometry(geometry: VolumeGeometry): number[][] {
  const [rx, ry, rz, cx, cy, cz, nx, ny, nz] = geometry.direction;
  const [sx, sy, sz] = geometry.spacing;
  const [ox, oy, oz] = geometry.origin;
  return [
    [rx * sx, cx * sy, nx * sz, ox],
    [ry * sx, cy * sy, ny * sz, oy],
    [rz * sx, cz * sy, nz * sz, oz],
    [0, 0, 0, 1],
  ];
}

/** Anisotropia dello spacing: rapporto fra il massimo e il minimo positivo. */
export function spacingAnisotropy(geometry: VolumeGeometry): {
  anisotropic: boolean;
  ratio: number;
} {
  const positive = geometry.spacing.filter((value) => value > 0);
  if (positive.length === 0) return { anisotropic: false, ratio: 1 };
  const ratio = Math.max(...positive) / Math.min(...positive);
  return { anisotropic: ratio > ANISOTROPY_RATIO_THRESHOLD, ratio };
}

/**
 * Crea (o recupera dalla cache) il volume streaming della serie. Idempotente:
 * chiamate concorrenti sulla stessa serie condividono lo stesso volume.
 */
export async function ensureSeriesVolume(
  seriesId: number,
  imageIds: readonly string[],
): Promise<SeriesVolume> {
  await ensureCornerstone();
  const volumeId = seriesVolumeId(seriesId);
  const cached = cache.getVolume(volumeId) as Types.IImageVolume | undefined;
  const volume =
    cached ?? (await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [...imageIds] }));
  const geometry = geometryFromVolume(volume);
  const { anisotropic, ratio } = spacingAnisotropy(geometry);
  return { volumeId, geometry, anisotropic, spacingRatio: ratio };
}

/**
 * Avvia il caricamento progressivo dei voxel del volume. Il loader streaming
 * risolve con l'oggetto volume dopo aver precaricato poche fette; ``load()``
 * scarica il resto in background, così il rendering volume (MPR, P3-02) parte
 * subito e si popola man mano.
 */
export function startSeriesVolumeLoad(volumeId: string): void {
  const volume = cache.getVolume(volumeId) as
    (Types.IImageVolume & { load?: () => void }) | undefined;
  volume?.load?.();
}

/** Volume già predisposto per la serie, se presente in cache. */
export function getSeriesVolume(seriesId: number): SeriesVolume | null {
  const volume = cache.getVolume(seriesVolumeId(seriesId)) as Types.IImageVolume | undefined;
  if (!volume) return null;
  const geometry = geometryFromVolume(volume);
  const { anisotropic, ratio } = spacingAnisotropy(geometry);
  return { volumeId: seriesVolumeId(seriesId), geometry, anisotropic, spacingRatio: ratio };
}

/**
 * Aggiunge il volume alle viewport indicate (P3-02): le viewport diventano
 * volume viewport centrate sul volume, senza toccare gli stack non elencati.
 */
export async function addVolumeToViewports(
  viewportIds: readonly string[],
  volumeId: string,
  immediateRender = true,
): Promise<void> {
  if (viewportIds.length === 0) return;
  const engine = await ensureEngine();
  await addVolumesToViewports(engine, [{ volumeId }], [...viewportIds], immediateRender);
}

/** Rilascia il volume della serie dalla cache (risorse GPU e pixel). */
export function removeSeriesVolume(seriesId: number): void {
  cache.removeVolumeLoadObject(seriesVolumeId(seriesId));
}
