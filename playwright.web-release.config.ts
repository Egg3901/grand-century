import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'web-release.spec.ts',
  workers: 1,
  timeout: 180000,
  expect: { timeout: 60000 },
  use: {
    baseURL: 'http://127.0.0.1:1443/games/grand-century/',
    viewport: { width: 430, height: 932 },
    reducedMotion: 'reduce',
    headless: true,
    launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] },
    trace: 'retain-on-failure',
  },
  outputDir: 'artifacts/web-release',
  webServer: {
    command: 'VITE_BASE=/games/grand-century/ npm run preview -- --host 127.0.0.1 --port 1443 --strictPort',
    url: 'http://127.0.0.1:1443/games/grand-century/',
    reuseExistingServer: false,
  },
});
