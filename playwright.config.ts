import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'node:path'

// Load .env.local so tests that use Supabase admin APIs (creating throwaway
// users for access-gate coverage) see SUPABASE_URL / SUPABASE_SERVICE_KEY.
config({ path: resolve(process.cwd(), '.env.local') })

/**
 * Playwright config. E2E tests mutate the linked Supabase test DB — run
 * them against a fresh branch or staging, not prod.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false, // competition mutations collide if run in parallel
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Reuse an existing dev server if one's running; else start one.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
