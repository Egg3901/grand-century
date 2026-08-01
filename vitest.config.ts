import { defineConfig } from 'vitest/config';

/** Multi-decade / long-run balance sims — kept behind `test:balance` / `test:all`. */
export const BALANCE_TEST_GLOBS = [
  'tests/m6.balance.test.ts',
  'tests/m6.ai.stability.test.ts',
  'tests/m6.performance.test.ts',
  'tests/m6.ai.behavior.test.ts',
  'tests/world.stability.test.ts',
  // Wall-clock benchmarks: must not run under unit-project parallelism.
  'tests/perf.timing.test.ts',
] as const;

/**
 * 1.1.0: the unit project ran on vitest's default 5 s per-test timeout, but many
 * of these tests build whole 620-province worlds and advance them for years.
 * Under full-suite parallelism on a loaded machine they intermittently blew the
 * limit — the same test passing in 3 s standalone and timing out in the suite.
 * That made `npm run test` nondeterministically red, which is worthless as a
 * release gate. 30 s is generous enough to absorb scheduling noise while still
 * failing a genuinely hung test.
 */
const SIM_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [...BALANCE_TEST_GLOBS],
          testTimeout: SIM_TEST_TIMEOUT_MS,
          hookTimeout: SIM_TEST_TIMEOUT_MS,
        },
      },
      {
        test: {
          name: 'balance',
          environment: 'node',
          include: [...BALANCE_TEST_GLOBS],
        },
      },
    ],
  },
});
