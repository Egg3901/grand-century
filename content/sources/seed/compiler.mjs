import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simplifyGeometry } from '../geometry/compiler.mjs';

const NATIONAL_BORDER_GRID_DEGREES = 0.06;

function requireValue(condition, message) {
  if (!condition) throw new Error(`[seed] ${message}`);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if ((current[1] > point[1]) === (prior[1] > point[1])) continue;
    const crossing = ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0];
    if (point[0] < crossing) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function polygonsOf(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(area / 2);
}

function polygonBounds(polygon) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const point of polygon[0]) {
    bounds[0] = Math.min(bounds[0], point[0]);
    bounds[1] = Math.min(bounds[1], point[1]);
    bounds[2] = Math.max(bounds[2], point[0]);
    bounds[3] = Math.max(bounds[3], point[1]);
  }
  return bounds;
}

function containsBounds(bounds, point) {
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];
}

function boundsDistance(bounds, point) {
  const dx = point[0] < bounds[0] ? bounds[0] - point[0] : point[0] > bounds[2] ? point[0] - bounds[2] : 0;
  const dy = point[1] < bounds[1] ? bounds[1] - point[1] : point[1] > bounds[3] ? point[1] - bounds[3] : 0;
  return Math.hypot(dx, dy);
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function polygonDistance(point, polygon) {
  let best = Infinity;
  for (const ring of polygon) {
    for (let index = 1; index < ring.length; index += 1) {
      best = Math.min(best, pointSegmentDistance(point, ring[index - 1], ring[index]));
    }
  }
  return best;
}

function ownershipShapes(compiledBorders) {
  return compiledBorders.featureCollection.features.flatMap((feature) => (
    polygonsOf(feature.geometry).map((polygon) => ({
      polityKey: feature.properties.polityKey,
      polygon,
      bounds: polygonBounds(polygon),
      area: ringArea(polygon[0]),
    }))
  ));
}

function deterministicColor(key) {
  const bytes = createHash('sha256').update(key).digest();
  return [
    64 + (bytes[0] % 144),
    64 + (bytes[1] % 144),
    64 + (bytes[2] % 144),
  ];
}

function governmentFor(polity, year) {
  const name = polity.displayName.toLowerCase();
  if (polity.key === 'GERMANY' && year >= 1933) return 'presidential_dictatorship';
  if (name.includes('soviet') || name.includes('communist')) return 'proletarian_dictatorship';
  if (name.includes('republic') || name.includes('free city') || name.includes('confeder')) return 'democracy';
  if (year >= 1900 && (name.includes('kingdom') || name.includes('empire') || name.includes('monarchy'))) {
    return 'constitutional_monarchy';
  }
  if (year >= 1900) return 'democracy';
  return 'absolute_monarchy';
}

function borderLinesForFeature(feature, nationId) {
  const lines = polygonsOf(simplifyGeometry(feature.geometry, NATIONAL_BORDER_GRID_DEGREES)).flatMap((polygon) => polygon);
  return {
    type: 'Feature',
    properties: { id: nationId },
    geometry: { type: 'MultiLineString', coordinates: lines },
  };
}

export function compileScenarioSeed({
  baseSeed,
  roster,
  relationships,
  compiledBorders,
  manifest,
  provinceOverrides = { overrides: [] },
}) {
  requireValue(roster.asOf === manifest.id && compiledBorders.asOf === manifest.id, 'scenario source dates do not match');
  requireValue(
    provinceOverrides.asOf === undefined || provinceOverrides.asOf === manifest.id,
    'province override date does not match',
  );
  const polityByKey = new Map(roster.polities.map((polity) => [polity.key, polity]));
  const baseProvinceById = new Map(baseSeed.provinces.map((province) => [province.id, province]));
  const overrideByProvince = new Map();
  for (const override of provinceOverrides.overrides ?? []) {
    requireValue(baseProvinceById.has(override.provinceId), `override references unknown province ${override.provinceId}`);
    requireValue(!overrideByProvince.has(override.provinceId), `duplicate override for province ${override.provinceId}`);
    const polity = polityByKey.get(override.polityKey);
    requireValue(Boolean(polity), `override references unknown polity ${override.polityKey}`);
    requireValue(polity.status !== 'constituent', `override assigns province ${override.provinceId} to a constituent`);
    requireValue(Boolean(override.notes), `override for province ${override.provinceId} needs review notes`);
    overrideByProvince.set(override.provinceId, override);
  }
  const shapes = ownershipShapes(compiledBorders);
  const overlapLedger = [];
  const nearestLedger = [];
  const overrideLedger = [];
  const ownerByProvince = new Map();
  for (const province of baseSeed.provinces) {
    const explicit = overrideByProvince.get(province.id);
    if (explicit) {
      const polity = polityByKey.get(explicit.polityKey);
      ownerByProvince.set(province.id, explicit.polityKey);
      overrideLedger.push({
        provinceId: province.id,
        provinceName: province.name,
        polityKey: explicit.polityKey,
        basis: explicit.basis,
        notes: explicit.notes,
        reviewedBy: provinceOverrides.reviewedBy,
        reviewedAt: provinceOverrides.reviewedAt,
        sources: polity.sources ?? [],
      });
      continue;
    }
    const point = [province.lon, province.lat];
    const matches = shapes
      .filter((shape) => containsBounds(shape.bounds, point) && pointInPolygon(point, shape.polygon))
      .sort((left, right) => left.area - right.area || left.polityKey.localeCompare(right.polityKey, 'en'));
    const distinct = [...new Set(matches.map((match) => match.polityKey))];
    if (distinct.length > 1) overlapLedger.push({ provinceId: province.id, candidates: distinct, selected: distinct[0] });
    if (distinct.length > 0) {
      ownerByProvince.set(province.id, distinct[0]);
      continue;
    }
    const nearby = shapes
      .filter((shape) => boundsDistance(shape.bounds, point) <= 1.5)
      .map((shape) => ({ ...shape, distance: polygonDistance(point, shape.polygon) }))
      .sort((left, right) => left.distance - right.distance || left.area - right.area);
    const nearest = nearby[0];
    if (nearest && nearest.distance <= 1.5) {
      ownerByProvince.set(province.id, nearest.polityKey);
      nearestLedger.push({ provinceId: province.id, polityKey: nearest.polityKey, distanceDegrees: nearest.distance });
    } else {
      ownerByProvince.set(province.id, 'UNC');
    }
  }

  const ownedProvinceIds = new Map();
  for (const [provinceId, owner] of ownerByProvince) {
    const list = ownedProvinceIds.get(owner) ?? [];
    list.push(provinceId);
    ownedProvinceIds.set(owner, list);
  }
  const representedKeys = [...ownedProvinceIds.keys()].filter((key) => key !== 'UNC').sort((a, b) => a.localeCompare(b, 'en'));
  const nationIdByKey = new Map(representedKeys.map((key, index) => [key, index]));
  if (ownedProvinceIds.has('UNC')) nationIdByKey.set('UNC', nationIdByKey.size);

  const baseNationByTag = new Map(baseSeed.nations.map((nation) => [nation.tag, nation]));
  const stateGroups = new Map();
  for (const province of baseSeed.provinces) {
    const ownerTag = ownerByProvince.get(province.id);
    const groupKey = `${province.stateId}:${ownerTag}`;
    const group = stateGroups.get(groupKey) ?? {
      baseStateId: province.stateId,
      baseName: province.stateName,
      ownerTag,
      provinceIds: [],
    };
    group.provinceIds.push(province.id);
    stateGroups.set(groupKey, group);
  }
  const groups = [...stateGroups.values()].sort((left, right) => (
    left.baseStateId - right.baseStateId || left.ownerTag.localeCompare(right.ownerTag, 'en')
  ));
  const stateIdByGroup = new Map(groups.map((group, index) => [`${group.baseStateId}:${group.ownerTag}`, index]));
  const splitCounts = new Map();
  for (const group of groups) splitCounts.set(group.baseStateId, (splitCounts.get(group.baseStateId) ?? 0) + 1);
  const states = groups.map((group, id) => ({
    id,
    name: splitCounts.get(group.baseStateId) > 1 ? `${group.baseName} (${group.ownerTag})` : group.baseName,
    ownerTag: group.ownerTag,
    provinceIds: group.provinceIds,
  }));
  const stateById = new Map(states.map((state) => [state.id, state]));
  const populationScale = manifest.startDate.year <= 1700 ? 0.55 : manifest.startDate.year >= 1936 ? 1.8 : 1;
  const provinces = baseSeed.provinces.map((province) => {
    const ownerTag = ownerByProvince.get(province.id);
    const stateId = stateIdByGroup.get(`${province.stateId}:${ownerTag}`);
    return {
      ...province,
      ownerTag,
      stateId,
      stateName: stateById.get(stateId).name,
      populationWeight: province.populationWeight * populationScale,
    };
  });

  const relationshipByDependent = new Map((relationships.relationships ?? []).map((entry) => [entry.to, entry.from]));
  const unrepresentedOverlordLinks = [];
  const nations = [...nationIdByKey.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([key]) => {
      const provinceIds = ownedProvinceIds.get(key);
      const capitalProvinceId = provinceIds[0];
      const baseProvince = baseProvinceById.get(capitalProvinceId);
      const baseNation = baseNationByTag.get(baseProvince?.ownerTag);
      const coreStateIds = [...new Set(provinceIds.map((provinceId) => provinces[provinceId].stateId))].sort((a, b) => a - b);
      if (key === 'UNC') {
        return {
          tag: 'UNC', name: 'Unassigned Historical Coverage', color: [112, 112, 112],
          government: 'uncivilized', capitalProvinceId, primaryCulture: baseNation?.primaryCulture ?? 'unknown',
          coreStateIds, polityStatus: 'decentralized', initialTechYear: manifest.startDate.year - 50,
          eraSummary: 'Province centroids outside every reviewed exclusive border polygon.',
        };
      }
      const polity = polityByKey.get(key);
      const overlord = relationshipByDependent.get(polity.key);
      if (overlord && !nationIdByKey.has(overlord)) {
        unrepresentedOverlordLinks.push({ polityKey: polity.key, overlordKey: overlord });
      }
      return {
        tag: polity.key,
        name: polity.displayName,
        color: deterministicColor(polity.key),
        government: governmentFor(polity, manifest.startDate.year),
        capitalProvinceId,
        primaryCulture: baseNation?.primaryCulture ?? 'unknown',
        religion: baseNation?.religion,
        coreStateIds,
        polityStatus: polity.status,
        overlordTag: overlord && nationIdByKey.has(overlord) ? overlord : undefined,
        eraSummary: polity.notes,
        initialTechYear: polity.status === 'decentralized'
          ? manifest.startDate.year - 30
          : polity.status === 'sovereign'
            ? manifest.startDate.year
            : manifest.startDate.year - 10,
      };
    });

  const borderFeatures = compiledBorders.featureCollection.features
    .filter((feature) => nationIdByKey.has(feature.properties.polityKey))
    .map((feature) => borderLinesForFeature(feature, nationIdByKey.get(feature.properties.polityKey)));
  const gapProvinceIds = ownedProvinceIds.get('UNC') ?? [];
  return {
    worldSeed: {
      source: `Grand Century ${manifest.id} reviewed border projection`,
      generatedAt: '2026-09-02',
      provinceCount: provinces.length,
      provinces,
      states,
      nations,
      formables: [],
    },
    nationalBorders: { type: 'FeatureCollection', features: borderFeatures },
    diagnostics: {
      schemaVersion: 1,
      asOf: manifest.id,
      nationalBorderGridDegrees: NATIONAL_BORDER_GRID_DEGREES,
      provinceCount: provinces.length,
      assignedProvinces: provinces.length - gapProvinceIds.length,
      gapProvinceIds,
      overlaps: overlapLedger,
      nearestAssignments: nearestLedger,
      explicitProvinceAssignments: overrideLedger,
      representedRosterPolities: representedKeys.length,
      rosterPolitiesWithoutProvinceCentroids: roster.polities
        .map((polity) => polity.key)
        .filter((key) => !nationIdByKey.has(key)),
      territorialRosterPolitiesWithoutProvinceCentroids: roster.polities
        .filter((polity) => polity.status !== 'constituent')
        .map((polity) => polity.key)
        .filter((key) => !nationIdByKey.has(key)),
      unrepresentedOverlordLinks,
      splitStates: [...splitCounts.values()].filter((count) => count > 1).length,
    },
  };
}

export async function writeScenarioSeed(outputDir, result) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'worldSeed.json'), `${JSON.stringify(result.worldSeed, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'nationalBorders.geo.json'), `${JSON.stringify(result.nationalBorders)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'seed-diagnostics.json'), `${JSON.stringify(result.diagnostics, null, 2)}\n`, 'utf8');
}
