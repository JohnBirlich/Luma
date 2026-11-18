import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Keep fonts as bundled files so the desktop CSP can restrict them to the app origin.
  build: { assetsInlineLimit: 0 },
  server: { allowedHosts: ['.e2b.app'] },
});
