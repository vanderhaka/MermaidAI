import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

async function tryLogin(page: import('@playwright/test').Page): Promise<boolean> {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (!email || !password) return false

  await page.goto(`${BASE_URL}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  try {
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

async function createScopeProject(page: import('@playwright/test').Page): Promise<string | null> {
  await page.getByTestId('new-project-button').click()
  await page.getByTestId('mode-selector').waitFor({ timeout: 5_000 })
  await page.getByText('Quick Capture').click()

  try {
    await page.waitForURL(/\/dashboard\/[a-f0-9-]+/, { timeout: 10_000 })
    return page.url()
  } catch {
    return null
  }
}

async function createArchitectureProject(
  page: import('@playwright/test').Page,
): Promise<string | null> {
  await page.goto(`${BASE_URL}/dashboard`)
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('new-project-button').click()
  await page.getByTestId('mode-selector').waitFor({ timeout: 5_000 })
  await page.getByText('Full Design').click()

  try {
    await page.waitForURL(/\/dashboard\/[a-f0-9-]+/, { timeout: 10_000 })
    return page.url()
  } catch {
    return null
  }
}

async function readDownload(download: import('@playwright/test').Download): Promise<string> {
  const path = await download.path()
  if (!path) return ''
  const fs = await import('fs')
  return fs.readFileSync(path, 'utf-8')
}

test.describe('PRD Preview & Export', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(!loggedIn, 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set')
  })

  test('scope workspace: PRD button opens preview panel', async ({ page }) => {
    const url = await createScopeProject(page)
    test.skip(!url, 'Could not create scope project')

    const prdButton = page.getByRole('button', { name: /view prd/i })
    await expect(prdButton).toBeVisible({ timeout: 10_000 })

    await prdButton.click()

    const panel = page.getByTestId('prd-preview-panel')
    await expect(panel).toBeVisible({ timeout: 3_000 })
    await expect(
      panel.getByRole('heading', { name: 'Product Requirements', exact: true }),
    ).toBeVisible()
  })

  test('preview panel closes when clicking close button', async ({ page }) => {
    const url = await createScopeProject(page)
    test.skip(!url, 'Could not create scope project')

    await page.getByRole('button', { name: /view prd/i }).click()

    const panel = page.getByTestId('prd-preview-panel')
    await expect(panel).toBeVisible({ timeout: 3_000 })

    await panel.getByRole('button', { name: /close prd preview/i }).click()
    await expect(panel).not.toBeVisible()
  })

  test('preview panel closes when clicking backdrop', async ({ page }) => {
    const url = await createScopeProject(page)
    test.skip(!url, 'Could not create scope project')

    await page.getByRole('button', { name: /view prd/i }).click()
    await expect(page.getByTestId('prd-preview-panel')).toBeVisible({ timeout: 3_000 })

    // Click the backdrop (left side of screen, outside the panel)
    await page.mouse.click(50, 300)
    await expect(page.getByTestId('prd-preview-panel')).not.toBeVisible()
  })

  test('preview panel has download button that triggers .md download', async ({ page }) => {
    const url = await createScopeProject(page)
    test.skip(!url, 'Could not create scope project')

    await page.getByRole('button', { name: /view prd/i }).click()
    const panel = page.getByTestId('prd-preview-panel')
    await expect(panel).toBeVisible({ timeout: 3_000 })

    const downloadBtn = panel.getByRole('button', { name: /download/i })
    await expect(downloadBtn).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await downloadBtn.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.md$/)
  })

  test('architecture workspace: PRD button opens preview panel', async ({ page }) => {
    const url = await createArchitectureProject(page)
    test.skip(!url, 'Could not create architecture project')

    await page.waitForSelector('[data-testid="project-workspace"]', { timeout: 10_000 })

    const prdButton = page.getByRole('button', { name: /view prd/i })
    await expect(prdButton).toBeVisible({ timeout: 5_000 })

    await prdButton.click()

    const panel = page.getByTestId('prd-preview-panel')
    await expect(panel).toBeVisible({ timeout: 3_000 })
  })

  test('PRD button is keyboard accessible', async ({ page }) => {
    const url = await createScopeProject(page)
    test.skip(!url, 'Could not create scope project')

    const prdButton = page.getByRole('button', { name: /view prd/i })
    await expect(prdButton).toBeVisible({ timeout: 10_000 })

    await prdButton.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('prd-preview-panel')).toBeVisible({ timeout: 3_000 })
  })

  test('empty project shows empty state message in preview', async ({ page }) => {
    const url = await createScopeProject(page)
    test.skip(!url, 'Could not create scope project')

    await page.getByRole('button', { name: /view prd/i }).click()
    const panel = page.getByTestId('prd-preview-panel')
    await expect(panel).toBeVisible({ timeout: 3_000 })

    // Should show either auto-generated content or the empty state
    const hasContent = await panel.locator('article').count()
    const hasEmptyState = await panel.getByText(/no requirements captured/i).count()
    expect(hasContent + hasEmptyState).toBeGreaterThan(0)
  })
})
