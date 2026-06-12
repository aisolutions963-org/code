import { test as setup, expect } from '@playwright/test'
import path from 'path'

const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'TestPass2025'

const roles = [
  { name: 'superadmin', email: 'superadmin@woodwings.test', dashboard: '/dashboard/superadmin' },
  { name: 'manager',    email: 'manager@woodwings.test',    dashboard: '/dashboard/mgr' },
  { name: 'sed',        email: 'sed@woodwings.test',        dashboard: '/dashboard/sed' },
]

for (const { name, email, dashboard } of roles) {
  setup(`authenticate as ${name}`, async ({ page }) => {
    await page.goto('/login')

    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL(dashboard, { timeout: 15_000 })
    await expect(page).toHaveURL(dashboard)

    await page.context().storageState({
      path: path.join('e2e', '.auth', `${name}.json`),
    })
  })
}
