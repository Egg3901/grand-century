import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
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

const VIRTUAL_GENERATED_GEO = 'virtual:generated-geo';
const RESOLVED_VIRTUAL_GENERATED_GEO = `\0${VIRTUAL_GENERATED_GEO}`;

/**
 * Hard budgets for generated map GeoJSON. Workbox used to silently drop files
 * over maximumFileSizeToCacheInBytes from the precache; these assets now live
 * in a runtime cache, so we fail the build loudly instead when density grows.
 * Override via GENERATED_GEO_BUDGET_BYTES_<KEY> (e.g. PROVINCES) for probes.
 */
const GENERATED_GEO_BUDGETS_BYTES = {
  provinces: Number(process.env.GENERATED_GEO_BUDGET_BYTES_PROVINCES) || 5 * 1024 * 1024,
  nationalBorders: Number(process.env.GENERATED_GEO_BUDGET_BYTES_NATIONALBORDERS) || 3 * 1024 * 1024,
  rivers: Number(process.env.GENERATED_GEO_BUDGET_BYTES_RIVERS) || 1 * 1024 * 1024,
  lakes: Number(process.env.GENERATED_GEO_BUDGET_BYTES_LAKES) || 1 * 1024 * 1024,
} as const;

type GeneratedGeoKey = keyof typeof GENERATED_GEO_BUDGETS_BYTES;

type GeneratedGeoAsset = {
  key: GeneratedGeoKey;
  sourceName: string;
  absPath: string;
  bytes: number;
  hash: string;
  fileName: string;
};

function contentHash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

function loadGeneratedGeoAssets(): GeneratedGeoAsset[] {
  const dir = path.resolve(__dirname, 'src/data/generated');
  const specs: { key: GeneratedGeoKey; sourceName: string }[] = [
    { key: 'provinces', sourceName: 'provinces.geo.json' },
    { key: 'nationalBorders', sourceName: 'nationalBorders.geo.json' },
    { key: 'rivers', sourceName: 'rivers.geo.json' },
    { key: 'lakes', sourceName: 'lakes.geo.json' },
  ];
  return specs.map(({ key, sourceName }) => {
    const absPath = path.join(dir, sourceName);
    const buf = fs.readFileSync(absPath);
    const hash = contentHash(buf);
    const stem = sourceName.replace(/\.geo\.json$/, '');
    return {
      key,
      sourceName,
      absPath,
      bytes: buf.byteLength,
      hash,
      fileName: `generated/${stem}-${hash}.geo.json`,
    };
  });
}

function assertGeneratedGeoBudgets(assets: GeneratedGeoAsset[]): void {
  const violations = assets.filter((asset) => asset.bytes > GENERATED_GEO_BUDGETS_BYTES[asset.key]);
  if (violations.length === 0) return;
  const lines = violations.map((asset) => {
    const budget = GENERATED_GEO_BUDGETS_BYTES[asset.key];
    return `  - ${asset.sourceName}: ${asset.bytes.toLocaleString()} bytes exceeds budget ${budget.toLocaleString()} bytes`;
  });
  throw new Error(
    `[generated-geo] size budget exceeded — refuse to ship (Workbox no longer silently drops these):\n${lines.join('\n')}`,
  );
}

function generatedDataPublicPlugin(): Plugin {
  // worldSeed.json is a bundled JS import (src/data/generated.ts) and is never
  // fetched at runtime, so it is NOT emitted as a public asset — that copy was
  // ~189 KB of dead weight shipped and precached for nothing.
  const assets = loadGeneratedGeoAssets();
  assertGeneratedGeoBudgets(assets);

  const urlsModule = () => {
    const entries = assets
      .map((asset) => `  ${asset.key}: ${JSON.stringify(asset.fileName)},`)
      .join('\n');
    return `export const GENERATED_GEO_URLS = {\n${entries}\n};\n`;
  };

  return {
    name: 'generated-data-public-path',
    resolveId(id) {
      if (id === VIRTUAL_GENERATED_GEO) return RESOLVED_VIRTUAL_GENERATED_GEO;
      return undefined;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_GENERATED_GEO) return urlsModule();
      return undefined;
    },
    configureServer(server) {
      for (const asset of assets) {
        server.middlewares.use(`/${asset.fileName}`, (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(asset.absPath));
        });
      }
    },
    generateBundle() {
      for (const asset of assets) {
        this.emitFile({
          type: 'asset',
          fileName: asset.fileName,
          source: fs.readFileSync(asset.absPath),
        });
      }
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
        description: 'Reshape the long nineteenth century from 1830, fully client-side.',
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
        // App shell + MapLibre in precache. Generated geo stays out (too large /
        // density-sensitive) and is CacheFirst-warmed from GrandMap after fetch.
        // The sim worker is similarly runtime-cached so MapLibre can fit under
        // the 2 MiB precache budget without opaque module-import cache misses.
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webp,woff2}'],
        globIgnores: ['**/generated/**', '**/sim.worker-*.js'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        // Shell chunks stay under 2 MiB; geo is asserted separately above.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/generated\/[^/]+\.geo\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gc-generated-geo',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) => /\/assets\/sim\.worker-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gc-sim-worker',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps) {
        // Keep MapLibre + GrandMap off the critical path — Suspense lazy-loads them.
        return deps.filter(
          (dep) => !dep.includes('/map-') && !dep.includes('\\map-')
            && !dep.includes('/maplibre-') && !dep.includes('\\maplibre-'),
        );
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Split the former 1.3 MB map monolith: MapLibre is large and stable;
          // GrandMap changes with game UI and should hash independently.
          if (id.includes('maplibre-gl') || id.includes('node_modules/maplibre')) return 'maplibre';
          if (id.includes('/src/map/GrandMap')) return 'map';
          return undefined;
        },
      },
    },
  },
});
