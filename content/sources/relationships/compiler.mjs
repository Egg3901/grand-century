import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEPENDENT_STATUSES = new Set(['vassal', 'colonial_administration', 'tributary']);

function requireValue(condition, message) {
  if (!condition) throw new Error(`[relationships] ${message}`);
}

function matches(key, match) {
  return (match.keys ?? []).includes(key)
    || (match.prefixes ?? []).some((prefix) => key.startsWith(prefix));
}

function sourceEvidence(polity) {
  return (polity.sources ?? []).map((source) => ({ kind: source.kind, id: source.id }));
}

function documentaryEvidence(resolution) {
  return [...new Set(resolution.evidence ?? [])];
}

export function compileRelationships({ manifest, roster, policy }) {
  requireValue(roster.asOf === manifest.id && policy.asOf === manifest.id, 'source dates do not match');
  const polityByKey = new Map(roster.polities.map((polity) => [polity.key, polity]));
  const dependents = roster.polities.filter((polity) => DEPENDENT_STATUSES.has(polity.status));
  const decisions = [];
  const relationships = [];

  const uncovered = dependents.filter((polity) => (
    !(policy.decisions ?? []).some((decision) => decision.key === polity.key)
      && !(policy.rules ?? []).some((rule) => matches(polity.key, rule.match ?? {}))
  ));
  requireValue(uncovered.length === 0, `uncovered dependent polities: ${uncovered.map((polity) => polity.key).join(', ')}`);

  for (const polity of dependents) {
    const explicit = (policy.decisions ?? []).filter((decision) => decision.key === polity.key);
    const rules = (policy.rules ?? []).filter((rule) => matches(polity.key, rule.match ?? {}));
    requireValue(explicit.length <= 1, `${polity.key} has duplicate explicit decisions`);
    requireValue(explicit.length === 1 || rules.length === 1, `${polity.key} must match exactly one rule or explicit decision`);
    const resolution = explicit[0] ?? rules[0];
    const evidence = documentaryEvidence(resolution);
    requireValue(explicit.length === 1 || rules.length === 1, `${polity.key} has ambiguous policy rules`);
    requireValue(
      ['overlord', 'joint_administration', 'no_runtime_overlord'].includes(resolution.action),
      `${polity.key} has unsupported action ${resolution.action}`,
    );
    if (resolution.runtimeOverlord) {
      requireValue(polityByKey.has(resolution.runtimeOverlord), `${polity.key} has unknown overlord ${resolution.runtimeOverlord}`);
      requireValue(resolution.runtimeOverlord !== polity.key, `${polity.key} points at itself`);
      relationships.push({
        kind: 'overlord',
        from: resolution.runtimeOverlord,
        to: polity.key,
        basis: resolution.basis,
        notes: resolution.notes,
        sources: sourceEvidence(polity),
        ...(evidence.length > 0 ? { evidence } : {}),
      });
    } else {
      requireValue(resolution.action !== 'overlord', `${polity.key} overlord action lacks a runtime overlord`);
    }
    for (const participant of resolution.participants ?? []) {
      requireValue(polityByKey.has(participant), `${polity.key} has unknown joint participant ${participant}`);
    }
    decisions.push({
      polityKey: polity.key,
      action: resolution.action,
      runtimeOverlord: resolution.runtimeOverlord ?? null,
      participants: resolution.participants ?? [],
      basis: resolution.basis,
      notes: resolution.notes,
      sources: sourceEvidence(polity),
      ...(evidence.length > 0 ? { evidence } : {}),
    });
  }

  const covered = new Set(decisions.map((decision) => decision.polityKey));
  requireValue(covered.size === dependents.length, `covered ${covered.size}/${dependents.length} dependent polities`);
  return {
    schemaVersion: 1,
    asOf: manifest.id,
    relationships: relationships.sort((left, right) => left.to.localeCompare(right.to, 'en')),
    resolutions: decisions.sort((left, right) => left.polityKey.localeCompare(right.polityKey, 'en')),
    counts: {
      dependentPolities: dependents.length,
      runtimeOverlords: relationships.length,
      jointAdministrations: decisions.filter((decision) => decision.action === 'joint_administration').length,
      noRuntimeOverlord: decisions.filter((decision) => decision.action === 'no_runtime_overlord').length,
    },
  };
}

export async function writeRelationships(outputPath, result) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
