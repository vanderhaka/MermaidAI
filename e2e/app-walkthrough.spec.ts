import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright'
import { test, expect } from '@playwright/test'

test.describe('MermaidAI — unauthenticated', () => {
  test('home page loads with heading and CTA buttons', async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('MermaidAI')
    await expect(page.getByRole('link', { name: /get started/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()
  })

  test('dashboard redirects to sign-in when not authenticated', async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/dashboard')
    await page.waitForURL(/\/sign-in/)
    await expect(page).toHaveURL(/\/sign-in/)
  })
})

test.describe('MermaidAI — authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/')
    // Sign in via Backend API sign-in token (bypasses 2FA / new device check)
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
    })
  })

  test('can sign in and reach dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('h1')).toHaveText('Dashboard')
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })

  test('can create a new project from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('h1')).toHaveText('Dashboard')

    // Click "New Project" button
    await page.getByRole('button', { name: /new project/i }).click()

    // Should navigate to the new project page
    await page.waitForURL(/\/dashboard\/[a-f0-9-]+/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/dashboard\/[a-f0-9-]+/)
  })
})
