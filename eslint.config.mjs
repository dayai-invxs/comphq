import { existsSync, readdirSync } from 'node:fs'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Flat config for the whole repo. Type-unaware, because `pnpm typecheck`
// already runs tsc over both tsconfigs and a second type-aware pass buys
// nothing but time.
//
// The feature list is read off disk rather than written down. A written list
// stops guarding the moment someone adds a feature and forgets to extend it,
// and the boundary rules below are the whole reason the directory layout is
// worth anything.
const FEATURES_DIR = new URL('./apps/web/src/features', import.meta.url)
const FEATURES = existsSync(FEATURES_DIR)
  ? readdirSync(FEATURES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      // Deno, with its own `deno check` in `pnpm check:deno`.
      'supabase/functions/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // A component declared during a render is a new type on the next one,
      // and React reconciles by type: it drops the subtree and mounts a fresh
      // one, taking every bit of state inside it with it.
      'react-hooks/static-components': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The plain-JS files here are the harness: tools/*.mjs and the configs.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Unidirectional imports, bulletproof-react style: a feature never imports
  // another feature — they compose in app/ — and nothing shared imports app/.
  ...FEATURES.map((name) => ({
    files: [`apps/web/src/features/${name}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*/**', `!@/features/${name}/**`],
            message: 'Features must not import other features — compose them in app/.',
          },
          { group: ['@/app', '@/app/**'], message: 'Do not import from app/ — imports must stay unidirectional.' },
        ],
      }],
    },
  })),
  {
    files: ['apps/web/src/{components,lib,hooks,types,tokens}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@/app', '@/app/**'], message: 'Shared modules must not import from app/.' }],
      }],
    },
  },
  {
    // src/api/ is the shared query layer: every feature may import it, it may
    // import none of them. That asymmetry is what stops a query two features
    // need from being copy-pasted into both.
    files: ['apps/web/src/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/features', '@/features/**'], message: 'src/api/ is shared — it must not depend on a feature.' },
          { group: ['@/app', '@/app/**'], message: 'Shared modules must not import from app/.' },
        ],
      }],
    },
  },
)
