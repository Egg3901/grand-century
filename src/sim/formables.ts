import type {
  FormableDefinition,
  FormableStatus,
  GameData,
  NationId,
  StateId,
  World,
} from '../shared/types';
import { refreshGreatPowerRanking } from './systems/diplomacy';

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function stateIdsForFormable(world: World, formable: FormableDefinition): StateId[] {
  return uniqueSorted(formable.coreStateIds.filter((stateId) => Boolean(world.states[stateId])));
}

function requiredCoreStates(totalCoreStates: number, requiredShare: number): number {
  if (totalCoreStates <= 0) return 0;
  const share = Math.max(0, Math.min(1, requiredShare));
  return Math.max(1, Math.ceil(totalCoreStates * share));
}

function controlledCoreStates(world: World, nationId: NationId, coreStates: StateId[]): number {
  const nation = world.nations[nationId];
  if (!nation) return 0;
  const sphere = new Set<number>(nation.sphereMembers);
  let controlled = 0;
  for (const stateId of coreStates) {
    const state = world.states[stateId];
    if (!state) continue;
    if (state.owner === nationId || sphere.has(state.owner)) controlled++;
  }
  return controlled;
}

export type CoreControlKind = 'owned' | 'sphered' | 'missing';

export interface FormableCoreBreakdown {
  stateId: StateId;
  owner: NationId;
  kind: CoreControlKind;
}

export function classifyFormableCores(
  world: World,
  nationId: NationId,
  coreStates: StateId[],
): FormableCoreBreakdown[] {
  const nation = world.nations[nationId];
  const sphere = new Set<number>(nation?.sphereMembers ?? []);
  return coreStates.map((stateId) => {
    const state = world.states[stateId];
    const owner = state?.owner ?? -1;
    let kind: CoreControlKind = 'missing';
    if (owner === nationId) kind = 'owned';
    else if (sphere.has(owner)) kind = 'sphered';
    return { stateId, owner, kind };
  });
}

function annexableCoreStates(world: World, nationId: NationId, coreStates: StateId[]): StateId[] {
  return coreStates.filter((stateId) => world.states[stateId]?.owner === nationId);
}

function unmetReason(status: FormableStatus): string {
  const unmet = status.requirements.find((requirement) => !requirement.met);
  return unmet?.detail ?? 'Requirements not met.';
}

/** Prestige granted when forming; NGF→GER does not double-dip the stepping-stone reward. */
export function formablePrestigeReward(nationTag: string, definition: FormableDefinition, data: GameData): number {
  let reward = definition.prestigeReward;
  if (definition.key === 'GERMANY' && nationTag === 'NGF') {
    const ngfReward = data.formables?.find((entry) => entry.key === 'NORTH_GERMAN_CONFEDERATION')?.prestigeReward ?? 30;
    reward = Math.max(0, reward - ngfReward);
  }
  return reward;
}

export function evaluateNationFormable(world: World, data: GameData, nationId: NationId, formable: FormableDefinition): FormableStatus {
  const nation = world.nations[nationId];
  const coreStates = stateIdsForFormable(world, formable);
  const totalCoreStates = coreStates.length;
  const controlled = controlledCoreStates(world, nationId, coreStates);
  const required = requiredCoreStates(totalCoreStates, formable.requiredCoreShare);
  const breakdown = classifyFormableCores(world, nationId, coreStates);
  const ownedCount = breakdown.filter((entry) => entry.kind === 'owned').length;
  const spheredCount = breakdown.filter((entry) => entry.kind === 'sphered').length;
  const spheredRemainTags = Array.from(new Set(
    breakdown
      .filter((entry) => entry.kind === 'sphered')
      .map((entry) => world.nations[entry.owner]?.tag)
      .filter((tag): tag is string => Boolean(tag)),
  )).sort((a, b) => a.localeCompare(b));
  const candidate = Boolean(nation && formable.candidateTags.includes(nation.tag));
  const independent = Boolean(nation && (!formable.requireIndependent || nation.spheredBy < 0));
  const power = Boolean(nation && (
    !formable.requireGreatPower
    || nation.gpRank > 0
  ));
  const coreControl = controlled >= required;
  const year = 1820 + Math.floor(world.day / 365);
  const eraMet = !formable.yearAtLeast || year >= formable.yearAtLeast;
  const prestigeReward = formablePrestigeReward(nation?.tag ?? '', formable, data);
  const requirements: FormableStatus['requirements'] = [
    {
      key: 'candidate',
      label: 'National candidate',
      met: candidate,
      detail: candidate
        ? `${nation?.name ?? 'Nation'} is an eligible unifier.`
        : `Only ${formable.candidateTags.join(', ')} can proclaim ${formable.resultName}.`,
    },
    {
      key: 'independent',
      label: 'Independent',
      met: independent,
      detail: independent
        ? 'Nation is fully independent.'
        : 'Nation must not be inside another sphere.',
    },
    {
      key: 'power',
      label: 'Great power',
      met: power,
      detail: power
        ? 'Power requirement satisfied.'
        : 'Nation must be ranked as a great power.',
    },
    {
      key: 'core_control',
      label: 'Control core states (owned or sphered)',
      met: coreControl,
      detail: `${controlled}/${totalCoreStates} controlled (${ownedCount} owned, ${spheredCount} sphered). Need ${required}. Sphered cores do not annex on proclaim.`,
    },
  ];
  if (formable.yearAtLeast) {
    requirements.push({
      key: 'era',
      label: 'The idea has matured',
      met: eraMet,
      detail: eraMet
        ? 'The national idea commands the age.'
        : `Nationalism must mature — possible from ${formable.yearAtLeast}.`,
    });
  }
  const ready = requirements.every((requirement) => requirement.met);
  const status: FormableStatus = {
    key: formable.key,
    name: formable.resultName,
    targetTag: formable.resultTag,
    ready,
    reason: ready ? `${formable.resultName} can be proclaimed.` : '',
    coreStateIds: coreStates.slice(),
    controlledCoreStates: controlled,
    totalCoreStates,
    requiredCoreStates: required,
    requirements,
    prestigeReward,
    coreBreakdown: breakdown.map((entry) => ({ ...entry })),
    ownedCoreCount: ownedCount,
    spheredCoreCount: spheredCount,
    spheredRemainTags,
  };
  if (!status.ready) status.reason = unmetReason(status);
  return status;
}

export function getFormableStatusesForNation(world: World, data: GameData, nationId: NationId): FormableStatus[] {
  const nation = world.nations[nationId];
  if (!nation || !data.formables || data.formables.length === 0) return [];
  return data.formables
    .filter((formable) => formable.resultTag !== nation.tag)
    .filter((formable) => formable.candidateTags.includes(nation.tag))
    .map((formable) => evaluateNationFormable(world, data, nationId, formable))
    .sort((a, b) => (a.ready === b.ready ? a.key.localeCompare(b.key) : (a.ready ? -1 : 1)));
}

function preferredCapitalProvince(world: World, nationId: NationId, stateIds: StateId[]): number {
  const currentCapital = world.nations[nationId]?.capital ?? -1;
  const currentProvince = world.provinces[currentCapital];
  if (currentProvince && currentProvince.owner === nationId) return currentCapital;
  for (const stateId of stateIds) {
    const state = world.states[stateId];
    if (!state) continue;
    const provinceId = state.provinceIds.find((candidate) => world.provinces[candidate]?.owner === nationId);
    if (provinceId !== undefined) return provinceId;
  }
  return currentCapital >= 0 ? currentCapital : 0;
}

export function formNation(world: World, data: GameData, nationId: NationId, formableKey: string): { ok: boolean; reason: string } {
  const nation = world.nations[nationId];
  if (!nation) return { ok: false, reason: 'Nation not found.' };
  const definition = data.formables?.find((formable) => formable.key === formableKey);
  if (!definition) return { ok: false, reason: 'Unknown formable nation.' };
  const status = evaluateNationFormable(world, data, nationId, definition);
  if (!status.ready) return { ok: false, reason: status.reason };

  const previousName = nation.name;
  const previousTag = nation.tag;
  const coreStates = status.coreStateIds.slice();
  // BALANCE: sphered cores may satisfy control, but only owned cores annex.
  const ownedCores = annexableCoreStates(world, nationId, coreStates);

  for (const stateId of ownedCores) {
    const state = world.states[stateId];
    if (!state) continue;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      province.owner = nationId;
      province.controller = nationId;
      province.occupationProgress = 0;
    }
  }

  nation.tag = definition.resultTag;
  nation.name = definition.resultName;
  nation.color = definition.resultColor;
  nation.prestige += formablePrestigeReward(previousTag, definition, data);
  nation.coreStateIds = uniqueSorted([...(nation.coreStateIds ?? []), ...coreStates]);

  if (definition.resultPrimaryCulture) {
    const culture = data.cultures.findIndex((candidate) => candidate.key === definition.resultPrimaryCulture);
    if (culture >= 0) {
      nation.primaryCulture = culture;
      nation.acceptedCultures = uniqueSorted([culture, ...nation.acceptedCultures]);
    }
  }
  nation.capital = preferredCapitalProvince(world, nationId, ownedCores.length > 0 ? ownedCores : coreStates);

  for (const candidate of world.nations) {
    candidate.sphereMembers = uniqueSorted(candidate.sphereMembers.filter((memberId) => memberId !== candidate.id));
    if (candidate.spheredBy === candidate.id) candidate.spheredBy = -1;
  }

  refreshGreatPowerRanking(world);
  return { ok: true, reason: `The ${definition.resultName} is proclaimed by ${previousName}.` };
}
