import { describe, expect, it } from 'vitest';
import {
  auditRosterReview,
  auditComplementReview,
  acceptSourceClassifications,
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

    expect(result.counts).toEqual({ ohmAccepted: 1, complementAccepted: 1 });
    expect(result.ohmReview.entries[0]).toMatchObject({ disposition: 'polity', reviewedBy: 'Codex source policy' });
    expect(result.ohmReview.entries[1]).toMatchObject({ disposition: 'unreviewed' });
    expect(result.complementReview.entries[0]).toMatchObject({ disposition: 'polity' });
    expect(result.complementReview.entries[1]).toMatchObject({ disposition: 'unreviewed' });
    expect(result.roster.polities.map((polity) => polity.key)).toEqual(expect.arrayContaining([
      'KINGDOM_EXAMPLE', 'GAMMA_POLITY',
    ]));
  });
});
