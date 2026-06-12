import { test, expect } from '@playwright/test'

// Runs with superadmin storageState (pre-authenticated)

test.describe('Superadmin dashboard', () => {
  test('loads /dashboard/superadmin', async ({ page }) => {
    await page.goto('/dashboard/superadmin')
    await expect(page).toHaveURL('/dashboard/superadmin')
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('Access denied')
  })

  test('shows payments section', async ({ page }) => {
    await page.goto('/dashboard/superadmin')
    await expect(page.getByText(/payments/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('can navigate to /dashboard/superadmin/users', async ({ page }) => {
    await page.goto('/dashboard/superadmin/users')
    await expect(page).toHaveURL('/dashboard/superadmin/users')
    await expect(page.locator('body')).not.toContainText('404')
  })
})

test.describe('Superadmin role protection', () => {
  test('superadmin can access manager dashboard', async ({ page }) => {
    // Superadmin is allowed cross-dashboard access
    await page.goto('/dashboard/mgr')
    await expect(page.locator('body')).not.toContainText('Access denied')
  })
})
