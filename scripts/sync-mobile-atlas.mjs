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
const segments = new Map();

function recordRing(ring, ownerTag) {
  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    const key = [start.join(','), end.join(',')].sort().join('|');
    const record = segments.get(key) ?? { coordinates: [start, end], owners: new Set(), count: 0 };
    record.owners.add(ownerTag);
    record.count += 1;
    segments.set(key, record);
  }
}

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
    terrain: province.terrain,
    color,
  };
  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates : [feature.geometry.coordinates];
  for (const polygon of polygons) for (const ring of polygon) recordRing(ring, province.ownerTag);
}

const borders = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { kind: 'coast' }, geometry: {
    type: 'MultiLineString', coordinates: [...segments.values()]
      .filter((segment) => segment.count === 1).map((segment) => segment.coordinates),
  } },
  { type: 'Feature', properties: { kind: 'country' }, geometry: {
    type: 'MultiLineString', coordinates: [...segments.values()]
      .filter((segment) => segment.owners.size > 1).map((segment) => segment.coordinates),
  } },
] };

const waves = { type: 'FeatureCollection', features: [] };
for (let latitude = -72; latitude <= 72; latitude += 7) {
  for (let longitude = -178; longitude <= 178; longitude += 9) {
    waves.features.push({ type: 'Feature', properties: { phase: Math.abs((longitude + latitude) % 2) }, geometry: {
      type: 'LineString', coordinates: [0, 1, 2, 3, 4].map((step) => [
        longitude + step * 1.25,
        latitude + Math.sin(step * Math.PI / 2) * 0.15,
      ]),
    } });
  }
}

await mkdir(target, { recursive: true });
await writeFile(new URL('atlas.json', target), JSON.stringify(geometry));
await writeFile(new URL('borders.json', target), JSON.stringify(borders));
await writeFile(new URL('waves.json', target), JSON.stringify(waves));
await writeFile(new URL('worldSeed.json', target), JSON.stringify(world));
console.log(`Synced ${geometry.features.length} provinces for native mobile`);
