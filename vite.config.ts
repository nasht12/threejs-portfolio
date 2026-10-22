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
    // two pages: the gallery, and the Web3 section (web3/index.html)
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), web3: resolve(import.meta.dirname, 'web3/index.html') } },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
