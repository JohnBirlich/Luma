import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VK_WIDGET_URL } from './src/shared/vk';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [react()],
  // Keep fonts as bundled files so the desktop CSP can restrict them to the app origin.
  build: { assetsInlineLimit: 0 },
  server: {
    allowedHosts: ['.e2b.app'],
    headers: { 'Content-Security-Policy': `frame-src ${VK_WIDGET_URL}` },
  },
});
