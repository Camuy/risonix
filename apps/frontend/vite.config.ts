import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configurazione Vite per lo sviluppo in container.
// host 0.0.0.0 è necessario per l'accesso dall'host; usePolling evita che le
// modifiche non vengano rilevate sui bind mount di Docker Desktop su macOS.
export default defineConfig({
  plugins: [react()],
  // `@kitware/vtk.js` (via `xmlbuilder2`) importa il builtin Node `events`.
  // Vite non fa polyfill automatici: lo mappiamo sul pacchetto `events`.
  resolve: {
    alias: {
      events: 'events/',
    },
  },
  // Cornerstone3D: il loader e i codec sono CJS/UMD (con export `default`
  // ambiguo e `require` di builtin). Li includiamo nel pre-bundling così
  // Rolldown ne crea l'interop ESM corretta; il worker di decodifica resta ES.
  optimizeDeps: {
    include: [
      '@cornerstonejs/core',
      '@cornerstonejs/tools',
      '@cornerstonejs/dicom-image-loader',
      '@cornerstonejs/dicom-image-loader/wadouri',
      'dicom-parser',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjxl/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    hmr: {
      clientPort: 5173,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
