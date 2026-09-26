import { defineConfig, devices } from '@playwright/test'
import { baseURL, functionsUrl } from './e2e/env'

/**
 * The end-to-end suite. It mutates the linked Supabase project, so it runs
 * against the test project rather than production.
 *
 * `testDir` is the point of this file existing at all: without it `playwright
 * test` globs the whole repository and picks up the ~160 vitest specs, which
 * it cannot run.
 *
 * Two servers, because v3 is two: the SPA on Vite, and the Edge Functions the
 * SPA calls. v1 needed one — its API was the same Next server as its pages.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // A competition is a shared fixture, and two specs mutating one collide.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  // The safety net for the fixtures a killed run never cleaned up.
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // The functions answer 401 without credentials, which counts as ready.
      command: 'pnpm dev:functions',
      url: `${functionsUrl}/functions/v1/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
