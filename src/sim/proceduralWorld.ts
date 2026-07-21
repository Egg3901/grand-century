/**
 * Procedural campaign map generation.
 *
 * Keeps the baked province graph (terrain, neighbors, RGOs, names) and
 * reassigns contiguous ownership. Real-country mode reuses the historical
 * nation library; random-country mode invents tags/names/colors.
 */

import type { GovernmentType } from '../shared/types';
import type { SeedNation, SeedProvince, SeedState, WorldSeedData } from '../data/generated';
import type { CampaignMapMode } from '../shared/campaignMap';
import { Rng } from './rng';

const PLACEHOLDER_TAGS = new Set(['COL', 'UNC', 'UNA']);

const GOVERNMENTS: GovernmentType[] = [
  'absolute_monarchy',
  'constitutional_monarchy',
  'hms_government',
  'democracy',
  'presidential_dictatorship',
  'uncivilized',
];

const CULTURES = [
  'british', 'french', 'north_german', 'south_german', 'russian', 'yankee', 'han', 'turkish',
  'iberian', 'italian', 'scandinavian', 'persian', 'arabic', 'african', 'japanese', 'korean',
  'indochinese', 'south_asian', 'latin_american', 'central_asian', 'polish', 'czech',
  'hungarian', 'south_slavic', 'baltic', 'finnish', 'ukrainian', 'caucasian', 'irish',
  'greek', 'malay', 'romanian',
];

const NAME_PREFIXES = [
  'Aurel', 'Bel', 'Cor', 'Dal', 'Eri', 'Fen', 'Gor', 'Hal', 'Isk', 'Jar',
  'Kal', 'Lor', 'Mar', 'Nor', 'Orl', 'Pel', 'Quen', 'Rav', 'Sol', 'Tor',
  'Ul', 'Var', 'Wen', 'Xor', 'Yar', 'Zel',
];

const NAME_SUFFIXES = [
  'ia', 'land', 'mark', 'stan', 'aria', 'ovia', 'ania', 'ium', 'or', 'en',
  'heim', 'burg', 'mere', 'wyn', 'thar', 'vos', 'gard', 'reach',
];

const NAME_FORMS = [
  'Kingdom of', 'Republic of', 'Empire of', 'Principality of', 'Confederation of',
  'Free State of', 'Dominion of', 'Union of',
];

function cloneSeed(base: WorldSeedData): WorldSeedData {
  return {
    source: base.source,
    generatedAt: base.generatedAt,
    provinceCount: base.provinceCount,
    provinces: base.provinces.map((province) => ({ ...province, neighbors: province.neighbors.slice() })),
    states: base.states.map((state) => ({ ...state, provinceIds: state.provinceIds.slice() })),
    nations: base.nations.map((nation) => ({
      ...nation,
      color: [...nation.color] as [number, number, number],
      coreStateIds: nation.coreStateIds?.slice(),
    })),
    formables: base.formables?.map((formable) => ({
      ...formable,
      resultColor: [...formable.resultColor] as [number, number, number],
      candidateTags: formable.candidateTags.slice(),
      coreStateIds: formable.coreStateIds.slice(),
    })),
  };
}

function fantasyName(rng: Rng): string {
  const stem = `${rng.pick(NAME_PREFIXES)}${rng.pick(NAME_SUFFIXES)}`;
  if (rng.chance(0.55)) return `${rng.pick(NAME_FORMS)} ${stem}`;
  return stem;
}

function fantasyTag(rng: Rng, used: Set<string>): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 200; attempt++) {
    let tag = '';
    for (let i = 0; i < 3; i++) tag += alphabet[rng.int(0, alphabet.length)];
    if (!used.has(tag) && !PLACEHOLDER_TAGS.has(tag)) {
      used.add(tag);
      return tag;
    }
  }
  let fallback = `X${used.size % 100}`;
  while (used.has(fallback) || fallback.length < 3) fallback = `X${rng.int(10, 99)}${rng.int(0, 9)}`;
  used.add(fallback);
  return fallback.slice(0, 3);
}

function fantasyColor(rng: Rng): [number, number, number] {
  return [
    70 + rng.int(0, 120),
    70 + rng.int(0, 120),
    70 + rng.int(0, 120),
  ];
}

function playableNations(base: WorldSeedData): SeedNation[] {
  return base.nations.filter((nation) => !PLACEHOLDER_TAGS.has(nation.tag));
}

function placeholderNations(base: WorldSeedData): SeedNation[] {
  return base.nations.filter((nation) => PLACEHOLDER_TAGS.has(nation.tag));
}

/** Multi-source BFS: assign each playable province to the nearest nation seed. */
function assignContiguousOwners(
  provinces: SeedProvince[],
  playableIds: number[],
  seedProvinceByNation: number[],
  rng: Rng,
): Map<number, number> {
  const neighborsById = new Map(provinces.map((province) => [province.id, province.neighbors]));
  const playable = new Set(playableIds);
  const ownerByProvince = new Map<number, number>();
  const queue: Array<{ provinceId: number; nationIndex: number; dist: number }> = [];

  seedProvinceByNation.forEach((provinceId, nationIndex) => {
    ownerByProvince.set(provinceId, nationIndex);
    queue.push({ provinceId, nationIndex, dist: 0 });
  });

  // Deterministic priority: process nearer first; tie-break with seeded noise.
  queue.sort((a, b) => a.dist - b.dist || a.nationIndex - b.nationIndex || a.provinceId - b.provinceId);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (ownerByProvince.get(current.provinceId) !== current.nationIndex) continue;
    const neighbors = neighborsById.get(current.provinceId) ?? [];
    for (const neighborId of neighbors) {
      if (!playable.has(neighborId) || ownerByProvince.has(neighborId)) continue;
      const jitter = rng.next() * 0.35;
      ownerByProvince.set(neighborId, current.nationIndex);
      queue.push({ provinceId: neighborId, nationIndex: current.nationIndex, dist: current.dist + 1 + jitter });
    }
    // Keep the frontier roughly ordered without a full heap.
    if (head % 32 === 0) {
      const rest = queue.slice(head).sort((a, b) => a.dist - b.dist || a.nationIndex - b.nationIndex);
      queue.length = head;
      queue.push(...rest);
    }
  }

  // Orphans (disconnected islands): attach to a random nation that already has land,
  // preferring any neighbor owner if present.
  for (const provinceId of playableIds) {
    if (ownerByProvince.has(provinceId)) continue;
    const neighborOwner = (neighborsById.get(provinceId) ?? [])
      .map((id) => ownerByProvince.get(id))
      .find((owner) => owner !== undefined);
    ownerByProvince.set(
      provinceId,
      neighborOwner ?? rng.int(0, Math.max(1, seedProvinceByNation.length)),
    );
  }

  return ownerByProvince;
}

function pickSeedProvinces(
  provinces: SeedProvince[],
  playableIds: number[],
  nationCount: number,
  rng: Rng,
): number[] {
  const byWeight = playableIds
    .map((id) => provinces[id])
    .filter(Boolean)
    .sort((a, b) => b.populationWeight - a.populationWeight || a.id - b.id);

  const chosen: number[] = [];
  const chosenSet = new Set<number>();
  const minSeparation = Math.max(2, Math.floor(Math.sqrt(playableIds.length / Math.max(1, nationCount))));

  const farEnough = (candidate: SeedProvince): boolean => {
    for (const id of chosen) {
      const other = provinces[id];
      if (!other) continue;
      const dlon = candidate.lon - other.lon;
      const dlat = candidate.lat - other.lat;
      if ((dlon * dlon + dlat * dlat) < (minSeparation * 0.35) ** 2) return false;
    }
    return true;
  };

  for (const province of byWeight) {
    if (chosen.length >= nationCount) break;
    if (rng.chance(0.35) && !farEnough(province)) continue;
    if (chosenSet.has(province.id)) continue;
    if (chosen.length > 0 && !farEnough(province) && rng.chance(0.7)) continue;
    chosen.push(province.id);
    chosenSet.add(province.id);
  }

  // Fill if separation rules were too strict.
  for (const province of byWeight) {
    if (chosen.length >= nationCount) break;
    if (chosenSet.has(province.id)) continue;
    chosen.push(province.id);
    chosenSet.add(province.id);
  }

  while (chosen.length < nationCount) {
    chosen.push(rng.pick(playableIds));
  }

  return chosen.slice(0, nationCount);
}

function buildRandomNations(count: number, rng: Rng): SeedNation[] {
  const used = new Set<string>();
  const nations: SeedNation[] = [];
  for (let i = 0; i < count; i++) {
    const government = rng.pick(GOVERNMENTS);
    nations.push({
      tag: fantasyTag(rng, used),
      name: fantasyName(rng),
      color: fantasyColor(rng),
      government,
      capitalProvinceId: 0,
      primaryCulture: rng.pick(CULTURES),
      greatPowerRank: i < 8 ? i + 1 : undefined,
    });
  }
  return nations;
}

function rebuildStates(
  baseStates: SeedState[],
  provinces: SeedProvince[],
): SeedState[] {
  const ownerByProvince = new Map(provinces.map((province) => [province.id, province.ownerTag]));
  return baseStates.map((state) => {
    const tags = state.provinceIds.map((id) => ownerByProvince.get(id)).filter(Boolean) as string[];
    const tally = new Map<string, number>();
    for (const tag of tags) tally.set(tag, (tally.get(tag) ?? 0) + 1);
    let ownerTag = state.ownerTag;
    let best = -1;
    for (const [tag, count] of tally) {
      if (count > best) {
        best = count;
        ownerTag = tag;
      }
    }
    return {
      id: state.id,
      name: state.name,
      ownerTag,
      provinceIds: state.provinceIds.slice(),
    };
  });
}

function finalizeNations(
  nations: SeedNation[],
  provinces: SeedProvince[],
  states: SeedState[],
): SeedNation[] {
  return nations.map((nation) => {
    const owned = provinces.filter((province) => province.ownerTag === nation.tag);
    const capital = owned.slice().sort((a, b) => b.populationWeight - a.populationWeight || a.id - b.id)[0];
    const coreStateIds = Array.from(new Set(
      states.filter((state) => state.ownerTag === nation.tag).map((state) => state.id),
    )).sort((a, b) => a - b);
    return {
      ...nation,
      capitalProvinceId: capital?.id ?? nation.capitalProvinceId,
      coreStateIds,
    };
  }).filter((nation) => PLACEHOLDER_TAGS.has(nation.tag) || provinces.some((p) => p.ownerTag === nation.tag));
}

/**
 * Build a procedural WorldSeedData from the historical baked seed.
 * Province geometry metadata is preserved; political ownership is regenerated.
 */
export function generateProceduralWorld(
  base: WorldSeedData,
  seed: number,
  mapMode: Exclude<CampaignMapMode, 'historical'>,
): WorldSeedData {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const out = cloneSeed(base);
  const placeholders = placeholderNations(base);
  const historicalPlayable = playableNations(base);

  const playableIds = out.provinces
    .filter((province) => !PLACEHOLDER_TAGS.has(province.ownerTag))
    .map((province) => province.id);

  // Preserve colonial / uncivilized / unclaimed land for the colonization loop.
  const nationCount = Math.max(
    12,
    Math.min(historicalPlayable.length, Math.round(14 + rng.next() * 28)),
  );

  const nations: SeedNation[] = mapMode === 'procedural_real'
    ? (() => {
      const shuffled = historicalPlayable.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = rng.int(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, nationCount).map((nation, index) => ({
        ...nation,
        color: [...nation.color] as [number, number, number],
        coreStateIds: undefined,
        greatPowerRank: index < 8 ? index + 1 : undefined,
      }));
    })()
    : buildRandomNations(nationCount, rng);

  const seedProvinces = pickSeedProvinces(out.provinces, playableIds, nations.length, rng);
  const ownerIndexByProvince = assignContiguousOwners(out.provinces, playableIds, seedProvinces, rng);

  for (const province of out.provinces) {
    if (PLACEHOLDER_TAGS.has(province.ownerTag)) continue;
    const nationIndex = ownerIndexByProvince.get(province.id);
    if (nationIndex === undefined) continue;
    const nation = nations[nationIndex];
    if (nation) province.ownerTag = nation.tag;
  }

  out.states = rebuildStates(out.states, out.provinces);
  const finalized = finalizeNations([...nations, ...placeholders.map((n) => ({ ...n, color: [...n.color] as [number, number, number] }))], out.provinces, out.states);

  // Rank great powers by land size for random/real procedural starts.
  const sized = finalized
    .filter((nation) => !PLACEHOLDER_TAGS.has(nation.tag))
    .map((nation) => ({
      tag: nation.tag,
      size: out.provinces.reduce((sum, province) => sum + (province.ownerTag === nation.tag ? province.populationWeight : 0), 0),
    }))
    .sort((a, b) => b.size - a.size || a.tag.localeCompare(b.tag));
  const gpRankByTag = new Map(sized.slice(0, 8).map((entry, index) => [entry.tag, index + 1]));

  out.nations = finalized.map((nation) => ({
    ...nation,
    greatPowerRank: gpRankByTag.get(nation.tag),
  }));
  out.formables = [];
  out.source = mapMode === 'procedural_real'
    ? `procedural_real:${base.source}`
    : `procedural_random:${base.source}`;
  out.generatedAt = new Date(0).toISOString();
  return out;
}

export function resolveWorldSeed(
  base: WorldSeedData,
  seed: number,
  mapMode: CampaignMapMode,
): WorldSeedData {
  if (mapMode === 'historical') return base;
  return generateProceduralWorld(base, seed, mapMode);
}
