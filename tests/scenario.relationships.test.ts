import { describe, expect, it } from 'vitest';
import { buildCarryForwardRelationshipPolicy, compileRelationships } from '../content/sources/relationships/compiler.mjs';

describe('scenario relationship compiler', () => {
  const manifest = { id: '1936-01-01' };
  const roster = {
    asOf: '1936-01-01',
    polities: [
      { key: 'EMPIRE', displayName: 'Empire', status: 'sovereign', sources: [] },
      { key: 'ALLY', displayName: 'Ally', status: 'sovereign', sources: [] },
      { key: 'COLONY_A', displayName: 'Colony A', status: 'vassal', sources: [{ kind: 'ohm_relation', id: 1 }] },
      { key: 'COLONY_B', displayName: 'Colony B', status: 'vassal', sources: [{ kind: 'ohm_relation', id: 2 }] },
    ],
  };

  it('expands rules and preserves explicit joint-administration decisions', () => {
    const result = compileRelationships({
      manifest,
      roster,
      policy: {
        asOf: '1936-01-01',
        rules: [{
          match: { prefixes: ['COLONY_'] }, action: 'overlord', runtimeOverlord: 'EMPIRE',
          basis: 'test_rule', notes: 'Rule decision.',
        }],
        decisions: [{
          key: 'COLONY_B', action: 'joint_administration', runtimeOverlord: 'ALLY',
          participants: ['ALLY', 'EMPIRE'], basis: 'test_joint', notes: 'Explicit decision.',
          evidence: ['https://example.test/joint', 'https://example.test/joint'],
        }],
      },
    });
    expect(result.relationships.map((entry) => [entry.from, entry.to])).toEqual([
      ['EMPIRE', 'COLONY_A'], ['ALLY', 'COLONY_B'],
    ]);
    expect(result.resolutions.find((entry) => entry.polityKey === 'COLONY_B')).toMatchObject({
      action: 'joint_administration', participants: ['ALLY', 'EMPIRE'],
      evidence: ['https://example.test/joint'],
    });
    expect(result.relationships.find((entry) => entry.to === 'COLONY_B')).toMatchObject({
      evidence: ['https://example.test/joint'],
    });
  });

  it('refuses to silently omit a dependent polity', () => {
    expect(() => compileRelationships({
      manifest,
      roster,
      policy: { asOf: '1936-01-01', rules: [], decisions: [] },
    })).toThrow(/uncovered dependent polities/i);
  });

  it('carries same-key relationships only when every participant is represented', () => {
    const policy = buildCarryForwardRelationshipPolicy({
      asOf: '1914-07-28',
      roster,
      previousRelationships: [{ resolutions: [
        { polityKey: 'COLONY_A', action: 'overlord', runtimeOverlord: 'EMPIRE', basis: 'prior', notes: 'Prior.' },
        { polityKey: 'COLONY_B', action: 'overlord', runtimeOverlord: 'ABSENT', basis: 'prior', notes: 'Prior.' },
      ] }],
      reviewedBy: 'historian',
      reviewedAt: '2026-09-02',
    });
    expect(policy.decisions).toContainEqual(expect.objectContaining({
      key: 'COLONY_A', action: 'overlord', runtimeOverlord: 'EMPIRE', basis: 'temporal_carry_forward:prior',
    }));
    expect(policy.decisions).toContainEqual(expect.objectContaining({
      key: 'COLONY_B', action: 'no_runtime_overlord', basis: 'unresolved_exact_date_relationship',
    }));
  });
});
