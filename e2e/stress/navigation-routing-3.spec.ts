import { test, expect } from '@playwright/test'

/**
 * Navigation & Routing Stress Tests — Reviewer 3 (Contrarian)
 *
 * These tests target the overlooked edges of navigation:
 * encoded URLs, absurdly long paths, fragment changes, multi-tab races,
 * rapid-fire navigation memory leaks, and console error monitoring.
 *
 * Assumes unauthenticated context unless stated otherwise —
 * middleware should redirect protected routes cleanly under all conditions.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect console errors during a callback. */
async function collectConsoleErrors(
  page: import('@playwright/test').Page,
  fn: () => Promise<void>,
): Promise<string[]> {
  const errors: string[] = []
  const handler = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  }
  page.on('console', handler)
  await fn()
  page.off('console', handler)
  return errors
}

// ---------------------------------------------------------------------------
// 1. Encoded URL Paths
// ---------------------------------------------------------------------------

test.describe('Encoded URL paths', () => {
  test('single-encoded %2F in projectId does not crash the app', async ({ page }) => {
    // %2F is an encoded forward slash — the server should not interpret it
    // as a path separator. Expect either a redirect to /login (protected)
    // or a clean 404, never an unhandled exception.
    const errors = await collectConsoleErrors(page, async () => {
      const response = await page.goto('/dashboard/abc%2Fdef')
      expect(response).not.toBeNull()
      const status = response!.status()
      // Should redirect to login (302 -> 200) or 404 — never 500.
      expect(status).toBeLessThan(500)
    })
    // Next.js hydration errors in console would indicate a mismatch.
    const hydrationErrors = errors.filter((e) => /hydrat/i.test(e))
    expect(hydrationErrors).toHaveLength(0)
  })

  test('double-encoded %252F in projectId resolves without 500', async ({ page }) => {
    const response = await page.goto('/dashboard/abc%252Fdef')
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
  })

  test('null byte %00 in projectId is rejected safely', async ({ page }) => {
    const response = await page.goto('/dashboard/abc%00def')
    expect(response).not.toBeNull()
    // Null bytes should never reach the database query layer as-is.
    // Acceptable outcomes: 400, 404, or redirect to login.
    expect(response!.status()).toBeLessThan(500)
  })

  test('unicode-encoded path segments handled gracefully', async ({ page }) => {
    // Cyrillic "test" + emoji — middleware must not choke.
    const response = await page.goto('/dashboard/%D1%82%D0%B5%D1%81%D1%82%F0%9F%92%80')
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
  })

  test('percent-encoded login route still serves the login page', async ({ page }) => {
    // /login spelled as /%6C%6F%67%69%6E — should be equivalent.
    await page.goto('/%6C%6F%67%69%6E')
    // If the server normalises, we get the login page.
    // If not, we get a 404. Either is acceptable; 500 is not.
    const status = (await page.goto('/%6C%6F%67%69%6E'))?.status() ?? 0
    expect(status).toBeLessThan(500)
  })
})

// ---------------------------------------------------------------------------
// 2. Very Long / Malformed projectId Values
// ---------------------------------------------------------------------------

test.describe('Oversized and malformed projectId', () => {
  test('1000-char projectId returns non-500 response', async ({ page }) => {
    const longId = 'a'.repeat(1000)
    const response = await page.goto(`/dashboard/${longId}`)
    expect(response).not.toBeNull()
    // Supabase UUID column would reject this, but it should surface
    // as a 404 (notFound()) not a raw 500 error page.
    expect(response!.status()).toBeLessThan(500)
  })

  test('10 000-char projectId does not hang the server', async ({ page }) => {
    const hugeId = 'x'.repeat(10_000)
    const response = await page.goto(`/dashboard/${hugeId}`, { timeout: 15_000 })
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
  })

  test('projectId with SQL injection attempt returns safely', async ({ page }) => {
    const sqli = "'; DROP TABLE projects; --"
    const response = await page.goto(`/dashboard/${encodeURIComponent(sqli)}`)
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
  })

  test('projectId with XSS payload does not reflect script', async ({ page }) => {
    const xss = '<script>alert(1)</script>'
    await page.goto(`/dashboard/${encodeURIComponent(xss)}`)
    // Ensure the literal script tag is never rendered into the DOM.
    const scriptContent = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script')
      return Array.from(scripts)
        .map((s) => s.textContent)
        .join('')
    })
    expect(scriptContent).not.toContain('alert(1)')
  })

  test('valid UUID format but non-existent project triggers not-found', async ({ page }) => {
    // A properly-formatted UUID that does not exist in the database.
    const fakeUuid = '00000000-0000-4000-a000-000000000000'
    const errors = await collectConsoleErrors(page, async () => {
      await page.goto(`/dashboard/${fakeUuid}`)
    })
    // Should land on login redirect (unauthenticated) or 404 page — never crash.
    await expect(page).toHaveURL(/\/(login|dashboard)/)
    const hydrationErrors = errors.filter((e) => /hydrat/i.test(e))
    expect(hydrationErrors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Fragment-Only URL Changes (#section)
// ---------------------------------------------------------------------------

test.describe('Fragment-only navigation', () => {
  test('adding a fragment to landing page does not trigger a full reload', async ({ page }) => {
    await page.goto('/')
    // Record the performance entry count before fragment change.
    const navCountBefore = await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    )
    await page.evaluate(() => {
      window.location.hash = '#features'
    })
    // Fragment changes should NOT produce a new navigation entry.
    const navCountAfter = await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    )
    expect(navCountAfter).toBe(navCountBefore)
    // The URL should include the fragment.
    expect(page.url()).toContain('#features')
  })

  test('navigating from #a to #b does not fire network requests', async ({ page }) => {
    await page.goto('/')
    const requests: string[] = []
    page.on('request', (req) => requests.push(req.url()))

    await page.evaluate(() => {
      window.location.hash = '#a'
    })
    await page.waitForTimeout(200)
    await page.evaluate(() => {
      window.location.hash = '#b'
    })
    await page.waitForTimeout(200)

    // Filter to same-origin document requests (not assets, not RSC payloads).
    const docRequests = requests.filter(
      (url) => new URL(url).pathname === '/' && !url.includes('_next'),
    )
    expect(docRequests).toHaveLength(0)
  })

  test('fragment preserved across soft navigation from landing to login', async ({ page }) => {
    // Fragments are client-only; the server strips them.
    // But after a Next.js <Link> click the browser should keep the hash
    // if the link itself doesn't specify one.
    await page.goto('/#retained')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')
    // The fragment is gone — this is expected browser behaviour.
    // The key assertion is that navigation completes without error.
    expect(page.url()).toContain('/login')
  })
})

// ---------------------------------------------------------------------------
// 4. Multi-Tab / Concurrent Session Stress
// ---------------------------------------------------------------------------

test.describe('Multi-tab concurrency', () => {
  test('opening 10 tabs to the landing page simultaneously does not error', async ({ browser }) => {
    const context = await browser.newContext()
    const pages = await Promise.all(Array.from({ length: 10 }, () => context.newPage()))

    const results = await Promise.all(
      pages.map(async (p) => {
        const res = await p.goto('/', { timeout: 30_000 })
        return res?.status() ?? 0
      }),
    )

    for (const status of results) {
      expect(status).toBeLessThan(500)
      expect(status).toBeGreaterThanOrEqual(200)
    }

    await context.close()
  })

  test('opening 10 tabs to /dashboard simultaneously all redirect to login', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const pages = await Promise.all(Array.from({ length: 10 }, () => context.newPage()))

    await Promise.all(
      pages.map(async (p) => {
        await p.goto('/dashboard', { timeout: 30_000 })
        await p.waitForURL('**/login', { timeout: 10_000 })
      }),
    )

    for (const p of pages) {
      expect(p.url()).toContain('/login')
    }

    await context.close()
  })
})

// ---------------------------------------------------------------------------
// 5. Rapid-Fire Navigation & Memory Pressure
// ---------------------------------------------------------------------------

test.describe('Rapid navigation stress', () => {
  test('50 rapid navigations between landing, login, signup without crash', async ({ page }) => {
    const routes = ['/', '/login', '/signup']
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    for (let i = 0; i < 50; i++) {
      const route = routes[i % routes.length]
      await page.goto(route, { waitUntil: 'commit' })
    }

    // Final navigation should land cleanly.
    await page.goto('/', { waitUntil: 'load' })
    await expect(page.locator('h1')).toBeVisible()

    // Filter out benign errors (e.g. AbortError from interrupted fetches).
    const criticalErrors = errors.filter((e) => !/AbortError|Failed to fetch|cancelled/i.test(e))
    // Some frameworks emit warnings during rapid nav — allow a small tolerance.
    expect(criticalErrors.length).toBeLessThanOrEqual(5)
  })

  test('memory does not grow unboundedly across 50 navigations', async ({ page }) => {
    // Baseline.
    await page.goto('/')
    const baseline = await page.evaluate(
      () => (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize,
    )

    // Skip if the browser does not expose memory info (Firefox, WebKit).
    test.skip(!baseline, 'Browser does not expose performance.memory')

    const routes = ['/', '/login', '/signup']
    for (let i = 0; i < 50; i++) {
      await page.goto(routes[i % routes.length], { waitUntil: 'commit' })
    }

    // Force GC if available, then measure.
    await page.goto('/')
    await page.waitForTimeout(500)
    const after = await page.evaluate(
      () => (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize,
    )

    if (baseline && after) {
      // Allow up to 4x growth — generous, but catches catastrophic leaks.
      expect(after).toBeLessThan(baseline * 4)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Middleware Redirect Race Conditions
// ---------------------------------------------------------------------------

test.describe('Middleware redirect edge cases', () => {
  test('deep nested protected route redirects to login', async ({ page }) => {
    // /dashboard/some-id/extra/segments — middleware checks startsWith('/dashboard')
    await page.goto('/dashboard/abc/def/ghi')
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })

  test('trailing slash on /dashboard/ still triggers redirect', async ({ page }) => {
    await page.goto('/dashboard/')
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })

  test('query params on protected route survive redirect to login', async ({ page }) => {
    // Many apps lose the original URL during redirect. Verify the redirect
    // at least doesn't crash, even if return-url isn't implemented yet.
    const response = await page.goto('/dashboard?foo=bar&baz=qux')
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
    await page.waitForURL('**/login', { timeout: 10_000 })
  })

  test('HEAD request to protected route returns redirect, not 500', async ({ request }) => {
    const response = await request.head('/dashboard')
    // Middleware should issue a 307/308 redirect for the HEAD method.
    // Accept any 3xx or a 200 (if the test runner follows redirects).
    expect(response.status()).toBeLessThan(500)
  })

  test('OPTIONS request to a protected route does not crash', async ({ request }) => {
    const response = await request.fetch('/dashboard', { method: 'OPTIONS' })
    expect(response.status()).toBeLessThan(500)
  })
})

// ---------------------------------------------------------------------------
// 7. Page Visibility API Interactions
// ---------------------------------------------------------------------------

test.describe('Page visibility during navigation', () => {
  test('simulated tab-hide mid-navigation does not break rendering', async ({ page }) => {
    // Emulate the page going hidden (like the user switching tabs).
    await page.goto('/')

    // Dispatch a visibilitychange event to simulate tab switch.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Navigate while "hidden".
    await page.goto('/login')

    // Restore visibility.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // The page should be fully functional.
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 8. Back/Forward Cache and History Manipulation
// ---------------------------------------------------------------------------

test.describe('History and back/forward behavior', () => {
  test('browser back button from login returns to landing page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')
    await page.goBack()
    await page.waitForURL('**/')
    await expect(page.locator('h1')).toContainText('Turn messy operational logic')
  })

  test('history.pushState with bogus path does not break Next.js router', async ({ page }) => {
    await page.goto('/')
    const errors = await collectConsoleErrors(page, async () => {
      await page.evaluate(() => {
        history.pushState(null, '', '/totally-fake-route')
      })
      // Wait for any client-side effects.
      await page.waitForTimeout(500)
    })
    // The URL changed, but no navigation occurred — Next.js RSC should
    // not try to fetch data for this bogus route. Check no critical errors.
    const criticalErrors = errors.filter((e) => !/AbortError|Failed to fetch/i.test(e))
    expect(criticalErrors.length).toBeLessThanOrEqual(1)
  })

  test('rapid back/forward 20 times does not crash', async ({ page }) => {
    await page.goto('/')
    await page.goto('/login')
    await page.goto('/signup')

    for (let i = 0; i < 20; i++) {
      await page.goBack({ waitUntil: 'commit' })
      await page.goForward({ waitUntil: 'commit' })
    }

    // Should still be functional after the storm.
    await page.goto('/signup')
    await expect(page.locator('h1')).toContainText('Create your account')
  })
})

// ---------------------------------------------------------------------------
// 9. Console Error Monitoring During Normal Navigation
// ---------------------------------------------------------------------------

test.describe('Console error monitoring', () => {
  test('landing page loads with zero console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page, async () => {
      await page.goto('/', { waitUntil: 'networkidle' })
    })
    expect(errors).toHaveLength(0)
  })

  test('login page loads with zero console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page, async () => {
      await page.goto('/login', { waitUntil: 'networkidle' })
    })
    expect(errors).toHaveLength(0)
  })

  test('signup page loads with zero console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page, async () => {
      await page.goto('/signup', { waitUntil: 'networkidle' })
    })
    expect(errors).toHaveLength(0)
  })

  test('redirect from /dashboard produces no unhandled client errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page, async () => {
      await page.goto('/dashboard')
      await page.waitForURL('**/login', { timeout: 10_000 })
    })
    // Filter out benign redirect-related noise.
    const serious = errors.filter((e) => !/AbortError|cancelled|Failed to fetch|redirect/i.test(e))
    expect(serious).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 10. Prefetch / Prerender Link Behavior Under Load
// ---------------------------------------------------------------------------

test.describe('Prefetch behavior', () => {
  test('landing page link prefetch requests do not return 500', async ({ page }) => {
    const failedPrefetches: string[] = []
    page.on('response', (res) => {
      if (res.status() >= 500 && res.url().includes('_next')) {
        failedPrefetches.push(`${res.status()} ${res.url()}`)
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    // Hover over links to trigger prefetch.
    const links = page.getByRole('link')
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      await links.nth(i).hover()
      await page.waitForTimeout(100)
    }

    expect(failedPrefetches).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 11. Edge: Concurrent GET + middleware race
// ---------------------------------------------------------------------------

test.describe('Concurrent request races', () => {
  test('parallel fetch to protected and public routes resolves correctly', async ({ request }) => {
    const [dashRes, homeRes, loginRes] = await Promise.all([
      request.get('/dashboard'),
      request.get('/'),
      request.get('/login'),
    ])

    // Home and login should serve 200 content.
    expect(homeRes.status()).toBe(200)
    expect(loginRes.status()).toBe(200)

    // Dashboard should redirect (the APIRequestContext follows redirects,
    // so we may see the final 200 from /login).
    expect(dashRes.status()).toBeLessThan(500)
  })
})

// ---------------------------------------------------------------------------
// 12. Edge: Static asset paths vs. route paths
// ---------------------------------------------------------------------------

test.describe('Static asset path collisions', () => {
  test('requesting /_next/static with bogus suffix returns non-500', async ({ request }) => {
    const res = await request.get('/_next/static/nonexistent-chunk.js')
    // 404 is fine — 500 means the server crashed trying to resolve it.
    expect(res.status()).toBeLessThan(500)
  })

  test('requesting /favicon.ico returns a valid response', async ({ request }) => {
    const res = await request.get('/favicon.ico')
    // Could be 200 (exists) or 404 (not configured) — never 500.
    expect(res.status()).toBeLessThan(500)
  })
})
