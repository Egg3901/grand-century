import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'apps/mobile/assets/terrain');
await mkdir(target, { recursive: true });
for (const quality of ['balanced', 'high']) {
  const atlas = JSON.parse(await readFile(path.join(root, `src/graphics/terrain-atlas${quality === 'high' ? '-high' : ''}.json`), 'utf8'));
  const header = Buffer.alloc(16);
  header.write('GCT1'); header.writeUInt32LE(atlas.size, 4); header.writeUInt32LE(atlas.provinceSize, 8);
  const chunks = ['height', 'surface', 'normals', 'province'].map(key => inflateSync(Buffer.from(atlas[key], 'base64')));
  await writeFile(path.join(target, `${quality}.terrain`), Buffer.concat([header, ...chunks]));
  console.log(`Baked ${quality} terrain for native binary loading`);
}
