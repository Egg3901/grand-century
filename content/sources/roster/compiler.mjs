import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REVIEW_DISPOSITIONS = new Set([
  'unreviewed',
  'polity',
  'dependent_polity',
  'constituent',
  'claim',
  'duplicate_geometry',
  'map_fragment',
  'exclude',
]);

const SOURCE_LANE_DISPOSITION = Object.freeze({
  sovereignty_check: 'polity',
  dependency_check: 'dependent_polity',
  constituent_check: 'constituent',
  claim_check: 'claim',
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`[roster] ${message}`);
}

function compareIdentity(a, b) {
  return a.identityKey.localeCompare(b.identityKey, 'en');
}

function groupDiscovery(discovery) {
  const grouped = new Map();
  for (const candidate of discovery.candidates ?? []) {
    const identityKey = candidate.identityKey;
    requireValue(Boolean(identityKey), 'discovery candidate is missing an identity key');
    const entry = grouped.get(identityKey) ?? {
      identityKey,
      displayName: candidate.name ?? identityKey,
      wikidata: candidate.wikidata ?? null,
      relationIds: [],
      temporalRanges: [],
      licenses: [],
      evidenceTags: [],
    };
    entry.relationIds.push(candidate.relationId);
    entry.temporalRanges.push({
      relationId: candidate.relationId,
      startDate: candidate.startDate ?? null,
      endDate: candidate.endDate ?? null,
    });
    entry.licenses.push({
      relationId: candidate.relationId,
      license: candidate.license,
      status: candidate.licenseStatus,
    });
    entry.evidenceTags.push({ relationId: candidate.relationId, tags: candidate.evidenceTags ?? {} });
    grouped.set(identityKey, entry);
  }
  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      relationIds: [...new Set(entry.relationIds)].sort((a, b) => a - b),
      temporalRanges: entry.temporalRanges.sort((a, b) => a.relationId - b.relationId),
      licenses: entry.licenses.sort((a, b) => a.relationId - b.relationId),
      evidenceTags: entry.evidenceTags.sort((a, b) => a.relationId - b.relationId),
    }))
    .sort(compareIdentity);
}

function normalizedName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizedPolityKey(value) {
  const key = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'POLITY';
}

function wikipediaPolityKey(entry) {
  for (const evidence of entry.evidenceTags ?? []) {
    const tags = evidence.tags ?? {};
    const explicitEnglishTitle = tags['wikipedia:en'];
    const [language, ...titleParts] = String(tags.wikipedia ?? '').split(':');
    const title = explicitEnglishTitle ?? (language === 'en' ? titleParts.join(':') : null);
    if (!title) continue;
    const key = normalizedPolityKey(String(title).replaceAll('_', ' '));
    if (key !== 'POLITY') return key;
  }
  return null;
}

function uniquePolityKey(entry, reserved) {
  const displayKey = normalizedPolityKey(entry.displayName ?? entry.identityKey);
  const base = displayKey === 'POLITY' || displayKey.length < 3
    ? wikipediaPolityKey(entry) ?? normalizedPolityKey(entry.wikidata ?? entry.identityKey)
    : displayKey;
  if (!reserved.has(base)) return base;
  const identitySuffix = normalizedPolityKey(entry.wikidata ?? entry.identityKey);
  const withIdentity = `${base}_${identitySuffix}`;
  if (!reserved.has(withIdentity)) return withIdentity;
  let ordinal = 2;
  while (reserved.has(`${withIdentity}_${ordinal}`)) ordinal += 1;
  return `${withIdentity}_${ordinal}`;
}

function appendUniqueSources(polity, sources) {
  const existing = new Set((polity.sources ?? []).map((source) => JSON.stringify(source)));
  polity.sources = polity.sources ?? [];
  for (const source of sources) {
    const serialized = JSON.stringify(source);
    if (existing.has(serialized)) continue;
    polity.sources.push(source);
    existing.add(serialized);
  }
}

function acceptEntries({ roster, review, sourceKind, reviewer, reviewedAt, allowDependency }) {
  const polityByName = new Map((roster.polities ?? []).map((polity) => [normalizedName(polity.displayName), polity]));
  const reserved = new Set((roster.polities ?? []).map((polity) => polity.key));
  const statusForDisposition = {
    polity: 'sovereign',
    dependent_polity: 'vassal',
    constituent: 'constituent',
  };
  let accepted = 0;

  for (const entry of review.entries ?? []) {
    if (entry.disposition !== 'unreviewed') continue;
    const disposition = SOURCE_LANE_DISPOSITION[entry.reviewLane];
    if (!disposition) continue;
    if (!allowDependency && disposition === 'dependent_polity') continue;

    entry.disposition = disposition;
    entry.reviewedBy = reviewer;
    entry.reviewedAt = reviewedAt;
    entry.notes = sourceKind === 'ohm'
      ? `Accepted from explicit OpenHistoricalMap ${entry.reviewLane} tags; geometry and identity remain separately audited.`
      : 'Accepted as a Cliopatria polity with no parent membership value; geometry and identity remain separately audited.';
    entry.polityKey = null;
    accepted += 1;

    if (!Object.hasOwn(statusForDisposition, disposition)) continue;
    const sourceRefs = sourceKind === 'ohm'
      ? entry.relationIds.map((id) => ({ kind: 'ohm_relation', id }))
      : entry.sourceRecords.map((id) => ({ kind: 'cliopatria_record', id, source: 'cliopatria-0.2.0' }));
    let polity = polityByName.get(normalizedName(entry.displayName));
    if (!polity) {
      const key = uniquePolityKey(entry, reserved);
      polity = {
        key,
        displayName: entry.displayName,
        status: statusForDisposition[disposition],
        flagAssetTag: key,
        notes: 'Source-pack classification with a neutral procedural flag treatment pending historical art review.',
        sources: [],
      };
      roster.polities.push(polity);
      polityByName.set(normalizedName(entry.displayName), polity);
      reserved.add(key);
    }
    appendUniqueSources(polity, sourceRefs);
    entry.polityKey = polity.key;
  }
  return accepted;
}

function retractAutomatedClassifications(roster, review, sourceKind, sourceIdsForEntry) {
  const polityByKey = new Map((roster.polities ?? []).map((polity) => [polity.key, polity]));
  const removalCandidates = new Set();
  let retracted = 0;
  for (const entry of review.entries ?? []) {
    if (entry.reviewedBy !== 'Codex source policy') continue;
    if (entry.polityKey) {
      const polity = polityByKey.get(entry.polityKey);
      if (polity) {
        const sourceIds = new Set(sourceIdsForEntry(entry));
        polity.sources = (polity.sources ?? []).filter((source) => (
          source.kind !== sourceKind || !sourceIds.has(source.id)
        ));
        if (polity.sources.length === 0
          && polity.notes === 'Source-pack classification with a neutral procedural flag treatment pending historical art review.') {
          removalCandidates.add(polity.key);
        }
      }
    }
    entry.disposition = 'unreviewed';
    entry.polityKey = null;
    entry.notes = null;
    entry.reviewedBy = null;
    entry.reviewedAt = null;
    retracted += 1;
  }
  roster.polities = (roster.polities ?? []).filter((polity) => !removalCandidates.has(polity.key));
  return retracted;
}

export function acceptSourceClassifications({ roster, ohmReview, complementReview, reviewer, reviewedAt }) {
  requireValue(Boolean(reviewer), 'source classification acceptance needs a reviewer');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt), 'source classification acceptance needs an ISO review date');
  const nextRoster = structuredClone(roster);
  const nextOhmReview = structuredClone(ohmReview);
  const nextComplementReview = structuredClone(complementReview);
  nextRoster.polities = nextRoster.polities ?? [];
  const ohmRetracted = retractAutomatedClassifications(
    nextRoster,
    nextOhmReview,
    'ohm_relation',
    (entry) => entry.relationIds ?? [],
  );
  const complementRetracted = retractAutomatedClassifications(
    nextRoster,
    nextComplementReview,
    'cliopatria_record',
    (entry) => entry.sourceRecords ?? [],
  );
  for (const polity of nextRoster.polities) {
    if (!polity.flagAssetTag) polity.flagAssetTag = polity.key;
  }
  const ohmAccepted = acceptEntries({
    roster: nextRoster,
    review: nextOhmReview,
    sourceKind: 'ohm',
    reviewer,
    reviewedAt,
    allowDependency: true,
  });
  const complementAccepted = 0;
  nextRoster.polities.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return {
    roster: nextRoster,
    ohmReview: nextOhmReview,
    complementReview: nextComplementReview,
    counts: { ohmAccepted, complementAccepted, ohmRetracted, complementRetracted },
  };
}

export function applyManualRosterDecisions({ roster, ohmReview, complementReview, decisionPack }) {
  requireValue(decisionPack.schemaVersion === 1, 'unsupported manual decision schema');
  requireValue(decisionPack.asOf === roster.asOf, 'manual decision date does not match roster');
  requireValue(Boolean(decisionPack.reviewer), 'manual decisions need a reviewer');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(decisionPack.reviewedAt), 'manual decisions need an ISO review date');
  const nextRoster = structuredClone(roster);
  const nextOhmReview = structuredClone(ohmReview);
  const nextComplementReview = structuredClone(complementReview);
  const reviews = {
    ohm: new Map(nextOhmReview.entries.map((entry) => [entry.identityKey, entry])),
    cliopatria: new Map(nextComplementReview.entries.map((entry) => [entry.identityKey, entry])),
  };
  const polityByKey = new Map(nextRoster.polities.map((polity) => [polity.key, polity]));
  const polityByName = new Map(nextRoster.polities.map((polity) => [normalizedName(polity.displayName), polity]));
  const reserved = new Set(polityByKey.keys());
  const seenDecisions = new Set();
  const statusForDisposition = {
    polity: 'sovereign',
    dependent_polity: 'vassal',
    constituent: 'constituent',
  };
  let applied = 0;

  for (const decision of decisionPack.decisions ?? []) {
    requireValue(['ohm', 'cliopatria'].includes(decision.source), `invalid decision source ${decision.source}`);
    const decisionKey = `${decision.source}:${decision.identityKey}`;
    requireValue(!seenDecisions.has(decisionKey), `duplicate manual decision ${decisionKey}`);
    seenDecisions.add(decisionKey);
    requireValue(REVIEW_DISPOSITIONS.has(decision.disposition) && decision.disposition !== 'unreviewed', `invalid manual disposition for ${decisionKey}`);
    requireValue(Boolean(decision.notes), `manual decision ${decisionKey} needs notes`);
    const entry = reviews[decision.source].get(decision.identityKey);
    requireValue(Boolean(entry), `manual decision ${decisionKey} has no review entry`);
    const wasAutomated = entry.reviewedBy === 'Codex source policy';
    const previousPolityKey = entry.polityKey;
    requireValue(
      entry.disposition === 'unreviewed' || entry.disposition === decision.disposition || wasAutomated,
      `manual decision ${decisionKey} conflicts with ${entry.disposition}`,
    );
    entry.disposition = decision.disposition;
    entry.notes = decision.notes;
    entry.reviewedBy = decisionPack.reviewer;
    entry.reviewedAt = decisionPack.reviewedAt;
    entry.polityKey = null;
    applied += 1;

    if (!Object.hasOwn(statusForDisposition, decision.disposition)) {
      if (wasAutomated && previousPolityKey) {
        const priorPolity = polityByKey.get(previousPolityKey);
        if (priorPolity) {
          const sourceIds = new Set(decision.source === 'ohm' ? entry.relationIds : entry.sourceRecords);
          const sourceKind = decision.source === 'ohm' ? 'ohm_relation' : 'cliopatria_record';
          priorPolity.sources = (priorPolity.sources ?? []).filter((source) => (
            source.kind !== sourceKind || !sourceIds.has(source.id)
          ));
          if (priorPolity.sources.length === 0
            && priorPolity.notes === 'Source-pack classification with a neutral procedural flag treatment pending historical art review.') {
            nextRoster.polities = nextRoster.polities.filter((polity) => polity.key !== priorPolity.key);
            polityByKey.delete(priorPolity.key);
            polityByName.delete(normalizedName(priorPolity.displayName));
          }
        }
      }
      continue;
    }
    if (wasAutomated && previousPolityKey && decision.mapTo && decision.mapTo !== previousPolityKey) {
      const priorPolity = polityByKey.get(previousPolityKey);
      if (priorPolity) {
        const sourceIds = new Set(decision.source === 'ohm' ? entry.relationIds : entry.sourceRecords);
        const sourceKind = decision.source === 'ohm' ? 'ohm_relation' : 'cliopatria_record';
        priorPolity.sources = (priorPolity.sources ?? []).filter((source) => (
          source.kind !== sourceKind || !sourceIds.has(source.id)
        ));
        if (priorPolity.sources.length === 0
          && priorPolity.notes === 'Source-pack classification with a neutral procedural flag treatment pending historical art review.') {
          nextRoster.polities = nextRoster.polities.filter((polity) => polity.key !== priorPolity.key);
          polityByKey.delete(priorPolity.key);
          polityByName.delete(normalizedName(priorPolity.displayName));
        }
      }
    }
    const displayName = decision.displayName ?? entry.displayName;
    let renamedAutomatedPolity = false;
    let polity = decision.mapTo
      ? polityByKey.get(decision.mapTo)
      : (wasAutomated && previousPolityKey
          ? polityByKey.get(previousPolityKey)
          : polityByName.get(normalizedName(displayName)));
    if (decision.mapTo) requireValue(Boolean(polity), `manual decision ${decisionKey} maps to unknown polity ${decision.mapTo}`);
    if (polity && wasAutomated && previousPolityKey && decision.polityKey
      && decision.polityKey !== previousPolityKey) {
      requireValue(/^[A-Z0-9_]+$/.test(decision.polityKey), `manual decision ${decisionKey} has invalid polity key ${decision.polityKey}`);
      requireValue(!reserved.has(decision.polityKey), `manual decision ${decisionKey} repeats polity key ${decision.polityKey}`);
      polityByKey.delete(previousPolityKey);
      reserved.delete(previousPolityKey);
      polity.key = decision.polityKey;
      polity.flagAssetTag = decision.flagAssetTag ?? decision.polityKey;
      polityByKey.set(polity.key, polity);
      reserved.add(polity.key);
      renamedAutomatedPolity = true;
      for (const review of [nextOhmReview, nextComplementReview]) {
        for (const reviewedEntry of review.entries) {
          if (reviewedEntry.polityKey === previousPolityKey) reviewedEntry.polityKey = polity.key;
        }
      }
    }
    if (!polity) {
      const key = decision.polityKey ?? uniquePolityKey({ ...entry, displayName }, reserved);
      requireValue(/^[A-Z0-9_]+$/.test(key), `manual decision ${decisionKey} has invalid polity key ${key}`);
      requireValue(!reserved.has(key), `manual decision ${decisionKey} repeats polity key ${key}`);
      polity = {
        key,
        displayName,
        status: decision.polityStatus ?? statusForDisposition[decision.disposition],
        flagAssetTag: decision.flagAssetTag ?? key,
        notes: 'Manually classified source-pack identity with a neutral procedural flag treatment pending historical art review.',
        sources: [],
      };
      nextRoster.polities.push(polity);
      polityByKey.set(key, polity);
      polityByName.set(normalizedName(displayName), polity);
      reserved.add(key);
    } else if (wasAutomated && (previousPolityKey === polity.key || renamedAutomatedPolity)) {
      polity.status = decision.polityStatus ?? statusForDisposition[decision.disposition];
      if (decision.displayName) {
        polityByName.delete(normalizedName(polity.displayName));
        polity.displayName = decision.displayName;
        polityByName.set(normalizedName(polity.displayName), polity);
      }
    }
    const sourceRefs = decision.source === 'ohm'
      ? entry.relationIds.map((id) => ({ kind: 'ohm_relation', id }))
      : entry.sourceRecords.map((id) => ({ kind: 'cliopatria_record', id, source: 'cliopatria-0.2.0' }));
    appendUniqueSources(polity, sourceRefs);
    entry.polityKey = polity.key;
  }

  nextRoster.polities.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return { roster: nextRoster, ohmReview: nextOhmReview, complementReview: nextComplementReview, applied };
}

export function buildCarryForwardDecisionPack({
  previousRoster,
  previousOhmReview,
  previousComplementReview,
  currentRoster,
  currentOhmReview,
  currentComplementReview,
  reviewer,
  reviewedAt,
}) {
  requireValue(previousRoster.asOf !== currentRoster.asOf, 'carry-forward source and target dates must differ');
  requireValue(Boolean(reviewer), 'carry-forward decisions need a reviewer');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt), 'carry-forward decisions need an ISO review date');
  const previousPolityByKey = new Map(previousRoster.polities.map((polity) => [polity.key, polity]));
  const existingOrScheduled = new Set(currentRoster.polities.map((polity) => polity.key));
  const decisions = [];
  const sources = [
    ['ohm', previousOhmReview, currentOhmReview],
    ['cliopatria', previousComplementReview, currentComplementReview],
  ];
  const polityDispositions = new Set(['polity', 'dependent_polity', 'constituent']);
  for (const [source, previousReview, currentReview] of sources) {
    const previousByIdentity = new Map(previousReview.entries.map((entry) => [entry.identityKey, entry]));
    for (const entry of currentReview.entries) {
      if (entry.disposition !== 'unreviewed') continue;
      const prior = previousByIdentity.get(entry.identityKey);
      if (!prior || prior.disposition === 'unreviewed') continue;
      const decision = {
        source,
        identityKey: entry.identityKey,
        disposition: prior.disposition,
        notes: `Classification carried forward from ${previousRoster.asOf}: the same source identity remains active on ${currentRoster.asOf}. Exact-date geometry is audited separately.`,
      };
      if (polityDispositions.has(prior.disposition)) {
        const previousPolity = previousPolityByKey.get(prior.polityKey);
        requireValue(Boolean(previousPolity), `carry-forward identity ${entry.identityKey} has no previous polity`);
        if (/^POLITY(?:_|$)/.test(previousPolity.key)) {
          decision.displayName = previousPolity.displayName;
          decision.polityStatus = previousPolity.status;
        } else if (existingOrScheduled.has(previousPolity.key)) {
          decision.mapTo = previousPolity.key;
        } else {
          decision.polityKey = previousPolity.key;
          decision.displayName = previousPolity.displayName;
          decision.polityStatus = previousPolity.status;
          decision.flagAssetTag = previousPolity.flagAssetTag;
          existingOrScheduled.add(previousPolity.key);
        }
      }
      decisions.push(decision);
    }
  }
  return {
    schemaVersion: 1,
    asOf: currentRoster.asOf,
    reviewer,
    reviewedAt,
    carriedFrom: previousRoster.asOf,
    decisions,
  };
}

export function mergeManualDecisionPacks(packs, { reviewer, reviewedAt }) {
  requireValue(Array.isArray(packs) && packs.length > 0, 'no manual decision packs to merge');
  requireValue(Boolean(reviewer), 'merged decisions need a reviewer');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt), 'merged decisions need an ISO review date');
  const asOf = packs[0].asOf;
  const decisions = new Map();
  for (const pack of packs) {
    requireValue(pack.schemaVersion === 1 && pack.asOf === asOf, 'manual decision packs have incompatible dates');
    for (const decision of pack.decisions ?? []) {
      const key = `${decision.source}:${decision.identityKey}`;
      const existing = decisions.get(key);
      requireValue(!existing || JSON.stringify(existing) === JSON.stringify(decision), `manual decision packs conflict on ${key}`);
      decisions.set(key, decision);
    }
  }
  return {
    schemaVersion: 1,
    asOf,
    reviewer,
    reviewedAt,
    decisions: [...decisions.values()].sort((left, right) => (
      Number(Boolean(left.mapTo)) - Number(Boolean(right.mapTo))
      || left.source.localeCompare(right.source)
      || String(left.identityKey).localeCompare(String(right.identityKey), 'en')
    )),
  };
}

export function buildUniformUnreviewedDecisionPack({ asOf, review, source, disposition, notes, reviewer, reviewedAt }) {
  requireValue(['ohm', 'cliopatria'].includes(source), `invalid uniform decision source ${source}`);
  requireValue(REVIEW_DISPOSITIONS.has(disposition) && disposition !== 'unreviewed', 'invalid uniform disposition');
  requireValue(Boolean(notes), 'uniform decisions need review notes');
  return {
    schemaVersion: 1,
    asOf,
    reviewer,
    reviewedAt,
    decisions: review.entries
      .filter((entry) => entry.disposition === 'unreviewed')
      .map((entry) => ({ source, identityKey: entry.identityKey, disposition, notes })),
  };
}

export function rebuildScenarioRoster({
  baseRoster,
  discovery,
  cliopatriaDiscovery,
  crosswalk,
  decisionPack,
  sourceReviewer = 'Codex source policy',
  reviewedAt,
}) {
  requireValue(baseRoster.asOf === discovery.asOf, 'base roster and OHM discovery dates do not match');
  const ohmReview = scaffoldRosterReview(discovery);
  const complementReview = scaffoldComplementReview(cliopatriaDiscovery, crosswalk);
  const accepted = acceptSourceClassifications({
    roster: baseRoster,
    ohmReview,
    complementReview,
    reviewer: sourceReviewer,
    reviewedAt,
  });
  const decided = applyManualRosterDecisions({
    roster: accepted.roster,
    ohmReview: accepted.ohmReview,
    complementReview: accepted.complementReview,
    decisionPack,
  });
  return {
    ...decided,
    sourceCounts: accepted.counts,
  };
}

export function buildCandidateCrosswalk(ohmDiscovery, cliopatriaDiscovery) {
  requireValue(ohmDiscovery.asOf === cliopatriaDiscovery.asOf, 'candidate source dates do not match');
  const ohm = groupDiscovery(ohmDiscovery);
  const cliopatriaRows = cliopatriaDiscovery.candidates ?? [];
  const cliopatriaByIdentity = new Map();
  for (const row of cliopatriaRows) {
    const prior = cliopatriaByIdentity.get(row.identityKey);
    if (prior) {
      prior.sourceRecords.push(row.sourceRecord);
      prior.geometryHashes.push(row.geometryHash);
    } else {
      cliopatriaByIdentity.set(row.identityKey, {
        ...row,
        sourceRecords: [row.sourceRecord],
        geometryHashes: [row.geometryHash],
      });
    }
  }
  const cliopatria = [...cliopatriaByIdentity.values()];
  const ohmByWikidata = new Map();
  const ohmByName = new Map();
  for (const entry of ohm) {
    if (entry.wikidata) {
      const list = ohmByWikidata.get(entry.wikidata) ?? [];
      list.push(entry);
      ohmByWikidata.set(entry.wikidata, list);
    }
    const name = normalizedName(entry.displayName);
    const list = ohmByName.get(name) ?? [];
    list.push(entry);
    ohmByName.set(name, list);
  }

  const matchedOhm = new Set();
  const matches = [];
  const cliopatriaOnly = [];
  for (const candidate of cliopatria) {
    const wikidataMatches = candidate.wikidata ? (ohmByWikidata.get(candidate.wikidata) ?? []) : [];
    const nameMatches = ohmByName.get(normalizedName(candidate.name)) ?? [];
    const candidates = wikidataMatches.length > 0 ? wikidataMatches : nameMatches;
    if (candidates.length === 1) {
      const ohmEntry = candidates[0];
      matchedOhm.add(ohmEntry.identityKey);
      matches.push({
        matchMethod: wikidataMatches.length > 0 ? 'wikidata' : 'normalized_name',
        identityKey: ohmEntry.identityKey,
        ohmRelationIds: ohmEntry.relationIds,
        cliopatriaRecords: candidate.sourceRecords,
        cliopatriaName: candidate.name,
        wikidata: candidate.wikidata,
      });
    } else {
      cliopatriaOnly.push({
        identityKey: candidate.identityKey,
        name: candidate.name,
        wikidata: candidate.wikidata,
        sourceRecords: candidate.sourceRecords,
        reason: candidates.length > 1 ? 'ambiguous_ohm_match' : 'no_ohm_match',
      });
    }
  }
  const ohmOnly = ohm
    .filter((entry) => !matchedOhm.has(entry.identityKey))
    .map((entry) => ({
      identityKey: entry.identityKey,
      name: entry.displayName,
      wikidata: entry.wikidata,
      relationIds: entry.relationIds,
    }));
  return {
    schemaVersion: 1,
    asOf: ohmDiscovery.asOf,
    sourceOrder: ['OpenHistoricalMap', 'Cliopatria'],
    counts: {
      ohmIdentities: ohm.length,
      cliopatriaRows: cliopatriaRows.length,
      cliopatriaIdentities: cliopatria.length,
      matches: matches.length,
      ohmOnly: ohmOnly.length,
      cliopatriaOnly: cliopatriaOnly.length,
    },
    matches: matches.sort((a, b) => a.identityKey.localeCompare(b.identityKey, 'en')),
    ohmOnly: ohmOnly.sort((a, b) => a.identityKey.localeCompare(b.identityKey, 'en')),
    cliopatriaOnly: cliopatriaOnly.sort((a, b) => String(a.identityKey).localeCompare(String(b.identityKey), 'en')),
  };
}

function reviewLaneFor(evidence) {
  const tags = evidence.evidenceTags.map((entry) => entry.tags ?? {});
  const values = (key) => tags.map((entry) => String(entry[key] ?? '').toLowerCase()).filter(Boolean);
  if (values('disputed').length > 0 || values('place').includes('claim')) {
    return { lane: 'claim_check', reason: 'OHM marks the relation as disputed or as a claim.' };
  }
  if (tags.some((entry) => entry.colony_of || entry.dependency_of || entry.protectorate_of)) {
    return { lane: 'dependency_check', reason: 'OHM supplies an explicit dependency, colony, or protectorate tag.' };
  }
  const dependentPlaces = new Set([
    'colony', 'crown colony', 'protectorate', 'mandate', 'mandated territory', 'dominion',
    'territory', 'captaincy general', 'commission government', 'condominium',
  ]);
  if (values('place').some((value) => dependentPlaces.has(value))
    || values('border_type').some((value) => dependentPlaces.has(value))) {
    return { lane: 'dependency_check', reason: 'OHM place type indicates a dependent or jointly administered territory.' };
  }
  const constituentPlaces = new Set(['state', 'province', 'county', 'settlement']);
  if (values('place').some((value) => constituentPlaces.has(value))) {
    return { lane: 'constituent_check', reason: 'OHM place type indicates a subnational or constituent unit.' };
  }
  const polityBorderTypes = new Set([
    'country', 'nation', 'kingdom', 'empire', 'republic', 'sultanate', 'khanate',
    'principality', 'grand_duchy', 'duchy', 'theocracy', 'federation', 'commonwealth',
  ]);
  if (values('place').includes('country') || values('border_type').some((value) => polityBorderTypes.has(value))) {
    return { lane: 'sovereignty_check', reason: 'OHM place or border type indicates a country-level polity.' };
  }
  return { lane: 'manual', reason: 'OHM tags do not establish a safe political classification.' };
}

export function scaffoldRosterReview(discovery, existingReview = null) {
  requireValue(discovery.schemaVersion === 1, 'unsupported discovery schema');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(discovery.asOf), 'discovery has an invalid date');
  const previous = new Map((existingReview?.entries ?? []).map((entry) => [entry.identityKey, entry]));
  const entries = groupDiscovery(discovery).map((evidence) => {
    const prior = previous.get(evidence.identityKey);
    const suggestion = reviewLaneFor(evidence);
    return {
      ...evidence,
      reviewLane: suggestion.lane,
      reviewLaneReason: suggestion.reason,
      disposition: prior?.disposition ?? 'unreviewed',
      polityKey: prior?.polityKey ?? null,
      notes: prior?.notes ?? null,
      reviewedBy: prior?.reviewedBy ?? null,
      reviewedAt: prior?.reviewedAt ?? null,
    };
  });
  return {
    schemaVersion: 1,
    asOf: discovery.asOf,
    source: 'OpenHistoricalMap admin_level=2 discovery',
    entries,
  };
}

export function scaffoldComplementReview(cliopatriaDiscovery, crosswalk, existingReview = null) {
  requireValue(cliopatriaDiscovery.asOf === crosswalk.asOf, 'Cliopatria and crosswalk dates do not match');
  const previous = new Map((existingReview?.entries ?? []).map((entry) => [entry.identityKey, entry]));
  const rowsByIdentity = new Map();
  for (const row of cliopatriaDiscovery.candidates ?? []) {
    const list = rowsByIdentity.get(row.identityKey) ?? [];
    list.push(row);
    rowsByIdentity.set(row.identityKey, list);
  }
  const entries = crosswalk.cliopatriaOnly.map((candidate) => {
    const rows = rowsByIdentity.get(candidate.identityKey) ?? [];
    const prior = previous.get(candidate.identityKey);
    const memberOf = [...new Set(rows.map((row) => row.memberOf).filter(Boolean))];
    return {
      identityKey: candidate.identityKey,
      displayName: candidate.name,
      wikidata: candidate.wikidata,
      sourceRecords: candidate.sourceRecords,
      intervals: rows.map((row) => ({ fromYear: row.fromYear, toYear: row.toYear })),
      geometryHashes: rows.map((row) => row.geometryHash),
      memberOf,
      license: cliopatriaDiscovery.source.license,
      reviewLane: memberOf.length > 0 ? 'dependency_check' : 'sovereignty_check',
      reviewLaneReason: memberOf.length > 0
        ? 'Cliopatria supplies a coarse membership value that requires documentary review.'
        : 'Cliopatria identifies a polity absent from the OHM identity crosswalk.',
      disposition: prior?.disposition ?? 'unreviewed',
      polityKey: prior?.polityKey ?? null,
      notes: prior?.notes ?? null,
      reviewedBy: prior?.reviewedBy ?? null,
      reviewedAt: prior?.reviewedAt ?? null,
    };
  });
  return {
    schemaVersion: 1,
    asOf: cliopatriaDiscovery.asOf,
    source: cliopatriaDiscovery.source,
    entries: entries.sort(compareIdentity),
  };
}

export function auditComplementReview({ manifest, roster, cliopatriaDiscovery, crosswalk, review }) {
  requireValue(manifest.id === review.asOf, `${manifest.id} complement review date mismatch`);
  requireValue(manifest.id === cliopatriaDiscovery.asOf, `${manifest.id} Cliopatria date mismatch`);
  requireValue(manifest.id === crosswalk.asOf, `${manifest.id} crosswalk date mismatch`);
  const expectedKeys = crosswalk.cliopatriaOnly.map((entry) => entry.identityKey).sort();
  const actualKeys = (review.entries ?? []).map((entry) => entry.identityKey).sort();
  requireValue(JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), 'complement review does not cover every Cliopatria-only identity');
  const polityKeys = new Set((roster.polities ?? []).map((polity) => polity.key));
  let classified = 0;
  let unreviewed = 0;
  for (const entry of review.entries ?? []) {
    requireValue(REVIEW_DISPOSITIONS.has(entry.disposition), `invalid complement disposition for ${entry.identityKey}`);
    if (entry.disposition === 'unreviewed') {
      unreviewed += 1;
    } else {
      classified += 1;
      requireValue(Boolean(entry.notes), `classified complement ${entry.identityKey} needs review notes`);
      requireValue(Boolean(entry.reviewedBy), `classified complement ${entry.identityKey} needs a reviewer`);
      requireValue(Boolean(entry.reviewedAt), `classified complement ${entry.identityKey} needs a review date`);
    }
    if (['polity', 'dependent_polity', 'constituent'].includes(entry.disposition)) {
      requireValue(polityKeys.has(entry.polityKey), `${entry.identityKey} maps to unknown polity ${entry.polityKey}`);
    } else {
      requireValue(entry.polityKey === null, `${entry.identityKey} has a polity key for ${entry.disposition}`);
    }
  }
  if (manifest.status === 'playable') {
    requireValue(unreviewed === 0, `${manifest.id} is playable with ${unreviewed} unreviewed Cliopatria identities`);
  }
  return {
    scenarioId: manifest.id,
    candidates: expectedKeys.length,
    classifiedIdentities: classified,
    unreviewedIdentities: unreviewed,
  };
}

export function auditRosterReview({ manifest, roster, relationships, discovery, review }) {
  requireValue(manifest.id === discovery.asOf, `${manifest.id} discovery date mismatch`);
  requireValue(manifest.id === review.asOf, `${manifest.id} review date mismatch`);
  requireValue(manifest.id === roster.asOf, `${manifest.id} roster date mismatch`);
  requireValue(manifest.id === relationships.asOf, `${manifest.id} relationship date mismatch`);

  const evidence = groupDiscovery(discovery);
  const evidenceByKey = new Map(evidence.map((entry) => [entry.identityKey, entry]));
  const reviewByKey = new Map();
  const polityKeys = new Set((roster.polities ?? []).map((polity) => polity.key));
  let unreviewed = 0;
  let classified = 0;
  const reviewLanes = {};

  for (const entry of review.entries ?? []) {
    reviewLanes[entry.reviewLane] = (reviewLanes[entry.reviewLane] ?? 0) + 1;
    requireValue(!reviewByKey.has(entry.identityKey), `duplicate review identity ${entry.identityKey}`);
    requireValue(evidenceByKey.has(entry.identityKey), `review identity ${entry.identityKey} is absent from discovery`);
    requireValue(REVIEW_DISPOSITIONS.has(entry.disposition), `invalid disposition for ${entry.identityKey}`);
    const expectedRelations = evidenceByKey.get(entry.identityKey).relationIds;
    requireValue(
      JSON.stringify(entry.relationIds) === JSON.stringify(expectedRelations),
      `relation set changed for ${entry.identityKey}; regenerate the review queue`,
    );
    if (entry.disposition === 'unreviewed') {
      unreviewed += 1;
    } else {
      classified += 1;
      requireValue(Boolean(entry.notes), `classified identity ${entry.identityKey} needs review notes`);
      requireValue(Boolean(entry.reviewedBy), `classified identity ${entry.identityKey} needs a reviewer`);
      requireValue(Boolean(entry.reviewedAt), `classified identity ${entry.identityKey} needs a review date`);
    }
    if (['polity', 'dependent_polity', 'constituent'].includes(entry.disposition)) {
      requireValue(polityKeys.has(entry.polityKey), `${entry.identityKey} maps to unknown polity ${entry.polityKey}`);
    } else {
      requireValue(entry.polityKey === null, `${entry.identityKey} has a polity key for ${entry.disposition}`);
    }
    reviewByKey.set(entry.identityKey, entry);
  }

  requireValue(reviewByKey.size === evidenceByKey.size, 'review queue does not cover every discovered identity');

  const relationshipsList = relationships.relationships ?? [];
  for (const relationship of relationshipsList) {
    requireValue(polityKeys.has(relationship.from), `relationship source ${relationship.from} is unknown`);
    requireValue(polityKeys.has(relationship.to), `relationship target ${relationship.to} is unknown`);
  }

  if (manifest.status === 'playable') {
    requireValue(roster.coverage === 'global', `${manifest.id} is playable without global roster coverage`);
    requireValue(unreviewed === 0, `${manifest.id} is playable with ${unreviewed} unreviewed OHM identities`);
  }

  return {
    scenarioId: manifest.id,
    discoveredRelations: discovery.candidates.length,
    discoveredIdentities: evidence.length,
    classifiedIdentities: classified,
    unreviewedIdentities: unreviewed,
    rosterPolities: polityKeys.size,
    relationships: relationshipsList.length,
    reviewLanes,
    complete: unreviewed === 0 && roster.coverage === 'global',
  };
}

export async function loadScenarioRosterFiles(scenarioDir) {
  const resolve = (file) => path.join(scenarioDir, file);
  return {
    manifest: await readJson(resolve('manifest.json')),
    roster: await readJson(resolve('polities.json')),
    relationships: await readJson(resolve('relationships.json')),
    discovery: await readJson(resolve('sources/ohm-discovery.json')),
    review: await readJson(resolve('sources/roster-review.json')),
    cliopatriaDiscovery: await readJson(resolve('sources/cliopatria-discovery.json')),
    crosswalk: await readJson(resolve('sources/candidate-crosswalk.json')),
    complementReview: await readJson(resolve('sources/cliopatria-review.json')),
  };
}

export async function writeRosterReview(outputPath, review) {
  await writeFile(outputPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}
