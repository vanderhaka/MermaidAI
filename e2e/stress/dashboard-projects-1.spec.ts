import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to /dashboard and handle the auth redirect gracefully.
 *  Returns `true` if the page stayed on /dashboard (authenticated),
 *  `false` if it was redirected to /login.
 */
async function gotoDashboard(page: Page): Promise<boolean> {
  await page.goto('/dashboard')
  // Middleware redirects unauthenticated users to /login.
  // Wait for the URL to settle (either /dashboard or /login).
  await page.waitForLoadState('domcontentloaded')
  const url = page.url()
  return url.includes('/dashboard') && !url.includes('/login')
}

/** Count DOM nodes on the page — useful for detecting leaks. */
async function domNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('*').length)
}

// ---------------------------------------------------------------------------
// 1. Auth redirect behaviour
// ---------------------------------------------------------------------------

test.describe('Dashboard auth redirect', () => {
  test('unauthenticated visit to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to /dashboard/fake-project-id redirects to /login', async ({
    page,
  }) => {
    await page.goto('/dashboard/00000000-0000-0000-0000-000000000000')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirect preserves page responsiveness — login form still interactive', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    const emailInput = page.getByLabel('Email')
    await expect(emailInput).toBeVisible()
    await emailInput.fill('stress@test.com')
    await expect(emailInput).toHaveValue('stress@test.com')
  })
})

// ---------------------------------------------------------------------------
// 2. Rapid repeated navigation to /dashboard (redirect storm)
// ---------------------------------------------------------------------------

test.describe('Rapid dashboard navigation (unauthenticated)', () => {
  test('10 consecutive navigations to /dashboard all redirect cleanly', async ({ page }) => {
    for (let i = 0; i < 10; i++) {
      await page.goto('/dashboard')
      await page.waitForURL('**/login', { timeout: 10_000 })
      await expect(page).toHaveURL(/\/login/)
    }
    // After the storm the login page should still be functional.
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('rapid navigation does not leak DOM nodes', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    const baseline = await domNodeCount(page)

    for (let i = 0; i < 5; i++) {
      await page.goto('/dashboard')
      await page.waitForURL('**/login', { timeout: 10_000 })
    }

    const afterStorm = await domNodeCount(page)
    // Allow up to 50 % growth — anything more signals a leak.
    expect(afterStorm).toBeLessThan(baseline * 1.5)
  })
})

// ---------------------------------------------------------------------------
// 3. Direct URL access with various malformed project IDs
// ---------------------------------------------------------------------------

test.describe('Malformed project URL handling', () => {
  const malformedIds = [
    'not-a-uuid',
    '../../../etc/passwd',
    '<script>alert(1)</script>',
    '%00%00%00',
    'a'.repeat(500),
    '   ',
    '../../login',
  ]

  for (const id of malformedIds) {
    test(`/dashboard/${id.slice(0, 40)}... redirects or shows error without crash`, async ({
      page,
    }) => {
      const response = await page.goto(`/dashboard/${encodeURIComponent(id)}`)
      // Should either redirect to /login (unauthed) or return a non-500 status.
      if (response) {
        expect(response.status()).toBeLessThan(500)
      }
      // Page should not be blank/crashed — some visible content should exist.
      await expect(page.locator('body')).not.toBeEmpty()
    })
  }
})

// ---------------------------------------------------------------------------
// 4. Layout stability at extreme viewport sizes
// ---------------------------------------------------------------------------

test.describe('Dashboard layout at extreme viewports', () => {
  const viewports = [
    { label: 'tiny mobile', width: 320, height: 480 },
    { label: 'narrow mobile', width: 375, height: 667 },
    { label: 'tablet portrait', width: 768, height: 1024 },
    { label: 'wide desktop', width: 1920, height: 1080 },
    { label: 'ultrawide', width: 3440, height: 1440 },
    { label: 'very tall narrow', width: 400, height: 2000 },
  ]

  for (const vp of viewports) {
    test(`login page (from redirect) renders at ${vp.label} (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/dashboard')
      await page.waitForURL('**/login', { timeout: 10_000 })
      // No horizontal overflow
      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflowX).toBe(false)
      // Login form is still visible
      await expect(page.getByLabel('Email')).toBeVisible()
    })
  }
})

// ---------------------------------------------------------------------------
// 5. Login page accessibility after redirect
// ---------------------------------------------------------------------------

test.describe('Dashboard redirect — login page accessibility', () => {
  test('login form has proper form roles and labels', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })

    // Email and password inputs have associated labels.
    const email = page.getByLabel('Email')
    const password = page.getByLabel('Password')
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()

    // Submit button exists and is keyboard-focusable.
    const submit = page.getByRole('button', { name: /sign in/i })
    await expect(submit).toBeVisible()
    await expect(submit).toBeEnabled()
  })

  test('login form elements are keyboard-navigable via Tab', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })

    // Tab through elements — should reach email, password, and submit.
    const focusedTags: string[] = []
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const tag = await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName}:${el.getAttribute('type') || el.getAttribute('role') || ''}` : ''
      })
      focusedTags.push(tag)
    }

    // At least one input and one button should be tab-reachable.
    const hasInput = focusedTags.some((t) => t.startsWith('INPUT'))
    const hasButton = focusedTags.some((t) => t.startsWith('BUTTON'))
    expect(hasInput).toBe(true)
    expect(hasButton).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. Performance: redirect latency
// ---------------------------------------------------------------------------

test.describe('Dashboard redirect performance', () => {
  test('redirect from /dashboard to /login completes within 5 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    const elapsed = Date.now() - start
    // The redirect should be fast — middleware-level, no heavy SSR.
    expect(elapsed).toBeLessThan(5_000)
  })

  test('login page after redirect achieves domcontentloaded quickly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      return nav ? nav.domContentLoadedEventEnd - nav.startTime : -1
    })
    // Should load under 3 seconds (generous for dev server).
    if (timing > 0) {
      expect(timing).toBeLessThan(3_000)
    }
  })
})

// ---------------------------------------------------------------------------
// 7. Concurrent /dashboard hits (parallel tab simulation)
// ---------------------------------------------------------------------------

test.describe('Concurrent dashboard access', () => {
  test('5 parallel navigations all resolve without errors', async ({ browser }) => {
    const results = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const context = await browser.newContext()
        const page = await context.newPage()
        const response = await page.goto('/dashboard')
        await page.waitForURL('**/login', { timeout: 10_000 })
        const status = response?.status() ?? 0
        await context.close()
        return status
      }),
    )
    // All should redirect (302) or serve the login page (200).
    for (const status of results) {
      expect(status).toBeLessThan(500)
    }
  })
})

// ---------------------------------------------------------------------------
// 8. Deep-linked workspace URL without auth
// ---------------------------------------------------------------------------

test.describe('Direct workspace URL access', () => {
  test('/dashboard/<valid-uuid-format> redirects to login', async ({ page }) => {
    await page.goto('/dashboard/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('no sensitive data is leaked in the redirect URL', async ({ page }) => {
    await page.goto('/dashboard/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    await page.waitForURL('**/login', { timeout: 10_000 })
    const url = page.url()
    // The redirect should not carry the project ID as a query param.
    expect(url).not.toContain('a1b2c3d4')
  })
})

// ---------------------------------------------------------------------------
// 9. Page state after browser back/forward through redirect
// ---------------------------------------------------------------------------

test.describe('Browser history through redirect', () => {
  test('back button after redirect does not break the page', async ({ page }) => {
    await page.goto('/')
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })

    // Go back to home.
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()

    // Go forward again — should land on login (redirected).
    await page.goForward()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()
  })
})

// ---------------------------------------------------------------------------
// 10. Stress: viewport resize storm on the login page (post-redirect)
// ---------------------------------------------------------------------------

test.describe('Viewport resize storm', () => {
  test('rapid viewport changes do not crash the login page', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })

    const sizes = [
      { width: 320, height: 480 },
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
      { width: 320, height: 480 },
      { width: 2560, height: 1440 },
      { width: 414, height: 896 },
    ]

    for (const size of sizes) {
      await page.setViewportSize(size)
      // Brief pause to let layout recalc fire.
      await page.waitForTimeout(50)
    }

    // Page should still be responsive after the storm.
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 11. Console error monitoring during stress
// ---------------------------------------------------------------------------

test.describe('Console error monitoring', () => {
  test('no unhandled JS errors during redirect cycle', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })

    // Interact with the login page briefly.
    await page.getByLabel('Email').fill('stress@test.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(1_000)

    // Filter out known non-critical errors (e.g. Clerk/Supabase SDK noise).
    const critical = errors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('Loading CSS chunk') &&
        !e.includes('Failed to fetch'),
    )
    expect(critical).toHaveLength(0)
  })

  test('no console errors when navigating to malformed dashboard URLs', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/dashboard/not-a-real-id')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Loading CSS chunk'),
    )
    expect(critical).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 12. Network resilience: offline after page load
// ---------------------------------------------------------------------------

test.describe('Network resilience', () => {
  test('login page (post-redirect) remains visible after going offline', async ({
    page,
    context,
  }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page.getByLabel('Email')).toBeVisible()

    // Go offline.
    await context.setOffline(true)

    // The already-loaded page should still be visible.
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

    // Restore network.
    await context.setOffline(false)
  })
})

// ---------------------------------------------------------------------------
// NOTE: Tests below document what WOULD be tested with authentication.
// They are skipped because the test suite runs without auth credentials.
// To enable them, set up a Playwright auth state via storageState or
// a test account login fixture.
// ---------------------------------------------------------------------------

test.describe('Authenticated dashboard tests (require auth setup)', () => {
  test.skip(true, 'Requires authenticated session — see note above')

  // These tests would cover:
  //
  // - Dashboard page load: [data-testid="dashboard-page"] renders with header,
  //   project count, and ProjectList.
  //
  // - Empty state: [data-testid="project-empty-state"] renders when the user
  //   has zero projects, with the "No projects yet" heading and feature cards.
  //
  // - New project creation: clicking [data-testid="new-project-button"] triggers
  //   createProject and navigates to /dashboard/<new-id>.
  //
  // - Project card interaction: clicking a ProjectCard navigates to the workspace.
  //   Delete flow: click delete -> confirm step -> "Confirm delete" button.
  //
  // - Rapid project switching: navigate between multiple /dashboard/<id> URLs
  //   and verify [data-testid="project-workspace"] mounts/unmounts cleanly.
  //
  // - Sidebar collapse/expand stress: [data-testid="module-sidebar"] toggle
  //   button rapid-clicks (aria-expanded toggles), verify DOM stability.
  //
  // - Assistant panel open/close cycles: the floating chat button opens
  //   [data-testid="chat-panel"] as a dialog; rapid toggling should not leak
  //   DOM nodes.
  //
  // - Canvas panel: [data-testid="canvas-panel"] should render React Flow
  //   without console errors.
  //
  // - Module hierarchy indicator: [data-testid="module-hierarchy-indicator"]
  //   shows Domain/Module/Flow steps with correct tones.
  //
  // - Settings panel: toggling the gear button opens inline name/description
  //   edit form; save and cancel work correctly.
  //
  // - Keyboard navigation: Tab through project cards, sidebar modules,
  //   action buttons. Enter/Space should activate focused elements.
  //
  // - DOM growth over interactions: after 20 sidebar toggles + 10 assistant
  //   toggles + 5 settings toggles, DOM node count should not grow beyond 2x.

  test('placeholder to document authenticated test plan', async () => {
    // Intentionally empty — documentation only.
  })
})
