import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Async data-fetching functions called in effects are valid patterns.
      'react-hooks/set-state-in-effect': 'off',
      // Nested component definitions that close over parent state are intentional.
      'react-hooks/static-components': 'off',
    },
  },
]);

export default eslintConfig;
