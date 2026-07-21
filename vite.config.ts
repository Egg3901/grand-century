import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = process.env.VITE_BASE ?? '/';

function generatedDataPublicPlugin() {
  const geojsonPath = path.resolve(__dirname, 'src/data/generated/provinces.geo.json');
  const bordersPath = path.resolve(__dirname, 'src/data/generated/nationalBorders.geo.json');
  const worldSeedPath = path.resolve(__dirname, 'src/data/generated/worldSeed.json');
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
      server.middlewares.use('/generated/worldSeed.json', serve(worldSeedPath, 'application/json'));
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
        fileName: 'generated/worldSeed.json',
        source: fs.readFileSync(worldSeedPath, 'utf8'),
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
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
