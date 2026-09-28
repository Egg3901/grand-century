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
const adjacency = new Map(world.nations.map((nation) => [nation.tag, new Set()]));
for (const province of world.provinces) {
  for (const neighborId of province.neighbors) {
    const neighbor = provinces.get(neighborId);
    if (neighbor && neighbor.ownerTag !== province.ownerTag) {
      adjacency.get(province.ownerTag).add(neighbor.ownerTag);
    }
  }
}

const palette = [
  [166, 76, 64], [67, 101, 145], [190, 154, 69], [83, 133, 96],
  [123, 91, 143], [170, 112, 69], [71, 132, 139], [169, 95, 117],
  [111, 120, 67], [134, 100, 75], [92, 91, 151], [180, 137, 115],
];
const distance = (left, right) => Math.hypot(...left.map((channel, index) => channel - right[index]));
const mapColors = new Map();
for (const nation of [...world.nations].sort((left, right) =>
  adjacency.get(right.tag).size - adjacency.get(left.tag).size || left.tag.localeCompare(right.tag))) {
  const used = [...adjacency.get(nation.tag)].map((tag) => mapColors.get(tag)).filter(Boolean);
  const options = [nation.color, ...palette];
  const best = options.map((color) => ({ color,
    contrast: used.length ? Math.min(...used.map((other) => distance(color, other))) : 255,
    fidelity: distance(color, nation.color),
  })).sort((left, right) =>
    (right.contrast >= 85 ? 1 : 0) - (left.contrast >= 85 ? 1 : 0)
    || (left.contrast >= 85 && right.contrast >= 85
      ? left.fidelity - right.fidelity : right.contrast - left.contrast))[0];
  mapColors.set(nation.tag, best.color);
}
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
  const color = `#${mapColors.get(province.ownerTag).map((part) => part.toString(16).padStart(2, '0')).join('')}`;
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
