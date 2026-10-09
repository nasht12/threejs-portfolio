import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Served from https://nasht12.github.io/threejs-portfolio/, so every URL is relative to that base.
export default defineConfig({
  base: '/threejs-portfolio/',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
