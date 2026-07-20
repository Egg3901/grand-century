import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function generatedDataPublicPlugin() {
  const geojsonPath = path.resolve(__dirname, 'src/data/generated/provinces.geo.json');
  const worldSeedPath = path.resolve(__dirname, 'src/data/generated/worldSeed.json');
  return {
    name: 'generated-data-public-path',
    configureServer(server: { middlewares: { use: (pathName: string, handler: (req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => void) => void } }) {
      server.middlewares.use('/generated/provinces.geo.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync(geojsonPath, 'utf8'));
      });
      server.middlewares.use('/generated/worldSeed.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync(worldSeedPath, 'utf8'));
      });
    },
    generateBundle(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'generated/provinces.geo.json',
        source: fs.readFileSync(geojsonPath, 'utf8'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'generated/worldSeed.json',
        source: fs.readFileSync(worldSeedPath, 'utf8'),
      });
    },
  };
}

export default defineConfig({
  // Served at site root in dev; set VITE_BASE=/games/grand-century/ for the
  // Lakeside subpath deploy so asset + worker URLs resolve under the prefix.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), generatedDataPublicPlugin()],
  build: {
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
