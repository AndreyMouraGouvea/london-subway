import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O monorepo guarda as variáveis locais num único `.env.local` na raiz.
// Apenas as variáveis VITE_ são expostas ao bundle; a service_role e a
// app_key da TfL continuam fora do prefixo e nunca chegam ao browser.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// GitHub Pages serve o projeto num subpath (`/london-subway/`). Cloudflare
// Pages e o dev usam a raiz. O valor entra por `VITE_BASE_PATH`.
const basePath = process.env.VITE_BASE_PATH?.trim() || '/';

export default defineConfig({
  envDir: repoRoot,
  base: basePath,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
