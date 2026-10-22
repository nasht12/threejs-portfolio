import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Served from https://nasht12.github.io/threejs-portfolio/, so every URL is relative to that base.
export default defineConfig({
  base: '/threejs-portfolio/',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // the gallery, and the Web3 section: a landing page and one page per piece
    rollupOptions: {
      input: Object.fromEntries(
        ['index.html', 'web3/index.html', 'web3/twelve-seconds/index.html', 'web3/xray/index.html']
          .map(p => [p.replace(/\/?index\.html$/, '') || 'main', resolve(import.meta.dirname, p)]),
      ),
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
