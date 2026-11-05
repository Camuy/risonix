/**
 * Eventi applicativi leggeri (nessuna dipendenza da Cornerstone3D) così i
 * moduli del guscio possono ascoltarli senza trascinare la libreria nel bundle
 * iniziale (P2-08).
 */

/** Emesso da un viewport al cambio di slice, per aggiornare i metadati correnti. */
export const SLICE_CHANGE_EVENT = 'risonix:slice-change';

export interface SliceChangeDetail {
  viewportId: string;
  index: number;
  total: number;
}
