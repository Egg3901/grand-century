import { defineConfig } from "@playwright/test";
export default defineConfig({
  expect: { timeout: 90000 },
  testDir: "./tests/e2e",
  testMatch: "graphics-terrain.spec.ts",
  workers: 1,
  // World v8 doubles software-GL startup on CI's GPU-less runners.
  timeout: 240000,
  use: {
    baseURL: "http://127.0.0.1:1435",
    viewport: { width: 1280, height: 850 },
    reducedMotion: "reduce",
    headless: true,
    launchOptions: {
      args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
    },
    trace: "retain-on-failure",
  },
  outputDir: "artifacts/graphics-tests",
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 1435 --strictPort",
    url: "http://127.0.0.1:1435",
    reuseExistingServer: false,
  },
});
