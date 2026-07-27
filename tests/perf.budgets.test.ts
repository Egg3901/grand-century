import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The render-side budget is a STATIC count, not a runtime measurement.
 *
 * `src/store.ts` stabilizes top-level snapshot field identities across ticks
 * (see stabilizeSnapshot) so components can subscribe to narrow slices.
 * Counting remaining wholesale `state.snapshot` subscriptions is a stable,
 * fast proxy for the render cost the perf-floor milestone reduced. Measuring
 * actual React re-renders would need a DOM harness this suite does not
 * otherwise carry.
 */
describe('H5 render budget', () => {
  const SRC = join(__dirname, '..', 'src');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('records how many components subscribe to the whole snapshot', () => {
    // Count the BEHAVIOUR (a selector returning the entire snapshot object),
    // not one spelling of it. The original regex only matched
    // `useStore((s) => s.snapshot)`, so wrapping the same selector in
    // `useShallow(...)` made the number read 0 while six components still
    // pulled the whole object. A budget that a rename can satisfy is not a
    // budget. `useSnapshotFields` is the shared helper that implements narrow
    // selection, so it is excluded by name rather than by shape.
    const WHOLE_SNAPSHOT_SELECTOR = /\(\s*\w+\s*\)\s*=>\s*\w+\.snapshot\s*[,)]/;
    const HELPER = 'ui/useSnapshotFields.ts';
    const wholesale: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.replace(`${SRC}/`, '');
      if (rel === HELPER || rel === 'store.ts') continue;
      if (WHOLE_SNAPSHOT_SELECTOR.test(readFileSync(file, 'utf8'))) wholesale.push(rel);
    }
    console.log(
      `[budget] ${wholesale.length} modules still select the entire snapshot:\n  `
      + (wholesale.sort().join('\n  ') || '(none)'),
    );
    // 28 before F1, 6 after (issue #8), 5 after the Diplomacy rework.
    // DiplomacyPanel dropped off the list because it was rebuilt around
    // `useSnapshotFields` with an explicit 19-field list, not because the
    // selector was rewrapped: the panel no longer reads market, armies,
    // fleets, production, population, culture, tech, crisis, chronicle or
    // colonial state at all. The five that remain — the map plus the military,
    // colonization and crisis panels, and the panel host — genuinely read most
    // of the snapshot, and `stabilizeSnapshot` reuses field identities so a
    // quiet tick costs them nothing. This must go DOWN, never up.
    expect(wholesale.length).toBeLessThanOrEqual(5);
  });

  it('records the size of the onSnapshot derivation block in the store', () => {
    const store = readFileSync(join(SRC, 'store.ts'), 'utf8').split('\n');
    // Match the IMPLEMENTATION, not the interface field declaration — an
    // earlier version of this test matched `onSnapshot: (s: WorldSnapshot) =>
    // void;` in the type and cheerfully reported a 1-line block.
    const start = store.findIndex((line) => /onSnapshot:\s*\(.*\)\s*=>\s*set\(/.test(line));
    expect(start, 'onSnapshot implementation not found in src/store.ts').toBeGreaterThan(-1);
    // Find the end of the set() callback by brace depth from the onSnapshot line.
    let depth = 0;
    let end = start;
    for (let i = start; i < store.length; i++) {
      for (const ch of store[i]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (i > start && depth <= 0) { end = i; break; }
    }
    const lines = end - start;
    console.log(`[budget] store onSnapshot derivation spans ${lines} lines (src/store.ts:${start + 1})`);
    // Recorded at 5 after F1 (issue #8): alert derivation lives in src/ui/alerts.ts;
    // onSnapshot only stabilizes the snapshot and calls deriveAlerts.
    expect(lines).toBeLessThanOrEqual(5);
  });
});
