export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y);
    if (crosses && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-30) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => (
    pointInRing(point, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(point, hole))
  ));
}

function geometryBounds(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function containsBounds([lon, lat], [minLon, minLat, maxLon, maxLat]) {
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function summarizeReference(feature) {
  const properties = feature.properties ?? {};
  return {
    name: properties.NAME ?? null,
    subjectTo: properties.SUBJECTO ?? null,
    partOf: properties.PARTOF ?? null,
    borderPrecision: properties.BORDERPRECISION ?? null,
  };
}

function expectedTagsFor(matches, entityTags) {
  const direct = new Set();
  const imperial = new Set();
  for (const feature of matches) {
    const properties = feature.properties ?? {};
    for (const tag of asTags(entityTags[properties.NAME])) direct.add(tag);
    for (const tag of asTags(entityTags[properties.SUBJECTO])) imperial.add(tag);
  }
  return direct.size > 0 ? [...direct].sort() : [...imperial].sort();
}

function asTags(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function auditHistoricalBasemap({ world, reference, config }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.asOf)) throw new Error(`Invalid audit date ${config.asOf}`);
  const indexedFeatures = reference.features
    .filter((feature) => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon')
    .map((feature) => ({ feature, bounds: geometryBounds(feature.geometry) }));
  const overrides = new Map(config.provinceOverrides.map((entry) => [entry.provinceId, entry]));
  const knownTags = new Set(world.nations.map((nation) => nation.tag));
  const rows = [];

  for (const province of world.provinces) {
    const point = [province.lon, province.lat];
    const matches = indexedFeatures
      .filter(({ bounds }) => containsBounds(point, bounds))
      .filter(({ feature }) => pointInGeometry(point, feature.geometry))
      .map(({ feature }) => feature);
    const override = overrides.get(province.id);
    if (override && override.provinceName !== province.name) {
      throw new Error(`Province ${province.id} renamed from ${override.provinceName} to ${province.name}`);
    }
    if (override && !knownTags.has(override.expectedOwnerTag)) {
      throw new Error(`Province ${province.name} expects missing tag ${override.expectedOwnerTag}`);
    }
    const expectedTags = override
      ? [override.expectedOwnerTag]
      : expectedTagsFor(matches, config.entityTags);
    const status = expectedTags.length === 0
      ? (matches.length === 0 ? 'uncovered' : 'unmapped-reference')
      : (expectedTags.includes(province.ownerTag) ? 'agreement' : 'mismatch');
    rows.push({
      provinceId: province.id,
      provinceName: province.name,
      currentOwnerTag: province.ownerTag,
      expectedOwnerTags: expectedTags,
      status,
      confidence: override?.confidence ?? null,
      reason: override?.reason ?? null,
      source: override?.source ?? null,
      references: matches.map(summarizeReference),
    });
  }

  const counts = Object.fromEntries(
    ['agreement', 'mismatch', 'unmapped-reference', 'uncovered']
      .map((status) => [status, rows.filter((row) => row.status === status).length]),
  );
  const mismatchPairs = new Map();
  for (const row of rows.filter((entry) => entry.status === 'mismatch')) {
    const key = `${row.currentOwnerTag}->${row.expectedOwnerTags.join('|')}`;
    const group = mismatchPairs.get(key) ?? {
      currentOwnerTag: row.currentOwnerTag,
      expectedOwnerTags: row.expectedOwnerTags,
      count: 0,
      provinceIds: [],
    };
    group.count += 1;
    group.provinceIds.push(row.provinceId);
    mismatchPairs.set(key, group);
  }

  const referenceNames = new Set(
    reference.features.map((feature) => feature.properties?.NAME).filter(Boolean),
  );
  const mappedReferenceNames = [...referenceNames].filter((name) => config.entityTags[name]);
  return {
    schemaVersion: 1,
    targetDate: config.asOf,
    reference: config.references[0],
    summary: {
      referenceFeatures: reference.features.length,
      referenceEntities: referenceNames.size,
      mappedReferenceEntities: mappedReferenceNames.length,
      currentPolities: world.nations.length,
      currentProvinces: world.provinces.length,
      ...counts,
    },
    mismatchGroups: [...mismatchPairs.values()].sort((a, b) => b.count - a.count),
    provinces: rows,
  };
}
