import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/native-graphics",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:1436",
    viewport: { width: 430, height: 932 },
    headless: true,
    launchOptions: {
      args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
    },
  },
  webServer: {
    command:
      "npx vite --config tests/native-graphics/vite.config.ts --host 127.0.0.1 --port 1436 --strictPort",
    url: "http://127.0.0.1:1436/tests/native-graphics/index.html",
    reuseExistingServer: process.env.NATIVE_GRAPHICS_REUSE_SERVER === "1",
  },
  outputDir: "artifacts/native-graphics",
});
