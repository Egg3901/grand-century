import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  projects: [
    {
      name: 'dev',
      testIgnore: [/e6-platform\.spec\.ts/],
      use: {
        baseURL: 'http://127.0.0.1:4173',
        headless: true,
      },
    },
    {
      name: 'prod-e6',
      testMatch: /e6-platform\.spec\.ts/,
      use: {
        baseURL: 'http://127.0.0.1:4174',
        headless: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Prefer an existing production build; build if dist is missing.
      command: 'test -f dist/index.html || npm run build; npx vite preview --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
