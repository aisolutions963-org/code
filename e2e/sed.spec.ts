import { test, expect } from '@playwright/test'

// Runs with sed storageState (pre-authenticated)

test.describe('SED dashboard', () => {
  test('loads /dashboard/sed', async ({ page }) => {
    await page.goto('/dashboard/sed')
    await expect(page).toHaveURL('/dashboard/sed')
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('Access denied')
  })

  test('cannot access superadmin dashboard', async ({ page }) => {
    await page.goto('/dashboard/superadmin')
    const url = page.url()
    const body = await page.locator('body').textContent()
    const blocked = url.includes('/login') || url.includes('/dashboard/sed') || (body ?? '').includes('Access denied')
    expect(blocked).toBe(true)
  })

  test('cannot access manager dashboard', async ({ page }) => {
    await page.goto('/dashboard/mgr')
    const url = page.url()
    const body = await page.locator('body').textContent()
    const blocked = url.includes('/login') || url.includes('/dashboard/sed') || (body ?? '').includes('Access denied')
    expect(blocked).toBe(true)
  })
})
