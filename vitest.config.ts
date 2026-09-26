import { defineConfig } from 'vitest/config'

// Mirrors v1's vitest.config.mts so ported specs run under the same contract:
// node env, integration specs excluded, one shared setup file.
//
// The @/lib/* and @/test/* aliases come from tsconfig.shared.json so v1's
// specs import verbatim. A spec edited to run here would not prove parity.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['supabase/functions/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
          setupFiles: ['supabase/functions/_shared/test/setup.ts'],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'web',
          environment: 'jsdom',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
})
