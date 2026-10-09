import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/threejs-portfolio/`,
    viewport: { width: 1440, height: 900 },
    // System Chrome with SwiftShader: real WebGL on the CPU, so tests run the same on a laptop and a CI box with no GPU.
    channel: 'chrome',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/threejs-portfolio/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
