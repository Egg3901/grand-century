import { readFile, writeFile, mkdir } from 'node:fs/promises';

const source = new URL('../src/data/generated/', import.meta.url);
const target = new URL('../apps/mobile/assets/game/', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, source), 'utf8'));

const [world, geometry] = await Promise.all([
  readJson('worldSeed.json'),
  readJson('provinces.geo.json'),
]);
const nations = new Map(world.nations.map((nation) => [nation.tag, nation]));
const provinces = new Map(world.provinces.map((province) => [province.id, province]));

for (const feature of geometry.features) {
  const province = provinces.get(feature.properties.id);
  if (!province) throw new Error(`Unknown province ${feature.properties.id}`);
  const nation = nations.get(province.ownerTag);
  if (!nation) throw new Error(`Unknown nation ${province.ownerTag}`);
  const color = `#${nation.color.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  feature.properties = {
    id: province.id,
    name: province.name,
    ownerTag: province.ownerTag,
    color,
  };
}

await mkdir(target, { recursive: true });
await writeFile(new URL('atlas.json', target), JSON.stringify(geometry));
await writeFile(new URL('worldSeed.json', target), JSON.stringify(world));
console.log(`Synced ${geometry.features.length} provinces for native mobile`);
