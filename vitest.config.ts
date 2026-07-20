import { defineConfig } from 'vitest/config';

/** Multi-decade / long-run balance sims — kept behind `test:balance` / `test:all`. */
export const BALANCE_TEST_GLOBS = [
  'tests/m6.balance.test.ts',
  'tests/m6.ai.stability.test.ts',
  'tests/m6.performance.test.ts',
  'tests/m6.ai.behavior.test.ts',
  'tests/world.stability.test.ts',
] as const;

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
