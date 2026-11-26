import { cache, init as coreInit } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { init as toolsInit } from '@cornerstonejs/tools';

import { ensureUsableWebGLContextHints } from './webglContext';

/** Limite di immagini mantenute in memoria: oltre questa soglia la cache
 *  espelle le voci meno recenti, così la memoria resta stabile su serie lunghe
 *  (P2-08). ``cache.setMaxCacheSize`` lavora in byte. */
const IMAGE_CACHE_MAX_BYTES = 768 * 1024 * 1024;

/**
 * Contesti WebGL offscreen del rendering engine (default Cornerstone: 7). Le
 * viewport sono disegnate in sotto-regioni dello stesso canvas offscreen: un
 * solo contesto basta per stack, MPR e griglie e evita di duplicare in GPU la
 * texture 3D del volume.
 */
const WEBGL_CONTEXT_COUNT = 1;

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
      ensureUsableWebGLContextHints();
      // `debug` è richiesto dal tipo di Cornerstone3D; i campi omessi vengono
      // fusi con i default interni da `init`.
      await coreInit({
        rendering: { webGlContextCount: WEBGL_CONTEXT_COUNT },
        debug: {},
      });
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
