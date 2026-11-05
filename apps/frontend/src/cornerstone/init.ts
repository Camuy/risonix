import { cache, init as coreInit } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { init as toolsInit } from '@cornerstonejs/tools';

/** Limite di immagini mantenute in memoria: oltre questa soglia la cache
 *  espelle le voci meno recenti, così la memoria resta stabile su serie lunghe
 *  (P2-08). ``cache.setMaxCacheSize`` lavora in byte. */
const IMAGE_CACHE_MAX_BYTES = 768 * 1024 * 1024;

let initialization: Promise<void> | null = null;

/**
 * Inizializza Cornerstone3D una sola volta: core (rendering engine), strumenti
 * (tool group) e image loader DICOM (schemi ``wadouri``/``dicomweb``). Le
 * chiamate successive riusano la stessa promise, così React StrictMode e più
 * viewport non reinizializzano la libreria. La cache immagini è limitata
 * (P2-08) per mantenere la memoria stabile su serie lunghe.
 */
export function ensureCornerstone(): Promise<void> {
  if (!initialization) {
    initialization = (async () => {
      await coreInit();
      await toolsInit();
      await dicomImageLoader.init();
      cache.setMaxCacheSize(IMAGE_CACHE_MAX_BYTES);
    })().catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}
