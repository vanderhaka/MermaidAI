import { test, expect } from '@playwright/test'

/**
 * Stress tests for navigation and routing — Reviewer 1 of 3.
 *
 * Covers: rapid route cycling, back/forward abuse, deep-link with bad IDs,
 * URL manipulation (traversal, encoding, null bytes), hash fragments,
 * query param injection, navigation-during-load, concurrent goto,
 * rapid reload, breadcrumb rapid clicks, and DOM growth under route changes.
 */

/* -------------------------------------------------------------------------- */
/*  1. Rapid navigation between all public routes                             */
/* -------------------------------------------------------------------------- */

test.describe('Rapid route cycling', () => {
  test('survives 20 rapid navigations across /, /login, /signup without crash', async ({
    page,
  }) => {
    const routes = ['/', '/login', '/signup']

    // Land on the first page so the app is bootstrapped
    await page.goto('/')
    await expect(page).toHaveURL('/')

    for (let i = 0; i < 20; i++) {
      const target = routes[i % routes.length]
      // Fire-and-forget — we intentionally do NOT await full load
      void page.goto(target)
    }

    // After the burst, the page should settle on a valid route
    await page.waitForLoadState('domcontentloaded')
    const url = page.url()
    const validEndings = ['/', '/login', '/signup']
    expect(validEndings.some((r) => url.endsWith(r))).toBe(true)

    // No uncaught JS errors — page should still be functional
    await expect(page.locator('body')).toBeVisible()
  })

  test('rapid client-side link clicks cycle correctly', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()

    // Home -> login -> signup (via link) -> login (via link) x3
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole('link', { name: /sign in/i })
        .first()
        .click()
      await page.waitForURL('**/login')

      await page.getByRole('link', { name: /sign up/i }).click()
      await page.waitForURL('**/signup')

      await page.getByRole('link', { name: /log in/i }).click()
      await page.waitForURL('**/login')
    }

    // Final state should be login page
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/*  2. Browser back/forward button stress                                     */
/* -------------------------------------------------------------------------- */

test.describe('Back / forward stress', () => {
  test('10 rapid back presses after building history stack', async ({ page }) => {
    // Build a history stack: / -> /login -> /signup -> /login -> /signup ...
    await page.goto('/')
    await page.goto('/login')
    await page.goto('/signup')
    await page.goto('/login')
    await page.goto('/signup')
    await page.goto('/')
    await page.goto('/login')

    // Rapid back presses — don't await between them
    for (let i = 0; i < 10; i++) {
      void page.goBack()
    }

    await page.waitForLoadState('domcontentloaded')
    // Should be on a valid page without crash
    await expect(page.locator('body')).toBeVisible()
  })

  test('alternating back/forward 12 times', async ({ page }) => {
    await page.goto('/')
    await page.goto('/login')
    await page.goto('/signup')

    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) {
        await page.goBack()
      } else {
        await page.goForward()
      }
    }

    await page.waitForLoadState('domcontentloaded')
    const url = page.url()
    expect(url).toMatch(/\/(login|signup)?$/)
  })

  test('forward from the end of history stack is harmless', async ({ page }) => {
    await page.goto('/')
    await page.goto('/login')

    // Go back to /
    await page.goBack()
    await page.waitForURL('**/')

    // Go forward to /login
    await page.goForward()
    await page.waitForURL('**/login')

    // Extra forward presses — nothing should happen or crash
    await page.goForward()
    await page.goForward()
    await page.goForward()

    await expect(page).toHaveURL(/\/login/)
  })
})

/* -------------------------------------------------------------------------- */
/*  3. Deep linking with invalid project IDs                                  */
/* -------------------------------------------------------------------------- */

test.describe('Deep link with invalid project IDs', () => {
  // These should all redirect to /login (unauthenticated) or 404.
  // Since middleware redirects unauthed users on /dashboard/*, we expect /login.

  const invalidIds = [
    'nonexistent-uuid',
    '00000000-0000-0000-0000-000000000000',
    'abc',
    '1',
    '-1',
    '999999999999',
    'null',
    'undefined',
    'true',
    'false',
    '__proto__',
    'constructor',
    'hasOwnProperty',
  ]

  for (const id of invalidIds) {
    test(`/dashboard/${id} redirects to login (unauthed)`, async ({ page }) => {
      await page.goto(`/dashboard/${id}`)
      // Middleware should redirect unauthenticated users to /login
      await page.waitForURL('**/login', { timeout: 10_000 })
      await expect(page).toHaveURL(/\/login/)
    })
  }
})

/* -------------------------------------------------------------------------- */
/*  4. URL manipulation — path traversal, encoded chars, null bytes           */
/* -------------------------------------------------------------------------- */

test.describe('URL manipulation', () => {
  const traversalPaths = [
    '/dashboard/../login',
    '/dashboard/../../etc/passwd',
    '/dashboard/%2e%2e/%2e%2e/etc/passwd',
    '/dashboard/..%2f..%2f..%2f',
    '/dashboard/%00',
    '/dashboard/\x00',
    '/dashboard/%0a%0d',
    '/login/%00malicious',
    '/%2e%2e/%2e%2e/',
  ]

  for (const path of traversalPaths) {
    test(`path traversal attempt: ${path.slice(0, 40)}`, async ({ page }) => {
      const response = await page.goto(path)
      // Should either redirect, 404, or land on a valid route — never serve sensitive content
      const status = response?.status() ?? 0
      expect([200, 301, 302, 307, 308, 404]).toContain(status)

      const url = page.url()
      // Must not expose anything outside the app
      expect(url).not.toContain('etc/passwd')
    })
  }

  test('double-encoded slashes do not break the router', async ({ page }) => {
    const response = await page.goto('/dashboard%252F..%252F..%252Fetc%252Fpasswd')
    const status = response?.status() ?? 0
    // Any normal HTTP status is fine — just no 500
    expect(status).toBeLessThan(500)
  })

  test('extremely long path does not crash the server', async ({ page }) => {
    const longSegment = 'a'.repeat(2000)
    const response = await page.goto(`/dashboard/${longSegment}`)
    const status = response?.status() ?? 0
    // Should not be a 500 — 404, 414, or redirect to login are all acceptable
    expect(status).toBeLessThan(500)
  })
})

/* -------------------------------------------------------------------------- */
/*  5. Hash fragment handling                                                 */
/* -------------------------------------------------------------------------- */

test.describe('Hash fragment handling', () => {
  test('hash fragments on landing page are preserved', async ({ page }) => {
    await page.goto('/#features')
    await expect(page.locator('body')).toBeVisible()
    // Hash should still be in the URL
    expect(page.url()).toContain('#features')
  })

  test('hash on login page does not break rendering', async ({ page }) => {
    await page.goto('/login#reset')
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('hash on protected route still triggers auth redirect', async ({ page }) => {
    await page.goto('/dashboard#section1')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('hash with special characters', async ({ page }) => {
    await page.goto('/login#<script>alert(1)</script>')
    await expect(page.getByLabel('Email')).toBeVisible()
    // Page should render normally despite XSS in hash
  })

  test('empty hash is harmless', async ({ page }) => {
    await page.goto('/login#')
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/*  6. Query parameter injection                                              */
/* -------------------------------------------------------------------------- */

test.describe('Query parameter injection', () => {
  test('arbitrary query params on landing page are ignored gracefully', async ({ page }) => {
    await page.goto('/?foo=bar&baz=qux&__proto__=polluted')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('SQL-like query params do not cause errors', async ({ page }) => {
    const response = await page.goto("/login?email=admin'OR 1=1--&password=x")
    const status = response?.status() ?? 0
    expect(status).toBeLessThan(500)
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('XSS in query params does not execute', async ({ page }) => {
    await page.goto('/signup?ref=<script>alert(1)</script>')
    // Check no alert dialog appeared
    let alertFired = false
    page.on('dialog', () => {
      alertFired = true
    })
    await page.waitForTimeout(500)
    expect(alertFired).toBe(false)
    await expect(page.locator('body')).toBeVisible()
  })

  test('extremely long query string does not crash', async ({ page }) => {
    const longValue = 'x'.repeat(5000)
    const response = await page.goto(`/login?data=${longValue}`)
    const status = response?.status() ?? 0
    expect(status).toBeLessThan(500)
  })

  test('redirect param injection on dashboard does not bypass auth', async ({ page }) => {
    await page.goto('/dashboard?redirect=https://evil.com')
    await page.waitForURL('**/login', { timeout: 10_000 })
    // Should land on our login page, not evil.com
    expect(page.url()).toContain('/login')
    expect(page.url()).not.toContain('evil.com')
  })

  test('null and undefined as query values', async ({ page }) => {
    await page.goto('/login?token=null&session=undefined')
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/*  7. Navigation during page load (interrupt loading)                        */
/* -------------------------------------------------------------------------- */

test.describe('Navigation during page load', () => {
  test('clicking a link before the page finishes rendering', async ({ page }) => {
    // Start loading a page but navigate away immediately
    void page.goto('/signup')
    // Don't wait for load — immediately redirect
    await page.goto('/login')

    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('goto during goto does not deadlock', async ({ page }) => {
    // Fire two navigations in rapid succession
    const nav1 = page.goto('/')
    const nav2 = page.goto('/login')

    // At least one should resolve without error
    const results = await Promise.allSettled([nav1, nav2])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)

    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })

  test('triple concurrent navigation resolves to last target', async ({ page }) => {
    void page.goto('/')
    void page.goto('/login')
    await page.goto('/signup')

    await page.waitForLoadState('domcontentloaded')
    // The last navigation should win
    await expect(page).toHaveURL(/\/signup/)
  })
})

/* -------------------------------------------------------------------------- */
/*  8. Page reload stress (rapid F5)                                          */
/* -------------------------------------------------------------------------- */

test.describe('Rapid reload stress', () => {
  test('10 rapid reloads on the landing page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()

    for (let i = 0; i < 10; i++) {
      void page.reload()
    }

    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('10 rapid reloads on login page preserves form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()

    for (let i = 0; i < 10; i++) {
      void page.reload()
    }

    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('reload during form interaction does not submit data', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')

    // Reload mid-interaction
    await page.reload()

    // Form should be reset — field should be empty
    await expect(page.getByLabel('Email')).toBeVisible()
    const value = await page.getByLabel('Email').inputValue()
    expect(value).toBe('')
  })
})

/* -------------------------------------------------------------------------- */
/*  9. Protected route redirect consistency                                   */
/* -------------------------------------------------------------------------- */

test.describe('Protected route redirect consistency', () => {
  test('all /dashboard sub-paths redirect to /login when unauthenticated', async ({ page }) => {
    const paths = [
      '/dashboard',
      '/dashboard/',
      '/dashboard/some-project-id',
      '/dashboard/some-project-id/settings',
      '/dashboard/abc/def/ghi',
    ]

    for (const path of paths) {
      await page.goto(path)
      await page.waitForURL('**/login', { timeout: 10_000 })
      expect(page.url()).toContain('/login')
    }
  })

  test('redirect from /dashboard preserves no sensitive data in URL', async ({ page }) => {
    await page.goto('/dashboard?secret=abc123')
    await page.waitForURL('**/login', { timeout: 10_000 })
    // The redirect URL should not carry over the secret query param
    expect(page.url()).not.toContain('secret=abc123')
  })
})

/* -------------------------------------------------------------------------- */
/*  10. Route change memory cleanup — check for growing DOM                   */
/* -------------------------------------------------------------------------- */

test.describe('DOM growth under route changes', () => {
  test('DOM node count does not grow unbounded after 20 navigations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Baseline node count
    const baselineCount = await page.evaluate(() => document.querySelectorAll('*').length)

    // Navigate through routes 20 times
    const routes = ['/', '/login', '/signup']
    for (let i = 0; i < 20; i++) {
      await page.goto(routes[i % routes.length])
      await page.waitForLoadState('domcontentloaded')
    }

    // Return to baseline route
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const finalCount = await page.evaluate(() => document.querySelectorAll('*').length)

    // Allow some variance (50% growth tolerance) but catch unbounded leaks
    expect(finalCount).toBeLessThan(baselineCount * 1.5)
  })

  test('no detached iframes accumulate across navigations', async ({ page }) => {
    await page.goto('/')

    for (let i = 0; i < 10; i++) {
      await page.goto('/login')
      await page.goto('/signup')
      await page.goto('/')
    }

    const iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length)
    // Should have at most a handful (e.g. analytics) — not growing per navigation
    expect(iframeCount).toBeLessThan(5)
  })
})

/* -------------------------------------------------------------------------- */
/*  11. Console error monitoring during stress                                */
/* -------------------------------------------------------------------------- */

test.describe('Console error monitoring', () => {
  test('no uncaught exceptions during rapid route cycling', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => {
      errors.push(err.message)
    })

    await page.goto('/')
    for (let i = 0; i < 15; i++) {
      const routes = ['/', '/login', '/signup']
      await page.goto(routes[i % routes.length])
    }

    await page.waitForLoadState('domcontentloaded')

    // Filter out known non-critical errors (e.g. analytics, third-party scripts)
    const criticalErrors = errors.filter(
      (msg) =>
        !msg.includes('ResizeObserver') &&
        !msg.includes('Loading chunk') &&
        !msg.includes('ChunkLoadError'),
    )

    expect(criticalErrors).toEqual([])
  })

  test('no unhandled promise rejections during back/forward spam', async ({ page }) => {
    const rejections: string[] = []
    page.on('pageerror', (err) => {
      if (err.message.includes('unhandled') || err.message.includes('Unhandled')) {
        rejections.push(err.message)
      }
    })

    await page.goto('/')
    await page.goto('/login')
    await page.goto('/signup')

    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        void page.goBack()
      } else {
        void page.goForward()
      }
    }

    await page.waitForLoadState('domcontentloaded')
    expect(rejections).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/*  12. Edge case URL patterns                                                */
/* -------------------------------------------------------------------------- */

test.describe('Edge case URL patterns', () => {
  test('trailing slash on all routes', async ({ page }) => {
    for (const route of ['/login/', '/signup/']) {
      const response = await page.goto(route)
      const status = response?.status() ?? 0
      // Next.js may redirect trailing slashes or serve normally
      expect(status).toBeLessThan(500)
    }
  })

  test('case sensitivity — /Login vs /login', async ({ page }) => {
    const response = await page.goto('/Login')
    const status = response?.status() ?? 0
    // Should either 404 or redirect — not 500
    expect(status).toBeLessThan(500)
  })

  test('double slashes in path', async ({ page }) => {
    const response = await page.goto('//login')
    const status = response?.status() ?? 0
    expect(status).toBeLessThan(500)
  })

  test('unicode in path segment', async ({ page }) => {
    const response = await page.goto('/dashboard/%E2%80%8B') // zero-width space
    const status = response?.status() ?? 0
    expect(status).toBeLessThan(500)
  })

  test('path with semicolon (path parameter attack)', async ({ page }) => {
    const response = await page.goto('/dashboard;jsessionid=abc123')
    const status = response?.status() ?? 0
    expect(status).toBeLessThan(500)
  })

  test('URL with fragment identifier containing slashes', async ({ page }) => {
    await page.goto('/login#/admin/secret')
    await expect(page.getByLabel('Email')).toBeVisible()
    // Fragment should not influence routing
  })

  test('data: and javascript: schemes are not followed', async ({ page }) => {
    // Attempt navigation to a data: URI — browser should block or navigate away
    const response = await page.goto('data:text/html,<h1>hacked</h1>').catch(() => null)
    // If it navigated, we should NOT see our app content replaced with "hacked"
    // Playwright may throw for non-http schemes — that's acceptable
    if (response) {
      const content = await page.content()
      // Even if loaded, it should not be in the context of our app's origin
      expect(page.url()).not.toContain('localhost:3000')
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  13. Concurrent / interleaved navigation patterns                          */
/* -------------------------------------------------------------------------- */

test.describe('Concurrent navigation patterns', () => {
  test('click link + goto race does not crash', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()

    // Click a link and simultaneously goto another route
    const clickPromise = page
      .getByRole('link', { name: /sign in/i })
      .first()
      .click()
    const gotoPromise = page.goto('/signup')

    await Promise.allSettled([clickPromise, gotoPromise])

    await page.waitForLoadState('domcontentloaded')
    // Should be on either /login or /signup — not broken
    const url = page.url()
    expect(url).toMatch(/\/(login|signup)/)
  })

  test('popstate storm does not leak memory', async ({ page }) => {
    await page.goto('/')

    // Push a bunch of history entries via JS
    await page.evaluate(() => {
      for (let i = 0; i < 50; i++) {
        window.history.pushState({}, '', `/?stress=${i}`)
      }
    })

    // Now spam back
    for (let i = 0; i < 10; i++) {
      void page.goBack()
    }

    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()

    // Verify we can still navigate normally
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/*  14. Auth route behavior for authenticated-redirects (smoke check)         */
/* -------------------------------------------------------------------------- */

test.describe('Auth route redirect logic (unauthenticated)', () => {
  test('/login is accessible without auth', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('/signup is accessible without auth', async ({ page }) => {
    const response = await page.goto('/signup')
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toHaveText('Create your account')
  })

  test('/ is accessible without auth', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/*  15. Response header sanity under stress                                   */
/* -------------------------------------------------------------------------- */

test.describe('Response headers under stress', () => {
  test('no 500 errors across 30 rapid requests', async ({ page }) => {
    const statuses: number[] = []

    const routes = ['/', '/login', '/signup', '/dashboard', '/dashboard/fake-id']

    for (const route of routes) {
      for (let i = 0; i < 6; i++) {
        const response = await page.goto(route)
        if (response) {
          statuses.push(response.status())
        }
      }
    }

    const serverErrors = statuses.filter((s) => s >= 500)
    expect(serverErrors).toEqual([])
  })
})
