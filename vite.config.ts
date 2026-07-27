import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = process.env.VITE_BASE ?? '/';

/**
 * Build stamp. Derived here rather than passed on the deploy command line —
 * the 1.0.0 build shipped with `release: 'dev'` in production for exactly that
 * reason (the auto-deploy invocation never set VITE_RELEASE, so every GlitchTip
 * event, had any arrived, would have been unattributable to a commit).
 * Version comes from package.json; the SHA is best-effort so a source tarball
 * without git history still builds.
 */
const APP_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
).version as string;

function gitSha(): string {
  if (process.env.VITE_COMMIT_SHA) return process.env.VITE_COMMIT_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    return 'nogit';
  }
}

const BUILD_SHA = gitSha();
const RELEASE = process.env.VITE_RELEASE ?? `${APP_VERSION}+${BUILD_SHA}`;

function generatedDataPublicPlugin() {
  const geojsonPath = path.resolve(__dirname, 'src/data/generated/provinces.geo.json');
  const bordersPath = path.resolve(__dirname, 'src/data/generated/nationalBorders.geo.json');
  // worldSeed.json is a bundled JS import (src/data/generated.ts) and is never
  // fetched at runtime, so it is NOT emitted as a public asset — that copy was
  // ~189 KB of dead weight shipped and precached for nothing.
  const riversPath = path.resolve(__dirname, 'src/data/generated/rivers.geo.json');
  const lakesPath = path.resolve(__dirname, 'src/data/generated/lakes.geo.json');
  return {
    name: 'generated-data-public-path',
    configureServer(server: { middlewares: { use: (pathName: string, handler: (req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => void) => void } }) {
      const serve = (filePath: string, contentType: string) => (_req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => {
        res.setHeader('Content-Type', contentType);
        res.end(fs.readFileSync(filePath, 'utf8'));
      };
      server.middlewares.use('/generated/provinces.geo.json', serve(geojsonPath, 'application/json'));
      server.middlewares.use('/generated/nationalBorders.geo.json', serve(bordersPath, 'application/json'));
      server.middlewares.use('/generated/rivers.geo.json', serve(riversPath, 'application/json'));
      server.middlewares.use('/generated/lakes.geo.json', serve(lakesPath, 'application/json'));
    },
    generateBundle(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'generated/provinces.geo.json',
        source: fs.readFileSync(geojsonPath, 'utf8'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'generated/nationalBorders.geo.json',
        source: fs.readFileSync(bordersPath, 'utf8'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'generated/rivers.geo.json',
        source: fs.readFileSync(riversPath, 'utf8'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'generated/lakes.geo.json',
        source: fs.readFileSync(lakesPath, 'utf8'),
      });
    },
  };
}

export default defineConfig({
  // Served at site root in dev; set VITE_BASE=/games/grand-century/ for the
  // Lakeside subpath deploy so asset + worker URLs resolve under the prefix.
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __APP_RELEASE__: JSON.stringify(RELEASE),
  },
  plugins: [
    react(),
    generatedDataPublicPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Grand Century',
        short_name: 'Grand Century',
        description: 'A Victoria-inspired grand strategy campaign — fully client-side.',
        theme_color: '#e8dcc0',
        background_color: '#e8dcc0',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        lang: 'en',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache the app shell + generated map/data for offline play.
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webp,woff2,json}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        // MapLibre + geojson can exceed the default 2 MiB precache file limit.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps) {
        // Keep MapLibre off the critical path — Suspense lazy-loads the map chunk.
        return deps.filter((dep) => !dep.includes('/map-') && !dep.includes('\\map-'));
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl') || id.includes('/src/map/GrandMap')) return 'map';
          return undefined;
        },
      },
    },
  },
});
