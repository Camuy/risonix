import {
  fetchSeriesInstances,
  fetchStudies,
  fetchStudy,
  type InstanceSummary,
  type SeriesSummary,
  type StudyDetail,
  type StudySummary,
} from './client';
import { API_BASE_URL } from './config';

/** Riferimenti a un'istanza di stack: image id e geometria della fetta. */
export interface StackEntry {
  imageId: string;
  position: number[] | null;
  orientation: number[] | null;
}

/** Una serie pronta al rendering, con gli image id ``wadouri`` in ordine di slice. */
export interface ImageStack {
  study: StudySummary;
  series: SeriesSummary;
  imageIds: string[];
  entries: StackEntry[];
  /** Chiave di gruppo per la sincronizzazione fra serie dello stesso studio. */
  frameOfReferenceUID: string;
}

/** Studio e serie selezionati nell'explorer. */
export interface SeriesSelection {
  study: StudySummary;
  series: SeriesSummary;
}

/**
 * Costruisce l'image id ``wadouri`` del file DICOM servito dall'API
 * (`GET /api/instances/{id}/file`, P2-02). È il ponte tra il catalogo
 * indicizzato e il loader di Cornerstone3D.
 */
export function imageIdForInstance(instanceId: number): string {
  return `wadouri:${API_BASE_URL}/api/instances/${instanceId}/file`;
}

/** Una serie è renderizzabile se ha immagini e una geometria 2D nota (P1-02). */
export function isRenderableSeries(series: SeriesSummary): boolean {
  return (
    series.instance_count > 0 &&
    series.rows !== null &&
    series.columns !== null &&
    series.modality !== 'SR'
  );
}

export function isImageInstance(instance: InstanceSummary): boolean {
  return instance.kind === 'image';
}

/** Catalogo completo: studi indicizzati con le rispettive serie (`P2-03`). */
export async function loadCatalog(signal?: AbortSignal): Promise<StudyDetail[]> {
  const studies = await fetchStudies(signal);
  return Promise.all(studies.map((study) => fetchStudy(study.id, signal)));
}

/** Istanze immagini di una serie con geometria, ordinate per indice di slice. */
export async function loadSeriesEntries(
  seriesId: number,
  signal?: AbortSignal,
): Promise<StackEntry[]> {
  const instances = await fetchSeriesInstances(seriesId, signal);
  return instances.filter(isImageInstance).map((item) => ({
    imageId: imageIdForInstance(item.id),
    position: item.position,
    orientation: item.orientation,
  }));
}

/** Prepara lo stack di rendering per lo studio e la serie selezionati. */
export async function loadSeriesStack(
  selection: SeriesSelection,
  signal?: AbortSignal,
): Promise<ImageStack> {
  const entries = await loadSeriesEntries(selection.series.id, signal);
  return {
    study: selection.study,
    series: selection.series,
    imageIds: entries.map((entry) => entry.imageId),
    entries,
    frameOfReferenceUID: `risonix.study.${selection.study.study_instance_uid}`,
  };
}
