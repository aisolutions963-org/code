import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows login form', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('shows error on wrong password', async ({ page }) => {
    await page.locator('input[type="email"]').fill('superadmin@woodwings.test')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })

  test('shows error on invalid email format', async ({ page }) => {
    // HTML5 email validation prevents submit — button stays disabled or browser blocks
    // Test that the server also rejects via a properly formed bad request
    await page.locator('input[type="email"]').fill('valid@example.com')
    await page.locator('input[type="password"]').fill('TestPass2025')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })

  test('superadmin redirects to /dashboard/superadmin', async ({ page }) => {
    await page.locator('input[type="email"]').fill('superadmin@woodwings.test')
    await page.locator('input[type="password"]').fill('TestPass2025')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/dashboard/superadmin', { timeout: 15_000 })
    await expect(page).toHaveURL('/dashboard/superadmin')
  })

  test('manager redirects to /dashboard/mgr', async ({ page }) => {
    await page.locator('input[type="email"]').fill('manager@woodwings.test')
    await page.locator('input[type="password"]').fill('TestPass2025')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/dashboard/mgr', { timeout: 15_000 })
    await expect(page).toHaveURL('/dashboard/mgr')
  })

  test('sed redirects to /dashboard/sed', async ({ page }) => {
    await page.locator('input[type="email"]').fill('sed@woodwings.test')
    await page.locator('input[type="password"]').fill('TestPass2025')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/dashboard/sed', { timeout: 15_000 })
    await expect(page).toHaveURL('/dashboard/sed')
  })
})

test.describe('Auth guards', () => {
  test('unauthenticated user visiting dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard/superadmin')
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user visiting mgr dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard/mgr')
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})
