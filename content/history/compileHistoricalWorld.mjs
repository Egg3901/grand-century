const VALID_POLITY_STATUSES = new Set([
  'sovereign',
  'constituent',
  'vassal',
  'colonial_administration',
  'tributary',
  'decentralized',
]);

const HISTORICAL_SOURCE = 'Grand Century checked-in 1820 historical overlay v1';

function clone(value) {
  return structuredClone(value);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`[history] ${message}`);
}

function validateEpoch(...documents) {
  for (const document of documents) {
    requireValue(document.asOf === '1820-01-01', `expected 1820-01-01, got ${document.asOf ?? 'no date'}`);
  }
}

function applyPolities(world, polityData, isRecompile) {
  const byTag = new Map(world.nations.map((nation) => [nation.tag, nation]));
  for (const definition of polityData.nations) {
    requireValue(/^[A-Z0-9]{3}$/.test(definition.tag), `invalid polity tag ${definition.tag}`);
    requireValue(VALID_POLITY_STATUSES.has(definition.polityStatus), `invalid status for ${definition.tag}`);
    const existing = byTag.get(definition.tag);
    const { mode, ...fields } = definition;
    requireValue(mode === 'merge' || mode === 'add', `${definition.tag} must declare mode add or merge`);
    if (mode === 'merge') {
      requireValue(existing, `cannot merge missing polity ${definition.tag}`);
      Object.assign(existing, fields);
      continue;
    }
    for (const field of ['name', 'color', 'government', 'primaryCulture', 'religion', 'capitalProvinceId', 'eraSummary']) {
      requireValue(definition[field] != null, `new polity ${definition.tag} is missing ${field}`);
    }
    if (existing) {
      requireValue(isRecompile, `cannot add existing polity ${definition.tag} to an uncompiled seed`);
      Object.assign(existing, fields);
      continue;
    }
    const nation = {
      ...fields,
      coreStateIds: [],
    };
    world.nations.push(nation);
    byTag.set(nation.tag, nation);
  }
  return byTag;
}

function applyOwnership(world, ownershipData, nationsByTag) {
  const provincesById = new Map(world.provinces.map((province) => [province.id, province]));
  for (const change of ownershipData.changes) {
    const province = provincesById.get(change.provinceId);
    requireValue(province, `unknown province id ${change.provinceId}`);
    requireValue(province.name === change.provinceName, `province ${change.provinceId} renamed from ${change.provinceName} to ${province.name}`);
    requireValue(
      province.ownerTag === change.fromOwnerTag || province.ownerTag === change.ownerTag,
      `${province.name} expected owner ${change.fromOwnerTag} or ${change.ownerTag}, got ${province.ownerTag}`,
    );
    requireValue(nationsByTag.has(change.ownerTag), `${province.name} uses unknown owner ${change.ownerTag}`);
    if (change.controllerTag) requireValue(nationsByTag.has(change.controllerTag), `${province.name} uses unknown controller ${change.controllerTag}`);
    province.ownerTag = change.ownerTag;
    if (change.controllerTag && change.controllerTag !== change.ownerTag) province.controllerTag = change.controllerTag;
    else delete province.controllerTag;
  }
}

function rebuildDerivedOwnership(world, nationsByTag) {
  const provincesByState = new Map();
  for (const province of world.provinces) {
    requireValue(nationsByTag.has(province.ownerTag), `${province.name} has unknown owner ${province.ownerTag}`);
    if (province.controllerTag) requireValue(nationsByTag.has(province.controllerTag), `${province.name} has unknown controller ${province.controllerTag}`);
    const list = provincesByState.get(province.stateId) ?? [];
    list.push(province);
    provincesByState.set(province.stateId, list);
  }
  for (const state of world.states) {
    const members = provincesByState.get(state.id) ?? [];
    requireValue(members.length > 0, `state ${state.id} has no provinces`);
    const owners = new Set(members.map((province) => province.ownerTag));
    requireValue(owners.size === 1, `state ${state.id} crosses owners: ${[...owners].join(', ')}`);
    state.ownerTag = members[0].ownerTag;
    state.provinceIds = members.map((province) => province.id).sort((a, b) => a - b);
  }

  const ownedStates = new Map();
  for (const state of world.states) {
    const list = ownedStates.get(state.ownerTag) ?? [];
    list.push(state.id);
    ownedStates.set(state.ownerTag, list);
  }
  for (const nation of world.nations) {
    const owned = ownedStates.get(nation.tag) ?? [];
    const cores = new Set([...(nation.coreStateIds ?? []), ...owned]);
    nation.coreStateIds = [...cores].sort((a, b) => a - b);
    requireValue(owned.length > 0, `polity ${nation.tag} owns no states`);
    const capital = world.provinces.find((province) => province.id === nation.capitalProvinceId);
    requireValue(capital?.ownerTag === nation.tag, `capital for ${nation.tag} is not owned by that polity`);
  }

  for (const nation of world.nations) {
    const seen = new Set([nation.tag]);
    let cursor = nation;
    while (cursor.overlordTag) {
      requireValue(nationsByTag.has(cursor.overlordTag), `${cursor.tag} has unknown overlord ${cursor.overlordTag}`);
      requireValue(!seen.has(cursor.overlordTag), `overlord cycle reaches ${cursor.overlordTag}`);
      seen.add(cursor.overlordTag);
      requireValue(seen.size <= 8, `overlord chain from ${nation.tag} is implausibly deep`);
      cursor = nationsByTag.get(cursor.overlordTag);
    }
  }
}

export function validateHistoricalAnchors(world, anchorData) {
  const nationsByTag = new Map(world.nations.map((nation) => [nation.tag, nation]));
  const provincesById = new Map(world.provinces.map((province) => [province.id, province]));
  for (const anchor of anchorData.anchors) {
    if (anchor.kind === 'province') {
      const province = provincesById.get(anchor.provinceId);
      requireValue(province?.name === anchor.provinceName, `${anchor.id}: province identity mismatch`);
      requireValue(province.ownerTag === anchor.ownerTag, `${anchor.id}: expected owner ${anchor.ownerTag}, got ${province.ownerTag}`);
      if (anchor.controllerTag) requireValue(province.controllerTag === anchor.controllerTag, `${anchor.id}: expected controller ${anchor.controllerTag}`);
      continue;
    }
    if (anchor.kind === 'relationship') {
      const nation = nationsByTag.get(anchor.tag);
      requireValue(nation, `${anchor.id}: missing polity ${anchor.tag}`);
      requireValue(nation.polityStatus === anchor.polityStatus, `${anchor.id}: expected status ${anchor.polityStatus}`);
      requireValue((nation.overlordTag ?? null) === (anchor.overlordTag ?? null), `${anchor.id}: unexpected overlord`);
      continue;
    }
    throw new Error(`[history] ${anchor.id}: unknown anchor kind ${anchor.kind}`);
  }
}

/**
 * Deep historical-data module. Callers supply the neutral seed and three
 * declarative 1820 documents; all mutation, validation and derived fields stay
 * behind this single interface.
 */
export function compileHistoricalWorld(baseWorld, polityData, ownershipData, anchorData) {
  validateEpoch(polityData, ownershipData, anchorData);
  const world = clone(baseWorld);
  const nationsByTag = applyPolities(world, polityData, world.source === HISTORICAL_SOURCE);
  applyOwnership(world, ownershipData, nationsByTag);
  rebuildDerivedOwnership(world, nationsByTag);
  validateHistoricalAnchors(world, anchorData);
  world.generatedAt = '1820-01-01T00:00:00.000Z';
  world.source = HISTORICAL_SOURCE;
  world.provinceCount = world.provinces.length;
  return world;
}
