import { API_BASE_URL } from './config';

/** Errore sollevato quando l'API risponde con uno stato non 2xx. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  if (!response.ok) {
    throw new ApiError(`Richiesta a ${path} fallita (HTTP ${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export interface StudySummary {
  id: number;
  study_instance_uid: string;
  patient_id: string | null;
  study_date: string | null;
  description: string | null;
  series_count: number;
}

export interface SeriesSummary {
  id: number;
  series_instance_uid: string;
  series_number: number | null;
  modality: string | null;
  description: string | null;
  instance_count: number;
  rows: number | null;
  columns: number | null;
  pixel_spacing: number[] | null;
  slice_spacing: number | null;
  irregular: boolean;
}

export interface StudyDetail extends StudySummary {
  series: SeriesSummary[];
}

export interface InstanceSummary {
  id: number;
  sop_instance_uid: string;
  kind: string | null;
  instance_number: number | null;
  slice_index: number | null;
  position: number[] | null;
  orientation: number[] | null;
}

/** Studi indicizzati, ordinati per data (endpoint `GET /api/studies`). */
export function fetchStudies(signal?: AbortSignal): Promise<StudySummary[]> {
  return getJson<StudySummary[]>('/api/studies', signal);
}

/** Dettaglio di uno studio con le sue serie (`GET /api/studies/{id}`). */
export function fetchStudy(studyId: number, signal?: AbortSignal): Promise<StudyDetail> {
  return getJson<StudyDetail>(`/api/studies/${studyId}`, signal);
}

/** Istanze di una serie, ordinate per indice di slice (`GET /api/series/{id}/instances`). */
export function fetchSeriesInstances(
  seriesId: number,
  signal?: AbortSignal,
): Promise<InstanceSummary[]> {
  return getJson<InstanceSummary[]>(`/api/series/${seriesId}/instances`, signal);
}
