import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Contract tests hit the real Airtable base and run via vitest.contract.config.ts
    // (`npm run test:contract`) — keep them out of the offline unit run.
    exclude: ['tests/contract/**'],
    // Dummy values so tests can import Airtable modules whose _client.ts calls validateEnv()
    // at load time. Tests never hit the network — they exercise pure logic only.
    env: {
      AIRTABLE_API_KEY: 'test',
      AIRTABLE_BASE_ID: 'test',
      SESSION_SECRET: 'test-secret-at-least-32-characters-long',
    },
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/airtable.ts', 'lib/db.ts', 'lib/email.ts', 'lib/auth.ts'],
    },
  },
})
