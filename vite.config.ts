import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { MUSIC_EMBED_FRAME_SOURCES } from './src/shared/music-embeds';

const headers = { 'Content-Security-Policy': `frame-src ${MUSIC_EMBED_FRAME_SOURCES}` };

export default defineConfig({
  base: './',
  plugins: [react()],
  // A worker may be opened long after startup. Prebundle its bindings so the first lookup does not reload the app.
  optimizeDeps: { include: ['rusty-chromaprint-wasm/dist/rusty_chromaprint_wasm_bg.js'] },
  // Keep fonts as bundled files so the desktop CSP can restrict them to the app origin.
  build: { assetsInlineLimit: 0 },
  server: {
    allowedHosts: ['.e2b.app'],
    headers,
  },
  preview: { allowedHosts: ['.e2b.app'], headers },
});
