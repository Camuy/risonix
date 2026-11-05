import { fetchVolumes, type VolumeSummary } from './client';

/**
 * Accesso ai volumi derivati esposti dall'API (P3-01). Il server è autorevole
 * sulla geometria: qui si recuperano i riferimenti per il download e per
 * comunicare i limiti dello spacing, mentre la creazione del volume lato
 * Cornerstone parte dagli stessi imageId dello stack (`cornerstone/volume`).
 */

/** Volumi derivati della serie. */
export function loadSeriesVolumes(
  seriesId: number,
  signal?: AbortSignal,
): Promise<VolumeSummary[]> {
  return fetchVolumes(seriesId, signal);
}

/** Volume principale della serie: NIfTI preferito, altrimenti il primo. */
export function selectPrimaryVolume(volumes: readonly VolumeSummary[]): VolumeSummary | null {
  if (volumes.length === 0) return null;
  return volumes.find((volume) => volume.volume_format === 'nifti') ?? volumes[0];
}
