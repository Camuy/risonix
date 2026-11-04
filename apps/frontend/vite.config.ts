import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configurazione Vite per lo sviluppo in container.
// host 0.0.0.0 è necessario per l'accesso dall'host; usePolling evita che le
// modifiche non vengano rilevate sui bind mount di Docker Desktop su macOS.
export default defineConfig({
  plugins: [react()],
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
