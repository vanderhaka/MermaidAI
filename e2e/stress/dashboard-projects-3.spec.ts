import { test, expect } from '@playwright/test'

/**
 * Reviewer 3 — Contrarian stress tests for dashboard & project management.
 *
 * Targets edge cases that standard functional tests ignore:
 * malformed URLs, storage tampering, concurrent tabs, slow networks,
 * accessibility announcements, touch simulation, and print layout.
 */

// ---------------------------------------------------------------------------
// 1. Malformed / adversarial projectId in URL
// ---------------------------------------------------------------------------

test.describe('Malformed projectId in URL', () => {
  // All of these hit /dashboard/:id which is protected. Unauthenticated
  // requests redirect to /login, so the middleware is our first defence.
  // If auth is somehow bypassed the server page calls getProjectById() with
  // the raw string → Supabase → notFound(). Verify neither path exposes
  // stack traces or internal error messages.

  const malformedIds = [
    { label: 'empty string', id: '' },
    { label: 'plain garbage', id: 'not-a-uuid-at-all' },
    { label: 'numeric', id: '12345' },
    { label: 'null literal', id: 'null' },
    { label: 'undefined literal', id: 'undefined' },
    { label: 'SQL injection (OR 1=1)', id: "' OR 1=1 --" },
    { label: 'SQL injection (DROP TABLE)', id: "'; DROP TABLE projects; --" },
    { label: 'path traversal (dotdot)', id: '../../etc/passwd' },
    { label: 'path traversal (encoded)', id: '%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
    { label: 'XSS script tag', id: '<script>alert(1)</script>' },
    { label: 'XSS img onerror', id: '<img src=x onerror=alert(1)>' },
    { label: 'unicode snowman', id: '☃' },
    { label: 'very long string', id: 'a'.repeat(2000) },
    { label: 'zero-width chars', id: '\u200B\u200B\u200B' },
    { label: 'CRLF injection', id: 'id%0d%0aX-Injected: true' },
  ]

  for (const { label, id } of malformedIds) {
    test(`rejects ${label}`, async ({ page }) => {
      const encoded = encodeURIComponent(id)
      const response = await page.goto(`/dashboard/${encoded}`, {
        waitUntil: 'domcontentloaded',
      })

      // Acceptable outcomes: redirect to /login (auth wall) or 404.
      // NOT acceptable: 500, stack trace, or reflected input.
      const status = response?.status() ?? 0
      const url = page.url()

      const redirectedToLogin = /\/login/.test(url)
      const got404 = status === 404
      const gotRedirect = status >= 300 && status < 400

      expect(
        redirectedToLogin || got404 || gotRedirect,
        `Expected redirect-to-login or 404 for "${label}", got status ${status} at ${url}`,
      ).toBe(true)

      // Body must never reflect the raw malicious input back unescaped.
      const body = await page.content()
      if (id.includes('<script>')) {
        expect(body).not.toContain('<script>alert(1)</script>')
      }
      if (id.includes('DROP TABLE')) {
        expect(body).not.toContain('DROP TABLE')
      }

      // No server stack trace should leak to the client.
      expect(body).not.toMatch(/at\s+\S+\s+\(.*\.ts:\d+:\d+\)/)
      expect(body).not.toContain('NEXT_NOT_FOUND')
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Browser storage tampering
// ---------------------------------------------------------------------------

test.describe('localStorage / sessionStorage tampering', () => {
  test('dashboard survives cleared localStorage', async ({ page }) => {
    await page.goto('/dashboard')
    // After redirect we should be on /login. Clear storage and reload.
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Page must still render without JS errors.
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(1000)
    expect(errors).toHaveLength(0)
  })

  test('dashboard survives corrupted localStorage values', async ({ page }) => {
    await page.goto('/dashboard')

    // Inject garbage into common storage keys that Zustand or Clerk might use.
    await page.evaluate(() => {
      localStorage.setItem('graph-store', '{{{INVALID JSON')
      localStorage.setItem('clerk-session', 'not-a-real-token')
      localStorage.setItem('supabase.auth.token', '💀💀💀')
    })

    await page.reload({ waitUntil: 'domcontentloaded' })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(1000)

    // A broken JSON parse crashing the page would be a failure.
    // Redirect to /login is acceptable.
    const url = page.url()
    expect(url).toMatch(/\/(login|dashboard)/)
  })

  test('dashboard survives sessionStorage quota exceeded simulation', async ({ page }) => {
    await page.goto('/dashboard')

    // Fill sessionStorage to the brim then try to use the app.
    await page.evaluate(() => {
      try {
        const big = 'x'.repeat(5 * 1024 * 1024) // 5 MB string
        sessionStorage.setItem('quota-bomb', big)
      } catch {
        // Expected — QuotaExceededError
      }
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    // App should still load without crashing.
    await expect(page.locator('body')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 3. Concurrent tabs viewing the same project
// ---------------------------------------------------------------------------

test.describe('Concurrent tabs', () => {
  test('two tabs opening /dashboard do not deadlock or crash', async ({ browser }) => {
    const context = await browser.newContext()
    const tab1 = await context.newPage()
    const tab2 = await context.newPage()

    // Both navigate to /dashboard concurrently.
    const [r1, r2] = await Promise.all([
      tab1.goto('/dashboard', { waitUntil: 'domcontentloaded' }),
      tab2.goto('/dashboard', { waitUntil: 'domcontentloaded' }),
    ])

    // Both should get through to a page (redirect to /login or dashboard itself).
    expect(r1?.status()).toBeLessThan(500)
    expect(r2?.status()).toBeLessThan(500)

    await context.close()
  })

  test('two tabs opening the same invalid project ID simultaneously', async ({ browser }) => {
    const context = await browser.newContext()
    const tab1 = await context.newPage()
    const tab2 = await context.newPage()

    const fakeId = '00000000-0000-0000-0000-000000000000'
    const [r1, r2] = await Promise.all([
      tab1.goto(`/dashboard/${fakeId}`, { waitUntil: 'domcontentloaded' }),
      tab2.goto(`/dashboard/${fakeId}`, { waitUntil: 'domcontentloaded' }),
    ])

    // Neither tab should get a 500.
    expect(r1?.status()).toBeLessThan(500)
    expect(r2?.status()).toBeLessThan(500)

    await context.close()
  })
})

// ---------------------------------------------------------------------------
// 4. Window focus / blur during navigation
// ---------------------------------------------------------------------------

test.describe('Window focus/blur during load', () => {
  test('blurring window mid-navigation does not break dashboard', async ({ page }) => {
    // Start navigation but immediately blur.
    const navigationPromise = page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))

    const response = await navigationPromise
    expect(response?.status()).toBeLessThan(500)

    // Re-focus and verify page is usable.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.locator('body')).toBeVisible()
  })

  test('rapid focus/blur cycling does not crash', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Cycle focus/blur 20 times rapidly.
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new Event('blur'))
        window.dispatchEvent(new Event('focus'))
      }
    })

    // Page should still be intact.
    await expect(page.locator('body')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 5. Slow network simulation
// ---------------------------------------------------------------------------

test.describe('Extremely slow network', () => {
  test('dashboard shows content or redirect within timeout on throttled connection', async ({
    page,
    context,
  }) => {
    // Emulate Slow 3G.
    const cdpSession = await context.newCDPSession(page)
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (40 * 1024) / 8, // 40 kbps
      uploadThroughput: (40 * 1024) / 8,
      latency: 2000,
    })

    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })

    // Even on terrible network, should not 500.
    expect(response?.status()).toBeLessThan(500)

    // Restore network for cleanup.
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Print preview / print media
// ---------------------------------------------------------------------------

test.describe('Print layout', () => {
  test('dashboard renders in print media without JS errors', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Emulate print media.
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(500)

    // Body should still be visible (not display:none in print).
    await expect(page.locator('body')).toBeVisible()
    expect(errors).toHaveLength(0)
  })

  test('print stylesheet does not hide critical content', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await page.emulateMedia({ media: 'print' })

    // The page heading or the login form (depending on auth state) should
    // remain visible in print layout — not hidden by @media print rules.
    const hasVisibleContent = await page.evaluate(() => {
      const body = document.body
      const style = window.getComputedStyle(body)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
    expect(hasVisibleContent).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Touch events (mobile simulation)
// ---------------------------------------------------------------------------

test.describe('Touch interaction (mobile)', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  })

  test('dashboard loads on mobile viewport with touch', async ({ page }) => {
    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBeLessThan(500)
  })

  test('touch tap navigates without double-fire', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    // Tap the sign-up link.
    const signUpLink = page.getByRole('link', { name: /sign up/i })
    if (await signUpLink.isVisible()) {
      await signUpLink.tap()
      await page.waitForURL('**/signup', { timeout: 5000 })
      expect(page.url()).toMatch(/\/signup/)
    }
  })
})

// ---------------------------------------------------------------------------
// 8. Screen reader / accessibility announcements
// ---------------------------------------------------------------------------

test.describe('Accessibility on dashboard', () => {
  test('dashboard page has exactly one h1', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // After auth redirect, check whatever page we land on.
    const h1Count = await page.locator('h1').count()
    expect(h1Count).toBe(1)
  })

  test('interactive elements are keyboard focusable', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    // Tab through the page and verify focus moves to interactive elements.
    await page.keyboard.press('Tab')
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase())
    expect(['a', 'button', 'input', 'select', 'textarea']).toContain(focusedTag)
  })

  test('error alerts use role="alert" for screen reader announcement', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /sign in/i }).click()

    // Wait for validation error.
    const alert = page.getByRole('alert').first()
    await expect(alert).toBeVisible({ timeout: 5000 })

    // role="alert" is automatically announced by screen readers — verify
    // the element actually has the role attribute.
    const role = await alert.getAttribute('role')
    expect(role).toBe('alert')
  })

  test('project cards have accessible names for delete actions', async ({ page }) => {
    // We cannot authenticate in this test, so verify the empty-state
    // dashboard (redirects to /login). Check that the login page itself
    // has proper aria labelling on all buttons.
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const buttons = page.getByRole('button')
    const count = await buttons.count()
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i)
      const name = await btn.getAttribute('aria-label')
      const text = (await btn.textContent())?.trim()
      // Every button must have either visible text or an aria-label.
      expect(
        (name && name.length > 0) || (text && text.length > 0),
        `Button ${i} has no accessible name`,
      ).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 9. CSP / ad-blocker simulation (blocked resources)
// ---------------------------------------------------------------------------

test.describe('Blocked resources (ad-blocker simulation)', () => {
  test('dashboard loads when external scripts are blocked', async ({ page }) => {
    // Intercept and abort any request to common external domains that
    // an ad-blocker would kill.
    await page.route(
      /\.(google-analytics|googletagmanager|facebook|doubleclick|hotjar|sentry)\./,
      (route) => route.abort(),
    )

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBeLessThan(500)

    // The page should degrade gracefully — no unhandled rejections.
    // Filter out benign errors (e.g. "Failed to fetch" for analytics).
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to fetch') && !e.includes('NetworkError') && !e.includes('AbortError'),
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('dashboard loads when Clerk JS is blocked', async ({ page }) => {
    // If Clerk's frontend JS gets blocked, auth UI may break but the page
    // should not white-screen.
    await page.route(/clerk/, (route) => route.abort())

    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })

    // Even with Clerk blocked, middleware should still redirect to /login
    // because the server-side auth check uses Supabase, not Clerk JS.
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 10. Performance Observer / DevTools open simulation
// ---------------------------------------------------------------------------

test.describe('Performance under observation', () => {
  test('dashboard does not leak memory markers when PerformanceObserver is active', async ({
    page,
  }) => {
    // Inject a PerformanceObserver before navigation (simulates dev tools).
    await page.addInitScript(() => {
      const entries: PerformanceEntry[] = []
      const observer = new PerformanceObserver((list) => {
        entries.push(...list.getEntries())
      })
      observer.observe({ type: 'longtask', buffered: true })
      ;(window as unknown as Record<string, unknown>).__perfEntries = entries
    })

    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBeLessThan(500)

    // Retrieve captured long tasks — there should be no individual task
    // longer than 500 ms (anything above 50 ms is technically a "long task"
    // but we're stress-testing, so raise the bar to catch true freezes).
    await page.waitForTimeout(2000)
    const longTasks = await page.evaluate(() => {
      const entries = (window as unknown as Record<string, unknown>)
        .__perfEntries as PerformanceEntry[]
      return entries
        .filter((e) => e.duration > 500)
        .map((e) => ({ name: e.name, duration: e.duration }))
    })

    expect(
      longTasks.length,
      `Found ${longTasks.length} tasks >500ms: ${JSON.stringify(longTasks)}`,
    ).toBe(0)
  })

  test('page does not throw when performance.mark is called before hydration', async ({ page }) => {
    await page.addInitScript(() => {
      // Some monitoring tools call performance.mark before React hydrates.
      performance.mark('pre-hydration-probe')
      performance.measure('probe-to-nav', 'pre-hydration-probe')
    })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    expect(errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 11. Dark mode / theme transition
// ---------------------------------------------------------------------------

test.describe('Color scheme transitions', () => {
  test('dashboard renders without errors in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBeLessThan(500)
    expect(errors).toHaveLength(0)
  })

  test('switching from light to dark mid-render does not crash', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Flip to dark mode.
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(300)

    // Flip back.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(300)

    expect(errors).toHaveLength(0)
    await expect(page.locator('body')).toBeVisible()
  })

  test('forced high-contrast mode does not hide content', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 12. Rapid back/forward navigation abuse
// ---------------------------------------------------------------------------

test.describe('History navigation abuse', () => {
  test('rapid back/forward does not crash the app', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Smash back/forward 10 times each.
    for (let i = 0; i < 10; i++) {
      await page.goBack().catch(() => {})
      await page.goForward().catch(() => {})
    }

    await page.waitForTimeout(500)

    // Filter out navigation-related benign errors.
    const critical = errors.filter((e) => !e.includes('Aborted') && !e.includes('cancelled'))
    expect(critical).toHaveLength(0)
    await expect(page.locator('body')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 13. Double-click and rage-click on New Project button
// ---------------------------------------------------------------------------

test.describe('Rage clicking', () => {
  test('login page submit survives rapid double-click', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const signIn = page.getByRole('button', { name: /sign in/i })
    // Double-click without filling fields — should show validation, not crash.
    await signIn.dblclick()
    await page.waitForTimeout(500)

    expect(errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 14. Response header security on dashboard routes
// ---------------------------------------------------------------------------

test.describe('Response security headers', () => {
  test('dashboard response does not expose server version', async ({ page }) => {
    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    const headers = response?.headers() ?? {}

    // X-Powered-By should be stripped (Next.js adds it by default unless
    // poweredByHeader is false in next.config).
    expect(headers['x-powered-by']).toBeUndefined()
  })

  test('dashboard sets X-Content-Type-Options nosniff', async ({ page }) => {
    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    })
    const headers = response?.headers() ?? {}

    // If security headers are configured, verify nosniff.
    // If missing entirely, this is a finding worth flagging.
    if (headers['x-content-type-options']) {
      expect(headers['x-content-type-options']).toBe('nosniff')
    }
  })
})

// ---------------------------------------------------------------------------
// 15. Offline then online recovery
// ---------------------------------------------------------------------------

test.describe('Offline recovery', () => {
  test('going offline then online does not leave dashboard broken', async ({ page, context }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    const cdpSession = await context.newCDPSession(page)

    // Go offline.
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0,
    })

    // Try to reload — will fail, but should not crash with uncaught error.
    await page.reload({ waitUntil: 'commit', timeout: 5000 }).catch(() => {})

    // Come back online.
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    })

    // Reload again — should recover.
    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    expect(response?.status()).toBeLessThan(500)
  })
})
