import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const PAGES_ASSET_LIMIT = 25 * 1024 * 1024;
const FIELDS = ['height', 'surface', 'normals', 'province'] as const;
const MODULE_ID = '\0grand-century-high-terrain';

export function splitHighTerrain(packed: Record<string, unknown>) {
  const metadata = Object.fromEntries(
    Object.entries(packed).filter(([key]) => !FIELDS.includes(key as typeof FIELDS[number])),
  );
  const assets = FIELDS.map((field) => {
    const source = packed[field];
    if (typeof source !== 'string') throw new Error(`Missing terrain field: ${field}`);
    const bytes = Buffer.byteLength(source);
    if (bytes > PAGES_ASSET_LIMIT) throw new Error(`Terrain ${field} exceeds the Pages asset limit`);
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
    return { field, source, bytes, fileName: `terrain/terrain-atlas-high-${field}-${hash}.txt` };
  });
  return { metadata, assets };
}

export function highTerrainAssetsPlugin(root: string, base: string): Plugin {
  const packed = JSON.parse(fs.readFileSync(path.join(root, 'src/graphics/terrain-atlas-high.json'), 'utf8'));
  const { metadata, assets } = splitHighTerrain(packed);
  return {
    name: 'high-terrain-assets',
    enforce: 'pre',
    resolveId(id) {
      if (id.endsWith('/graphics/terrain-atlas-high.json')) return MODULE_ID;
    },
    load(id) {
      if (id !== MODULE_ID) return;
      const urls = assets.map(({ field, fileName }) => [field, base + fileName]);
      // Keep the existing dynamic import and unpacking contract. Each compressed
      // field is unchanged, but no single JS module exceeds Pages' upload limit.
      return `
        const fields = await Promise.all(${JSON.stringify(urls)}.map(async ([key, url]) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Terrain asset failed: ' + key);
          return [key, await response.text()];
        }));
        export default { ...${JSON.stringify(metadata)}, ...Object.fromEntries(fields) };
      `;
    },
    configureServer(server) {
      for (const asset of assets) {
        server.middlewares.use('/' + asset.fileName, (_req, res) => {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(asset.source);
        });
      }
    },
    generateBundle() {
      for (const { fileName, source } of assets) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
