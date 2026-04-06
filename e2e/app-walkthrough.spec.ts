import { test, expect } from '@playwright/test'

test.describe('MermaidAI App Walkthrough', () => {
  test('home page loads with heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('MermaidAI')
    await page.screenshot({ path: 'e2e/screenshots/home.png' })
  })

  test('login page renders form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/login.png' })
  })

  test('signup page renders form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('h1')).toHaveText('Create your account')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /log in/i })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/signup.png' })
  })

  test('login form validates empty fields', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/login-validation.png' })
  })

  test('signup form validates empty fields', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('button', { name: /sign up/i }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/signup-validation.png' })
  })

  test('login form shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('wrongpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 10_000 })
    await page.screenshot({ path: 'e2e/screenshots/login-error.png' })
  })

  test('dashboard redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
    await page.screenshot({ path: 'e2e/screenshots/dashboard-redirect.png' })
  })

  test('navigate from login to signup and back', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')
    await expect(page.locator('h1')).toHaveText('Create your account')

    await page.getByRole('link', { name: /log in/i }).click()
    await page.waitForURL('**/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/navigation.png' })
  })
})
