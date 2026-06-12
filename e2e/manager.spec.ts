import { test, expect } from '@playwright/test'

// Runs with manager storageState (pre-authenticated)

test.describe('Manager dashboard', () => {
  test('loads /dashboard/mgr', async ({ page }) => {
    await page.goto('/dashboard/mgr')
    await expect(page).toHaveURL('/dashboard/mgr')
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('Access denied')
  })

  test('cannot access superadmin dashboard', async ({ page }) => {
    await page.goto('/dashboard/superadmin')
    // Should redirect away or show access denied
    const url = page.url()
    const body = await page.locator('body').textContent()
    const blocked = url.includes('/login') || url.includes('/dashboard/mgr') || (body ?? '').includes('Access denied')
    expect(blocked).toBe(true)
  })
})
