/**
 * H6 — static content lint: structural integrity + national-content coverage.
 *
 * Reads EVENT_DEFS / DECISION_DEFS / GAME_DATA.formables / WORLD_SEED only.
 * Does not build worlds or advance the sim.
 *
 * Coverage baseline (measured 2026-07-27 — raise the floors as arcs land):
 *   nation-scoped decisions (tagIn):     2  (PRU, SAR)
 *   nation-scoped events (trigger.tags): 3  (AUS, PRU, SAR)
 *   formable candidates:                20
 *   zero of all three:                  28 nations
 */
import { describe, expect, it } from 'vitest';
import { DECISION_DEFS } from '../src/data/decisions';
import { EVENT_DEFS } from '../src/data/events';
import { GAME_DATA } from '../src/data/gameData';
import { WORLD_SEED } from '../src/data/generated';
import type { EventEffect, EventRequirement, EventTriggerDef } from '../src/shared/types';

const TAG_SHAPE = /^[A-Z]{2,4}$/;

const seedNations = WORLD_SEED.nations.map((n) => n.tag).sort();
const seedTagSet = new Set(seedNations);
const seedStateIds = new Set(WORLD_SEED.states.map((s) => s.id));
const formables = GAME_DATA.formables ?? [];
const formableKeySet = new Set(formables.map((f) => f.key));
const formableResultTags = new Set(formables.map((f) => f.resultTag));
/** Seed tags plus tags that appear once a formable succeeds (GER, ITA, NGF, …). */
const knownNationTags = new Set([...seedTagSet, ...formableResultTags]);
const decisionIdSet = new Set(DECISION_DEFS.map((d) => d.id));
const goodKeySet = new Set(GAME_DATA.goods.map((g) => g.key));
const reformKeySet = new Set(GAME_DATA.reforms.map((r) => r.key));

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes].sort();
}

/** Tags gated by EventRequirement (decisions + choice requirements). */
function tagsFromRequirements(reqs: EventRequirement[] | undefined): string[] {
  const out: string[] = [];
  for (const req of reqs ?? []) {
    if (req.t === 'tagIn') out.push(...req.tags);
  }
  return out;
}

/** Tags gated by EventTriggerDef (events only — different language from requirements). */
function tagsFromTrigger(trigger: EventTriggerDef): string[] {
  return [...(trigger.tags ?? []), ...(trigger.excludeTags ?? [])];
}

function decisionTakenRefs(reqs: EventRequirement[] | undefined): string[] {
  return (reqs ?? []).filter((r) => r.t === 'decisionTaken').map((r) => r.id);
}

function formableKeyRefs(reqs: EventRequirement[] | undefined): string[] {
  return (reqs ?? []).filter((r) => r.t === 'formableCoreShareAtLeast').map((r) => r.key);
}

function reformRefsFromRequirements(reqs: EventRequirement[] | undefined): string[] {
  const out: string[] = [];
  for (const req of reqs ?? []) {
    if (req.t === 'reformAtMost' || req.t === 'reformAtLeast') out.push(req.reform);
  }
  return out;
}

function walkEffects(
  effects: EventEffect[],
  visit: (effect: EventEffect) => void,
): void {
  for (const effect of effects) visit(effect);
}

describe('H6 content lint', () => {
  it('asserts structural integrity of events, decisions, and formables', () => {
    expect(seedNations.length).toBeGreaterThanOrEqual(80);

    // --- unique ids / keys ---
    expect(duplicates(EVENT_DEFS.map((e) => e.id))).toEqual([]);
    expect(duplicates(DECISION_DEFS.map((d) => d.id))).toEqual([]);
    expect(duplicates(formables.map((f) => f.key))).toEqual([]);

    // --- events: at least one choice; internal choice ids unique; mtth sane ---
    for (const event of EVENT_DEFS) {
      expect(event.choices.length, `event ${event.id} has no choices`).toBeGreaterThanOrEqual(1);
      expect(duplicates(event.choices.map((c) => c.id)), `event ${event.id} duplicate choice ids`).toEqual([]);
      expect(event.mtthMonths, `event ${event.id} mtthMonths`).toBeGreaterThan(0);
      if (event.trigger.yearAtLeast !== undefined && event.trigger.yearAtMost !== undefined) {
        expect(event.trigger.yearAtLeast).toBeLessThanOrEqual(event.trigger.yearAtMost);
      }
    }

    // --- decisionTaken refs resolve (requirements + event triggers) ---
    const danglingDecisionRefs: string[] = [];
    for (const decision of DECISION_DEFS) {
      for (const id of decisionTakenRefs(decision.prerequisites)) {
        if (!decisionIdSet.has(id)) danglingDecisionRefs.push(`decision:${decision.id}->${id}`);
      }
    }
    for (const event of EVENT_DEFS) {
      if (event.trigger.decisionTaken && !decisionIdSet.has(event.trigger.decisionTaken)) {
        danglingDecisionRefs.push(`event.trigger:${event.id}->${event.trigger.decisionTaken}`);
      }
      for (const choice of event.choices) {
        for (const id of decisionTakenRefs(choice.requirements)) {
          if (!decisionIdSet.has(id)) danglingDecisionRefs.push(`event.choice:${event.id}/${choice.id}->${id}`);
        }
      }
    }
    expect(danglingDecisionRefs).toEqual([]);

    // --- formableCoreShareAtLeast keys resolve ---
    const danglingFormableKeys: string[] = [];
    for (const decision of DECISION_DEFS) {
      for (const key of formableKeyRefs(decision.prerequisites)) {
        if (!formableKeySet.has(key)) danglingFormableKeys.push(`decision:${decision.id}->${key}`);
      }
    }
    for (const event of EVENT_DEFS) {
      for (const choice of event.choices) {
        for (const key of formableKeyRefs(choice.requirements)) {
          if (!formableKeySet.has(key)) danglingFormableKeys.push(`event:${event.id}/${choice.id}->${key}`);
        }
      }
    }
    expect(danglingFormableKeys).toEqual([]);

    // --- density guard: every formable coreStateId resolves in the seed ---
    const missingCoreStates: string[] = [];
    for (const formable of formables) {
      expect(formable.coreStateIds.length, `formable ${formable.key} empty cores`).toBeGreaterThan(0);
      expect(formable.candidateTags.length, `formable ${formable.key} empty candidates`).toBeGreaterThan(0);
      expect(formable.requiredCoreShare).toBeGreaterThan(0);
      expect(formable.requiredCoreShare).toBeLessThanOrEqual(1);
      for (const stateId of formable.coreStateIds) {
        if (!seedStateIds.has(stateId)) missingCoreStates.push(`${formable.key}:${stateId}`);
      }
    }
    expect(missingCoreStates, 'formable coreStateIds must resolve in WORLD_SEED.states').toEqual([]);

    // --- formable tags are plausible (shape + known seed/result tag) ---
    const implausibleFormableTags: string[] = [];
    for (const formable of formables) {
      for (const tag of [...formable.candidateTags, formable.resultTag]) {
        if (!TAG_SHAPE.test(tag) || !knownNationTags.has(tag)) {
          implausibleFormableTags.push(`${formable.key}:${tag}`);
        }
      }
      // Candidates should be formable *from* someone — seed tag or another formable result
      // (e.g. NGF → GERMANY). Result tags need only be plausible shape + catalogued.
      for (const tag of formable.candidateTags) {
        if (!seedTagSet.has(tag) && !formableResultTags.has(tag)) {
          implausibleFormableTags.push(`${formable.key}:candidate:${tag}`);
        }
      }
    }
    expect(implausibleFormableTags).toEqual([]);

    // --- nation tags in event/decision gating resolve (seed ∪ formable results) ---
    // EventTriggerDef.tags / excludeTags and EventRequirement.tagIn are the two
    // non-composable gating surfaces. Formable result tags (NGF, ITA, …) are
    // allowed: arcs continue after formation.
    const unknownGateTags: string[] = [];
    for (const decision of DECISION_DEFS) {
      for (const tag of tagsFromRequirements(decision.prerequisites)) {
        if (!knownNationTags.has(tag)) unknownGateTags.push(`decision:${decision.id}:${tag}`);
      }
    }
    for (const event of EVENT_DEFS) {
      for (const tag of tagsFromTrigger(event.trigger)) {
        if (!knownNationTags.has(tag)) unknownGateTags.push(`event.trigger:${event.id}:${tag}`);
      }
      for (const choice of event.choices) {
        for (const tag of tagsFromRequirements(choice.requirements)) {
          if (!knownNationTags.has(tag)) unknownGateTags.push(`event.choice:${event.id}/${choice.id}:${tag}`);
        }
      }
    }
    expect(unknownGateTags).toEqual([]);

    // --- cheap extras: goods / reforms / effect target tags / nationCores ---
    const badGoods: string[] = [];
    const badReforms: string[] = [];
    const badEffectTags: string[] = [];

    const checkEffects = (ctx: string, effects: EventEffect[]) => {
      walkEffects(effects, (effect) => {
        if (effect.t === 'modifyGoodPrice' || effect.t === 'modifyGoodStockpile') {
          if (!goodKeySet.has(effect.goodKey)) badGoods.push(`${ctx}:${effect.goodKey}`);
        }
        if (effect.t === 'boostRgo' && effect.goodKey && !goodKeySet.has(effect.goodKey)) {
          badGoods.push(`${ctx}:${effect.goodKey}`);
        }
        if (effect.t === 'reformLevel' && !reformKeySet.has(effect.reform)) {
          badReforms.push(`${ctx}:${effect.reform}`);
        }
        if (effect.t === 'grantCasusBelli' && !knownNationTags.has(effect.targetTag)) {
          badEffectTags.push(`${ctx}:cb:${effect.targetTag}`);
        }
        if (effect.t === 'opinionWithTags') {
          for (const tag of effect.tags) {
            if (!knownNationTags.has(tag)) badEffectTags.push(`${ctx}:opinion:${tag}`);
          }
        }
        if (effect.t === 'forceRivalry' && !knownNationTags.has(effect.tag)) {
          badEffectTags.push(`${ctx}:rival:${effect.tag}`);
        }
      });
    };

    for (const decision of DECISION_DEFS) {
      for (const reform of reformRefsFromRequirements(decision.prerequisites)) {
        if (!reformKeySet.has(reform)) badReforms.push(`decision.prereq:${decision.id}:${reform}`);
      }
      checkEffects(`decision:${decision.id}`, decision.effects);
    }
    for (const event of EVENT_DEFS) {
      for (const choice of event.choices) {
        for (const reform of reformRefsFromRequirements(choice.requirements)) {
          if (!reformKeySet.has(reform)) badReforms.push(`event.prereq:${event.id}/${choice.id}:${reform}`);
        }
        checkEffects(`event:${event.id}/${choice.id}`, choice.effects);
      }
    }
    expect(badGoods).toEqual([]);
    expect(badReforms).toEqual([]);
    expect(badEffectTags).toEqual([]);

    const missingNationCoreStates: string[] = [];
    for (const [tag, stateIds] of Object.entries(GAME_DATA.nationCores ?? {})) {
      expect(seedTagSet.has(tag), `nationCores tag ${tag}`).toBe(true);
      for (const stateId of stateIds) {
        if (!seedStateIds.has(stateId)) missingNationCoreStates.push(`${tag}:${stateId}`);
      }
    }
    expect(missingNationCoreStates).toEqual([]);
  });

  it('reports national content coverage (floor asserts; numbers printed)', () => {
    const withNationScopedDecision = new Set<string>();
    const withNationScopedEvent = new Set<string>();
    const withFormable = new Set<string>();

    for (const decision of DECISION_DEFS) {
      for (const tag of tagsFromRequirements(decision.prerequisites)) {
        if (seedTagSet.has(tag)) withNationScopedDecision.add(tag);
      }
    }
    for (const event of EVENT_DEFS) {
      for (const tag of event.trigger.tags ?? []) {
        if (seedTagSet.has(tag)) withNationScopedEvent.add(tag);
      }
    }
    for (const formable of formables) {
      for (const tag of formable.candidateTags) {
        if (seedTagSet.has(tag)) withFormable.add(tag);
      }
    }

    const withEraFlavor = new Set(WORLD_SEED.nations.filter((nation) => nation.eraSummary).map((nation) => nation.tag));
    const anyContent = new Set([
      ...withNationScopedDecision,
      ...withNationScopedEvent,
      ...withFormable,
      ...withEraFlavor,
    ]);
    const zeroContent = seedNations.filter((tag) => !anyContent.has(tag));

    const decisionCount = withNationScopedDecision.size;
    const eventCount = withNationScopedEvent.size;
    const formableCount = withFormable.size;
    const zeroCount = zeroContent.length;

    // Human-readable coverage dump — future milestones raise the floors below.
    // process.stderr bypasses vitest's default console intercept so the numbers
    // stay visible under `vitest run` without needing --reporter=verbose.
    process.stderr.write(
      [
        '',
        `=== H6 content coverage (${seedNations.length} seed nations) ===`,
        `events total:              ${EVENT_DEFS.length}  (nation-scoped: ${EVENT_DEFS.filter((e) => (e.trigger.tags ?? []).length > 0).length})`,
        `decisions total:           ${DECISION_DEFS.length}  (nation-scoped tagIn: ${DECISION_DEFS.filter((d) => d.prerequisites.some((p) => p.t === 'tagIn')).length})`,
        `formables total:           ${formables.length}`,
        `nations w/ scoped decision: ${decisionCount} / ${seedNations.length}  [${[...withNationScopedDecision].sort().join(', ')}]`,
        `nations w/ scoped event:    ${eventCount} / ${seedNations.length}  [${[...withNationScopedEvent].sort().join(', ')}]`,
        `nations w/ formable:        ${formableCount} / ${seedNations.length}  [${[...withFormable].sort().join(', ')}]`,
        `nations w/ 1820 era flavor:   ${withEraFlavor.size} / ${seedNations.length}`,
        `nations w/ zero content/flavor: ${zeroCount} / ${seedNations.length}`,
        `zero-content list: ${zeroContent.join(', ')}`,
        '============================================',
        '',
      ].join('\n') + '\n',
    );

    // Floors pass today; raise them when national arcs ship.
    // Baseline 2026-07-27: decisions 2, events 3, formables 20, zero 28.
    expect(decisionCount).toBeGreaterThanOrEqual(2);
    expect(eventCount).toBeGreaterThanOrEqual(3);
    expect(formableCount).toBeGreaterThanOrEqual(20);
    expect(zeroCount).toBeLessThanOrEqual(47); // 19 moonshot nations ship without scoped content yet
  });
});
