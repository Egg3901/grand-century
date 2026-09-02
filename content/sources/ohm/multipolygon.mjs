function pointKey(point) {
  return `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
}

function samePoint(left, right) {
  return pointKey(left) === pointKey(right);
}

function memberLine(member) {
  if (member.type !== 'way' || !Array.isArray(member.geometry) || member.geometry.length < 2) return null;
  return member.geometry.map((point) => [Number(point.lon), Number(point.lat)]);
}

function appendWithoutDuplicate(target, source) {
  const start = samePoint(target[target.length - 1], source[0]) ? 1 : 0;
  target.push(...source.slice(start));
}

function prependWithoutDuplicate(target, source) {
  const end = samePoint(source[source.length - 1], target[0]) ? source.length - 1 : source.length;
  target.unshift(...source.slice(0, end));
}

/** Join relation member ways at shared OSM nodes and return closed rings plus leftovers. */
export function stitchMemberWays(members, role) {
  const segments = members
    .filter((member) => (role === 'outer' ? !member.role || member.role === 'outer' : member.role === role))
    .map(memberLine)
    .filter(Boolean);
  const rings = [];
  const openChains = [];

  while (segments.length > 0) {
    const chain = segments.shift();
    let changed = true;
    while (!samePoint(chain[0], chain[chain.length - 1]) && changed) {
      changed = false;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const chainStart = chain[0];
        const chainEnd = chain[chain.length - 1];
        if (samePoint(chainEnd, segment[0])) appendWithoutDuplicate(chain, segment);
        else if (samePoint(chainEnd, segment[segment.length - 1])) appendWithoutDuplicate(chain, segment.slice().reverse());
        else if (samePoint(segment[segment.length - 1], chainStart)) prependWithoutDuplicate(chain, segment);
        else if (samePoint(segment[0], chainStart)) prependWithoutDuplicate(chain, segment.slice().reverse());
        else continue;
        segments.splice(index, 1);
        changed = true;
        break;
      }
    }
    if (samePoint(chain[0], chain[chain.length - 1]) && chain.length >= 4) rings.push(chain);
    else openChains.push(chain);
  }
  return { rings, openChains };
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    if ((y1 > point[1]) === (y2 > point[1])) continue;
    const crossing = ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1;
    if (point[0] < crossing) inside = !inside;
  }
  return inside;
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(area / 2);
}

export function relationToGeoJsonFeature(relation) {
  if (relation?.type !== 'relation' || !Array.isArray(relation.members)) {
    throw new Error('[ohm] expected an Overpass relation with members');
  }
  const unsupported = relation.members.filter((member) => (
    member.type === 'relation' && !['subarea', 'label'].includes(member.role ?? '')
  ));
  if (unsupported.length > 0) {
    throw new Error(`[ohm] relation ${relation.id} has ${unsupported.length} nested boundary members`);
  }

  const outer = stitchMemberWays(relation.members, 'outer');
  const inner = stitchMemberWays(relation.members, 'inner');
  const outerRings = outer.rings.sort((a, b) => ringArea(b) - ringArea(a));
  const openChains = [...outer.openChains, ...inner.openChains];
  if (openChains.length > 0) {
    throw new Error(`[ohm] relation ${relation.id} has ${openChains.length} unclosed boundary chains`);
  }
  if (outerRings.length === 0) throw new Error(`[ohm] relation ${relation.id} has no closed outer rings`);

  const polygons = outerRings.map((ring) => [ring]);
  for (const hole of inner.rings) {
    const polygon = polygons.find(([outerRing]) => pointInRing(hole[0], outerRing));
    if (!polygon) throw new Error(`[ohm] relation ${relation.id} has an inner ring outside every outer ring`);
    polygon.push(hole);
  }

  const license = relation.tags?.license ?? 'CC0';
  const properties = {
    ohmRelationId: relation.id,
    name: relation.tags?.name ?? null,
    wikidata: relation.tags?.wikidata ?? null,
    startDate: relation.tags?.start_date ?? null,
    endDate: relation.tags?.end_date ?? null,
    license,
  };
  return polygons.length === 1
    ? { type: 'Feature', id: relation.id, properties, geometry: { type: 'Polygon', coordinates: polygons[0] } }
    : { type: 'Feature', id: relation.id, properties, geometry: { type: 'MultiPolygon', coordinates: polygons } };
}
