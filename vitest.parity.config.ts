import { defineConfig } from 'vitest/config'

// pnpm test:parity — the golden-master differential.
//
// Kept out of the main config on purpose: this suite needs a served v3
// runtime and a seeded fixture database, so it cannot run in the same pass
// as the unit tests. See tools/golden/README.md.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/parity/*.parity.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
