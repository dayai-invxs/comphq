// Web-side test setup. The shared suite has its own (supabase/functions/
// _shared/test/setup.ts, copied from v1); this one is the app's, and only
// adds what a DOM test needs.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { installMatchMedia, resetMatchMedia } from './matchMedia'

// Some specs declare the node environment — routes.test.tsx reads v1's page
// tree and renders nothing — and there is no DOM there to fill a gap in.
if (typeof window !== 'undefined') {
  beforeEach(installMatchMedia)
  afterEach(resetMatchMedia)
}

afterEach(cleanup)
