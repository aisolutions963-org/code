import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // 1. Auth setup — runs first, saves cookies per role
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // 2. Unauthenticated tests
    {
      name: 'no-auth',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // 3. Authenticated tests — each role loads saved cookies
    {
      name: 'superadmin',
      testMatch: /superadmin\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/superadmin.json',
      },
    },
    {
      name: 'manager',
      testMatch: /manager\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/manager.json',
      },
    },
    {
      name: 'sed',
      testMatch: /sed\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/sed.json',
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
