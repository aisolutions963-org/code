import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Contract tests run against the REAL Airtable base, so — unlike vitest.config.ts —
// this config deliberately does NOT inject dummy credentials. Real values come from
// .env.local locally (see tests/contract/setup.ts) or from CI secrets.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/contract/**/*.test.ts'],
    setupFiles: ['tests/contract/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
