import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Integration tests create and delete real Airtable records, so they need real
// credentials (never the dummy ones from vitest.config.ts) and an explicit opt-in
// via RUN_INTEGRATION=1. Run with `npm run test:integration`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Fixtures are shared per file and cleaned up in afterAll — keep files serial.
    fileParallelism: false,
  },
})
