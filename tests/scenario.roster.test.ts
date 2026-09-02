import { describe, expect, it } from 'vitest';
import {
  auditRosterReview,
  auditComplementReview,
  acceptSourceClassifications,
  buildCarryForwardDecisionPack,
  mergeManualDecisionPacks,
  buildUniformUnreviewedDecisionPack,
  applyManualRosterDecisions,
  buildCandidateCrosswalk,
  scaffoldRosterReview,
  scaffoldComplementReview,
} from '../content/sources/roster/compiler.mjs';

const discovery = {
  schemaVersion: 1,
  asOf: '1700-01-01',
  candidates: [
    {
      relationId: 2,
      identityKey: 'Q-ALPHA',
      name: 'Alpha dependency',
      wikidata: 'Q-ALPHA',
      startDate: '1690',
      endDate: '1710',
      license: 'CC0',
      licenseStatus: 'allowed',
    },
    {
      relationId: 1,
      identityKey: 'Q-ALPHA',
      name: 'Alpha dependency',
      wikidata: 'Q-ALPHA',
      startDate: '1680',
      endDate: '1705',
      license: 'CC0',
      licenseStatus: 'allowed',
    },
    {
      relationId: 3,
      identityKey: 'Q-BETA',
      name: 'Beta claim',
      wikidata: 'Q-BETA',
      startDate: '1700',
      endDate: '1700',
      license: 'CC0',
      licenseStatus: 'allowed',
    },
  ],
};

const manifest = {
  id: '1700-01-01',
  status: 'development',
};

const roster = {
  asOf: '1700-01-01',
  coverage: 'vertical_slice',
  polities: [{ key: 'ALPHA', displayName: 'Alpha', status: 'colonial_administration' }],
};

const relationships = {
  asOf: '1700-01-01',
  relationships: [],
};

describe('scenario roster review compiler', () => {
  it('crosswalks complementary sources by stable ID before normalized name', () => {
    const crosswalk = buildCandidateCrosswalk(discovery, {
      asOf: '1700-01-01',
      candidates: [
        { sourceRecord: 10, identityKey: 'Q-ALPHA', name: 'Different label', wikidata: 'Q-ALPHA' },
        { sourceRecord: 11, identityKey: 'Q-GAMMA', name: 'Gamma polity', wikidata: 'Q-GAMMA' },
      ],
    });
    expect(crosswalk.counts).toEqual({
      ohmIdentities: 2,
      cliopatriaRows: 2,
      cliopatriaIdentities: 2,
      matches: 1,
      ohmOnly: 1,
      cliopatriaOnly: 1,
    });
    expect(crosswalk.matches[0]).toMatchObject({ matchMethod: 'wikidata', identityKey: 'Q-ALPHA' });
  });

  it('keeps distinct non-Latin names distinct during source crosswalks', () => {
    const crosswalk = buildCandidateCrosswalk({
      schemaVersion: 1,
      asOf: '1936-01-01',
      candidates: [
        { relationId: 1, identityKey: 'ohm:greece', name: 'Ελλάδα' },
        { relationId: 2, identityKey: 'ohm:china', name: '中國' },
      ],
    }, {
      asOf: '1936-01-01',
      candidates: [
        { sourceRecord: 1, identityKey: 'source:greece', name: 'Ελλάδα' },
        { sourceRecord: 2, identityKey: 'source:china', name: '中國' },
      ],
    });
    expect(crosswalk.matches.map((match) => match.identityKey)).toEqual(['ohm:china', 'ohm:greece']);
  });

  it('tracks every complementary-source omission in its own review gate', () => {
    const cliopatriaDiscovery = {
      asOf: '1700-01-01',
      source: { license: 'CC BY 4.0' },
      candidates: [
        {
          sourceRecord: 11, identityKey: 'Q-GAMMA', name: 'Gamma polity', wikidata: 'Q-GAMMA',
          fromYear: 1600, toYear: 1750, geometryHash: 'abc', memberOf: null,
        },
      ],
    };
    const crosswalk = buildCandidateCrosswalk(discovery, cliopatriaDiscovery);
    const review = scaffoldComplementReview(cliopatriaDiscovery, crosswalk);
    expect(review.entries).toEqual([
      expect.objectContaining({ identityKey: 'Q-GAMMA', disposition: 'unreviewed', reviewLane: 'sovereignty_check' }),
    ]);
    expect(auditComplementReview({ manifest, roster, cliopatriaDiscovery, crosswalk, review })).toMatchObject({
      candidates: 1,
      unreviewedIdentities: 1,
    });
  });

  it('groups simultaneous relations by stable identity and preserves review decisions', () => {
    const first = scaffoldRosterReview(discovery);
    expect(first.entries).toHaveLength(2);
    expect(first.entries[0]).toMatchObject({
      identityKey: 'Q-ALPHA',
      relationIds: [1, 2],
      disposition: 'unreviewed',
      reviewLane: 'manual',
    });

    const reviewed = structuredClone(first);
    reviewed.entries[0] = {
      ...reviewed.entries[0],
      disposition: 'dependent_polity',
      polityKey: 'ALPHA',
      notes: 'Reviewed dependency.',
      reviewedBy: 'historian',
      reviewedAt: '2026-09-02',
    };
    const regenerated = scaffoldRosterReview(discovery, reviewed);
    expect(regenerated.entries[0]).toMatchObject({
      disposition: 'dependent_polity',
      polityKey: 'ALPHA',
      reviewedBy: 'historian',
    });
  });

  it('reports measurable incomplete coverage for development scenarios', () => {
    const review = scaffoldRosterReview(discovery);
    const result = auditRosterReview({ manifest, roster, relationships, discovery, review });
    expect(result).toMatchObject({
      discoveredRelations: 3,
      discoveredIdentities: 2,
      classifiedIdentities: 0,
      unreviewedIdentities: 2,
      complete: false,
    });
  });

  it('blocks playable scenarios with unreviewed identities or non-global coverage', () => {
    const review = scaffoldRosterReview(discovery);
    expect(() => auditRosterReview({
      manifest: { ...manifest, status: 'playable' },
      roster,
      relationships,
      discovery,
      review,
    })).toThrow(/global roster coverage/i);
  });

  it('requires classified identities to map to known polities when appropriate', () => {
    const review = scaffoldRosterReview(discovery);
    review.entries[0] = {
      ...review.entries[0],
      disposition: 'dependent_polity',
      polityKey: 'MISSING',
      notes: 'Reviewed dependency.',
      reviewedBy: 'historian',
      reviewedAt: '2026-09-02',
    };
    expect(() => auditRosterReview({ manifest, roster, relationships, discovery, review }))
      .toThrow(/unknown polity MISSING/i);
  });

  it('accepts only explicit source classifications and leaves ambiguous entries blocked', () => {
    const result = acceptSourceClassifications({
      roster,
      ohmReview: {
        entries: [
          {
            identityKey: 'Q-KINGDOM', displayName: 'Kingdom Example', wikidata: 'Q-KINGDOM', relationIds: [20],
            reviewLane: 'sovereignty_check', disposition: 'unreviewed', polityKey: null,
          },
          {
            identityKey: 'Q-UNKNOWN', displayName: 'Unknown Example', wikidata: 'Q-UNKNOWN', relationIds: [21],
            reviewLane: 'manual', disposition: 'unreviewed', polityKey: null,
          },
        ],
      },
      complementReview: {
        entries: [
          {
            identityKey: 'Q-GAMMA', displayName: 'Gamma Polity', wikidata: 'Q-GAMMA', sourceRecords: [9],
            reviewLane: 'sovereignty_check', disposition: 'unreviewed', polityKey: null,
          },
          {
            identityKey: 'Q-EMPIRE', displayName: 'Empire Member', wikidata: 'Q-EMPIRE', sourceRecords: [10],
            reviewLane: 'dependency_check', disposition: 'unreviewed', polityKey: null,
          },
        ],
      },
      reviewer: 'Codex source policy',
      reviewedAt: '2026-09-02',
    });

    expect(result.counts).toEqual({
      ohmAccepted: 1,
      complementAccepted: 0,
      ohmRetracted: 0,
      complementRetracted: 0,
    });
    expect(result.ohmReview.entries[0]).toMatchObject({ disposition: 'polity', reviewedBy: 'Codex source policy' });
    expect(result.ohmReview.entries[1]).toMatchObject({ disposition: 'unreviewed' });
    expect(result.complementReview.entries[0]).toMatchObject({ disposition: 'unreviewed' });
    expect(result.complementReview.entries[1]).toMatchObject({ disposition: 'unreviewed' });
    expect(result.roster.polities.map((polity) => polity.key)).toContain('KINGDOM_EXAMPLE');
    expect(result.roster.polities.map((polity) => polity.key)).not.toContain('GAMMA_POLITY');
  });

  it('uses an English Wikipedia title for a non-Latin polity key', () => {
    const result = acceptSourceClassifications({
      roster: { asOf: '1914-07-28', polities: [] },
      ohmReview: {
        entries: [{
          identityKey: 'Q386496', displayName: 'Краљевина Црна Горa', wikidata: 'Q386496', relationIds: [1],
          evidenceTags: [{ relationId: 1, tags: { 'wikipedia:en': 'Kingdom of Montenegro' } }],
          reviewLane: 'sovereignty_check', disposition: 'unreviewed', polityKey: null,
        }],
      },
      complementReview: { entries: [] },
      reviewer: 'Codex source policy',
      reviewedAt: '2026-09-02',
    });
    expect(result.roster.polities[0]).toMatchObject({ key: 'KINGDOM_OF_MONTENEGRO' });
  });

  it('applies explicit manual decisions and can correct an automated status', () => {
    const result = applyManualRosterDecisions({
      roster: {
        asOf: '1936-01-01',
        polities: [{
          key: 'ISLAND', displayName: 'Island', status: 'sovereign', flagAssetTag: 'TBD_NEUTRAL',
          notes: 'Source-pack classification with a neutral procedural flag treatment pending historical art review.',
          sources: [{ kind: 'ohm_relation', id: 8 }],
        }],
      },
      ohmReview: {
        entries: [{
          identityKey: 'Q-ISLAND', displayName: 'Island', relationIds: [8], reviewLane: 'sovereignty_check',
          disposition: 'polity', polityKey: 'ISLAND', notes: 'Automated.', reviewedBy: 'Codex source policy', reviewedAt: '2026-09-02',
        }],
      },
      complementReview: { entries: [] },
      decisionPack: {
        schemaVersion: 1,
        asOf: '1936-01-01',
        reviewer: 'historian',
        reviewedAt: '2026-09-02',
        decisions: [{
          source: 'ohm', identityKey: 'Q-ISLAND', disposition: 'dependent_polity',
          displayName: 'Island Dependency', notes: 'Reviewed as a dependency.',
        }],
      },
    });
    expect(result.roster.polities[0]).toMatchObject({ displayName: 'Island Dependency', status: 'vassal' });
    expect(result.ohmReview.entries[0]).toMatchObject({
      disposition: 'dependent_polity', polityKey: 'ISLAND', reviewedBy: 'historian',
    });
  });

  it('lets an explicit review replace an automated fallback polity key', () => {
    const result = applyManualRosterDecisions({
      roster: {
        asOf: '1945-09-02',
        polities: [{
          key: 'POLITY_Q865', displayName: '中國', status: 'sovereign', flagAssetTag: 'POLITY_Q865',
          notes: 'Source-pack classification with a neutral procedural flag treatment pending historical art review.',
          sources: [{ kind: 'ohm_relation', id: 9 }],
        }],
      },
      ohmReview: {
        entries: [{
          identityKey: 'Q865', displayName: '中國', relationIds: [9], reviewLane: 'sovereignty_check',
          disposition: 'polity', polityKey: 'POLITY_Q865', notes: 'Automated.',
          reviewedBy: 'Codex source policy', reviewedAt: '2026-09-02',
        }],
      },
      complementReview: { entries: [] },
      decisionPack: {
        schemaVersion: 1,
        asOf: '1945-09-02',
        reviewer: 'historian',
        reviewedAt: '2026-09-02',
        decisions: [{
          source: 'ohm', identityKey: 'Q865', disposition: 'polity', polityKey: 'REPUBLIC_OF_CHINA',
          displayName: 'Republic of China', notes: 'Reviewed semantic identity.',
        }],
      },
    });
    expect(result.roster.polities).toEqual([
      expect.objectContaining({ key: 'REPUBLIC_OF_CHINA', displayName: 'Republic of China' }),
    ]);
    expect(result.ohmReview.entries[0]).toMatchObject({ polityKey: 'REPUBLIC_OF_CHINA' });
  });

  it('carries a stable reviewed identity forward with its semantic polity key', () => {
    const currentRoster = { asOf: '1945-09-02', polities: [] };
    const currentOhmReview = {
      entries: [{
        identityKey: 'Q-ISLAND', displayName: 'Island', relationIds: [9], reviewLane: 'manual',
        disposition: 'unreviewed', polityKey: null,
      }],
    };
    const pack = buildCarryForwardDecisionPack({
      previousRoster: {
        asOf: '1936-01-01',
        polities: [{
          key: 'ISLAND_STATE', displayName: 'Island State', status: 'vassal', flagAssetTag: 'ISLAND_STATE', sources: [],
        }],
      },
      previousOhmReview: {
        entries: [{ identityKey: 'Q-ISLAND', disposition: 'dependent_polity', polityKey: 'ISLAND_STATE' }],
      },
      previousComplementReview: { entries: [] },
      currentRoster,
      currentOhmReview,
      currentComplementReview: { entries: [] },
      reviewer: 'historian',
      reviewedAt: '2026-09-02',
    });
    expect(pack.decisions[0]).toMatchObject({
      identityKey: 'Q-ISLAND', disposition: 'dependent_polity', polityKey: 'ISLAND_STATE',
    });
    const applied = applyManualRosterDecisions({
      roster: currentRoster,
      ohmReview: currentOhmReview,
      complementReview: { entries: [] },
      decisionPack: pack,
    });
    expect(applied.roster.polities[0]).toMatchObject({
      key: 'ISLAND_STATE', displayName: 'Island State', status: 'vassal',
    });
  });

  it('does not carry collision-prone generated polity keys across dates', () => {
    const pack = buildCarryForwardDecisionPack({
      previousRoster: {
        asOf: '1700-01-01',
        polities: [{
          key: 'POLITY_POLITY', displayName: 'Historical polity', status: 'sovereign',
          flagAssetTag: 'POLITY_POLITY', sources: [],
        }],
      },
      previousOhmReview: {
        entries: [{ identityKey: 'Q-HISTORICAL', disposition: 'polity', polityKey: 'POLITY_POLITY' }],
      },
      previousComplementReview: { entries: [] },
      currentRoster: { asOf: '1815-06-18', polities: [] },
      currentOhmReview: {
        entries: [{ identityKey: 'Q-HISTORICAL', displayName: 'Historical polity', disposition: 'unreviewed' }],
      },
      currentComplementReview: { entries: [] },
      reviewer: 'historian',
      reviewedAt: '2026-09-02',
    });
    expect(pack.decisions[0]).toMatchObject({ identityKey: 'Q-HISTORICAL', displayName: 'Historical polity' });
    expect(pack.decisions[0]).not.toHaveProperty('polityKey');
  });

  it('merges compatible temporal decision packs and rejects conflicts', () => {
    const base = {
      schemaVersion: 1, asOf: '1815-06-18', reviewer: 'a', reviewedAt: '2026-09-02',
      decisions: [{ source: 'ohm', identityKey: 'Q1', disposition: 'polity', notes: 'Stable.' }],
    };
    const second = {
      ...base,
      decisions: [{ source: 'cliopatria', identityKey: 'Q2', disposition: 'exclude', notes: 'Absent.' }],
    };
    expect(mergeManualDecisionPacks([base, second], { reviewer: 'historian', reviewedAt: '2026-09-02' }).decisions)
      .toHaveLength(2);
    expect(() => mergeManualDecisionPacks([
      base,
      { ...base, decisions: [{ ...base.decisions[0], disposition: 'excluded' }] },
    ], { reviewer: 'historian', reviewedAt: '2026-09-02' })).toThrow(/conflict/i);
  });

  it('builds an explicit conservative disposition pack for remaining candidates', () => {
    const pack = buildUniformUnreviewedDecisionPack({
      asOf: '1776-07-04',
      review: { entries: [{ identityKey: 'Q1', disposition: 'unreviewed' }, { identityKey: 'Q2', disposition: 'polity' }] },
      source: 'cliopatria',
      disposition: 'exclude',
      notes: 'Independent exact-date review is absent.',
      reviewer: 'historian',
      reviewedAt: '2026-09-02',
    });
    expect(pack.decisions).toEqual([expect.objectContaining({ identityKey: 'Q1', disposition: 'exclude' })]);
  });
});
