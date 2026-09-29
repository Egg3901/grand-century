import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bytes=await readFile(path.join(root,'src/data/generated/provinces.geo.json'));
const actual=createHash('sha256').update(bytes).digest('hex');
for(const quality of ['', '-high']) {
  const manifest=JSON.parse(await readFile(path.join(root,`src/graphics/terrain-provenance${quality}.json`),'utf8'));
  if(manifest.provinceGeometrySha256!==actual) throw new Error(`Terrain${quality} is stale. Rebuild its render/picking atlas from the candidate province geometry.`);
}
console.log(`Terrain and province geometry match: ${actual}`);
