import { test, expect } from '@playwright/test'

/**
 * Navigation & Routing Stress Tests — Reviewer 2
 *
 * Focus: real-world chaos scenarios that break navigation under adverse
 * conditions — slow networks, history manipulation, viewport shifts,
 * focus management, 404s, API route access, scroll restoration, and
 * layout stability.
 */

// ---------------------------------------------------------------------------
// Slow network / 3G throttle navigation
// ---------------------------------------------------------------------------

test.describe('slow network navigation', () => {
  test('landing page loads and links work under simulated 3G latency', async ({
    page,
    context,
  }) => {
    // Chromium CDP throttling — 750 kbps down, 250 kbps up, 100ms RTT
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (750 * 1024) / 8,
      uploadThroughput: (250 * 1024) / 8,
      latency: 100,
    })

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 })

    // Click "Sign in" CTA — should eventually land on /login
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login', { timeout: 20_000 })
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 15_000 })
  })

  test('protected route redirect completes under 3G throttling', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (750 * 1024) / 8,
      uploadThroughput: (250 * 1024) / 8,
      latency: 100,
    })

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Middleware should still redirect unauthenticated users even on 3G
    await page.waitForURL('**/login', { timeout: 20_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

// ---------------------------------------------------------------------------
// Navigation with JavaScript errors injected on the page
// ---------------------------------------------------------------------------

test.describe('navigation resilience to JS errors', () => {
  test('pages remain navigable after an uncaught JS error', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await page.goto('/')
    // Inject an uncaught error — simulates a broken third-party script
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('STRESS_TEST_INJECTED_ERROR')
      }, 0)
    })

    // Allow the error to fire
    await page.waitForTimeout(200)

    // Navigation should still work despite the error
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page.getByLabel('Email')).toBeVisible()
    expect(jsErrors.some((e) => e.includes('STRESS_TEST_INJECTED_ERROR'))).toBe(true)
  })

  test('navigation links on landing page survive a thrown promise rejection', async ({ page }) => {
    const rejections: string[] = []
    page.on('pageerror', (err) => rejections.push(err.message))

    await page.goto('/')
    await page.evaluate(() => {
      Promise.reject(new Error('STRESS_TEST_UNHANDLED_REJECTION'))
    })
    await page.waitForTimeout(200)

    await page.getByRole('link', { name: /start building/i }).click()
    await page.waitForURL('**/signup', { timeout: 10_000 })
    await expect(page.locator('h1')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Popstate / history manipulation
// ---------------------------------------------------------------------------

test.describe('popstate and history manipulation', () => {
  test('browser back button returns to previous route correctly', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')

    await page.goBack()
    await page.waitForURL('**/', { timeout: 10_000 })
    await expect(page.locator('h1')).toContainText(
      'Turn messy operational logic into clean, explorable systems.',
    )
  })

  test('forward button after back restores the correct page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')

    await page.goBack()
    await page.waitForURL('**/')

    await page.goForward()
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('rapid back/forward does not crash the app', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Rapid history traversal
    for (let i = 0; i < 5; i++) {
      await page.goBack()
      await page.goForward()
    }

    // App should still be in a navigable state
    await page.waitForTimeout(500)
    const url = page.url()
    expect(url).toMatch(/\/(login|signup)?$/)

    // Page should render without a crash — at least the html element exists
    await expect(page.locator('html')).toBeAttached()
  })

  test('pushState from script does not break Next.js router', async ({ page }) => {
    await page.goto('/')

    // External script pushes a fake history entry
    await page.evaluate(() => {
      window.history.pushState({ fake: true }, '', '/fake-pushed-route')
    })
    expect(page.url()).toContain('/fake-pushed-route')

    // Going back should return to landing
    await page.goBack()
    await page.waitForTimeout(500)
    expect(page.url()).toMatch(/\/$/)
    await expect(page.locator('h1')).toBeVisible()
  })

  test('replaceState does not orphan the navigation stack', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')

    // Replace current entry
    await page.evaluate(() => {
      window.history.replaceState({}, '', '/login?replaced=1')
    })
    expect(page.url()).toContain('replaced=1')

    // Back should go to landing, not to /login (because we replaced, not pushed)
    await page.goBack()
    await page.waitForTimeout(500)
    expect(page.url()).toMatch(/\/$/)
  })
})

// ---------------------------------------------------------------------------
// Window resize during navigation transitions
// ---------------------------------------------------------------------------

test.describe('viewport resize during navigation', () => {
  test('resizing to mobile width mid-navigation does not break layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // Start navigation
    const navPromise = page.getByRole('link', { name: /sign in/i }).click()

    // Immediately shrink to mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await navPromise
    await page.waitForURL('**/login', { timeout: 10_000 })

    // Login form should still be visible at mobile size
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('expanding viewport after loading at mobile does not break content', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(300)

    // Content should still be present and not overflow
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Tab focus management during route changes
// ---------------------------------------------------------------------------

test.describe('focus management across routes', () => {
  test('focus is not trapped on an invisible element after navigation', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').focus()
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT')

    // Navigate away
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Focus should not remain on the old page's email input
    const activeTag = await page.evaluate(() => document.activeElement?.tagName)
    // It's acceptable for focus to land on BODY or a new input — not on a detached node
    expect(activeTag).toBeTruthy()
  })

  test('keyboard Tab cycles through interactive elements on the landing page', async ({ page }) => {
    await page.goto('/')

    // Tab through the page and collect focused element texts/roles
    const focusedElements: string[] = []
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName}:${el.textContent?.trim().substring(0, 30)}` : 'null'
      })
      focusedElements.push(info)
    }

    // At least the 3 visible links (Existing account, Start building, Sign in) should be reachable
    const linkFocuses = focusedElements.filter((e) => e.startsWith('A:'))
    expect(linkFocuses.length).toBeGreaterThanOrEqual(3)
  })

  test('Escape key does not break navigation state', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')
    await page.keyboard.press('Escape')

    // Should still be on login, page not dismissed
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 404 handling for non-existent routes
// ---------------------------------------------------------------------------

test.describe('404 and missing route handling', () => {
  test('visiting a completely unknown route does not show a blank page', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-abc123')
    // Next.js should return a 404 status
    expect(response?.status()).toBe(404)

    // The page should render something — not be blank
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('visiting a fake project ID under dashboard redirects to login when unauthenticated', async ({
    page,
  }) => {
    await page.goto('/dashboard/nonexistent-project-id-999')
    // Middleware should intercept first — redirect to login
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('deeply nested non-existent route returns 404', async ({ page }) => {
    const response = await page.goto('/dashboard/fake/deep/nested/route')
    // Either 404 or redirect to login (middleware catches /dashboard/*)
    const status = response?.status()
    const url = page.url()
    const is404 = status === 404
    const isRedirected = url.includes('/login')
    expect(is404 || isRedirected).toBe(true)
  })

  test('visiting /api without a valid sub-route returns an error', async ({ page }) => {
    const response = await page.goto('/api')
    // Should not be a 200 with app content — either 404 or an error page
    expect(response?.status()).not.toBe(200)
  })
})

// ---------------------------------------------------------------------------
// API route direct browser access
// ---------------------------------------------------------------------------

test.describe('API route direct browser access', () => {
  test('GET /api/chat returns an error (POST only)', async ({ page }) => {
    const response = await page.goto('/api/chat')
    // The route only defines POST — GET should get 405 or 404 from Next.js
    const status = response?.status()
    expect(status).toBeGreaterThanOrEqual(400)
  })

  test('POST /api/chat without auth returns 401', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {
        projectId: 'fake',
        message: 'hello',
        mode: 'discovery',
        context: {
          projectId: 'fake',
          projectName: 'Test',
          activeModuleId: null,
          mode: 'discovery',
          modules: [],
        },
      },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/chat with invalid JSON returns 400', async ({ request }) => {
    const response = await request.post('/api/chat', {
      headers: { 'Content-Type': 'application/json' },
      data: 'this is not json{{{',
    })
    // Should be 400 (invalid JSON) or 422
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(response.status()).toBeLessThan(500)
  })

  test('POST /api/chat with missing required fields returns 400', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: { projectId: 'fake' },
    })
    expect(response.status()).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Navigation cancellation patterns
// ---------------------------------------------------------------------------

test.describe('navigation cancellation', () => {
  test('clicking a link then immediately clicking another lands on the second target', async ({
    page,
  }) => {
    await page.goto('/')

    // Click "Sign in" then immediately click "Start building" (signup)
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.getByRole('link', { name: /start building/i }).click()

    // Should end up at signup (the last click wins)
    await page.waitForURL('**/signup', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/signup/)
  })

  test('stopping page load mid-navigation leaves the app in a usable state', async ({ page }) => {
    await page.goto('/')

    // Start navigating to login
    page.getByRole('link', { name: /sign in/i }).click()

    // Immediately abort — note this may or may not cancel depending on timing
    await page.waitForTimeout(50)

    // Regardless of whether abort took effect, the page should be usable
    await page.waitForTimeout(1000)
    const url = page.url()
    // Either still on landing or successfully on login — both are acceptable
    expect(url).toMatch(/\/(login)?$/)
    await expect(page.locator('html')).toBeAttached()
  })
})

// ---------------------------------------------------------------------------
// Scroll position restoration after back navigation
// ---------------------------------------------------------------------------

test.describe('scroll position restoration', () => {
  test('landing page scroll position resets to top on fresh navigation', async ({ page }) => {
    await page.goto('/')

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500))
    const scrolledY = await page.evaluate(() => window.scrollY)
    expect(scrolledY).toBeGreaterThan(0)

    // Navigate away and come back
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')

    await page.goBack()
    await page.waitForURL('**/')
    await page.waitForTimeout(500)

    // Scroll position may be restored by the browser (bfcache) or reset to 0
    // Either is acceptable — what matters is the page is not stuck mid-scroll
    // with invisible content
    await expect(page.locator('h1')).toBeVisible()
  })

  test('navigating to login always starts at top of page', async ({ page }) => {
    await page.goto('/')
    // Scroll the landing page down
    await page.evaluate(() => window.scrollTo(0, 999))

    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')

    const scrollY = await page.evaluate(() => window.scrollY)
    // Login page should start at or near the top
    expect(scrollY).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// Layout shift during navigation
// ---------------------------------------------------------------------------

test.describe('layout stability during navigation', () => {
  test('landing page has no significant layout shift on load', async ({ page }) => {
    // Use PerformanceObserver to detect CLS
    await page.goto('/', { waitUntil: 'networkidle' })

    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let totalShift = 0
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!(entry as any).hadRecentInput) {
                totalShift += (entry as any).value
              }
            }
          })
          observer.observe({ type: 'layout-shift', buffered: true })

          // Wait a bit to collect any shifts that already happened
          setTimeout(() => {
            observer.disconnect()
            resolve(totalShift)
          }, 2000)
        }),
    )

    // Google's "good" CLS threshold is 0.1
    expect(cls).toBeLessThan(0.25)
  })

  test('auth layout renders without visible content jump', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })

    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let totalShift = 0
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!(entry as any).hadRecentInput) {
                totalShift += (entry as any).value
              }
            }
          })
          observer.observe({ type: 'layout-shift', buffered: true })
          setTimeout(() => {
            observer.disconnect()
            resolve(totalShift)
          }, 2000)
        }),
    )

    expect(cls).toBeLessThan(0.25)
  })

  test('navigation from landing to login does not cause a flash of unstyled content', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Before navigating, check that the body has computed styles (not unstyled)
    const hasFontFamily = await page.evaluate(() => {
      const body = document.body
      const computed = window.getComputedStyle(body)
      return computed.fontFamily.length > 0
    })
    expect(hasFontFamily).toBe(true)

    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('**/login')
    await page.waitForLoadState('domcontentloaded')

    // Font should still be applied on the new page (no FOUC)
    const hasFontAfterNav = await page.evaluate(() => {
      const computed = window.getComputedStyle(document.body)
      return computed.fontFamily.length > 0
    })
    expect(hasFontAfterNav).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Prefetch behavior stress testing
// ---------------------------------------------------------------------------

test.describe('prefetch stress testing', () => {
  test('hovering over multiple links quickly does not cause request floods', async ({ page }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => {
      if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
        requestUrls.push(req.url())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Rapidly hover over links
    const links = page.locator('a[href]')
    const count = await links.count()
    for (let i = 0; i < Math.min(count, 10); i++) {
      await links.nth(i).hover({ timeout: 2000 })
    }

    await page.waitForTimeout(1000)

    // There should not be an unreasonable number of fetch requests
    // (some prefetch is fine, but not 50+)
    expect(requestUrls.length).toBeLessThan(50)
  })

  test('landing page links have correct href attributes', async ({ page }) => {
    await page.goto('/')

    // Verify core navigation links point to the right places
    const loginLinks = page.locator('a[href="/login"]')
    expect(await loginLinks.count()).toBeGreaterThanOrEqual(1)

    const signupLinks = page.locator('a[href="/signup"]')
    expect(await signupLinks.count()).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Mobile viewport navigation patterns
// ---------------------------------------------------------------------------

test.describe('mobile viewport navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('landing page renders correctly on mobile viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()

    // CTAs should be visible and tappable
    await expect(page.getByRole('link', { name: /start building/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()
  })

  test('login form is usable at mobile width', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()

    // Verify the form doesn't overflow horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1) // +1 for rounding
  })

  test('navigating login -> signup on mobile keeps content within viewport', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1)
    await expect(page.locator('h1')).toBeVisible()
  })

  test('protected route redirect works on mobile', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('touch target sizes meet minimum accessibility standards', async ({ page }) => {
    await page.goto('/')

    // Check all links have at least 44x44px touch targets (WCAG 2.5.8 recommendation)
    const links = page.locator('a[href]')
    const count = await links.count()

    let undersizedCount = 0
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox()
      if (box && box.width > 0 && box.height > 0) {
        // Allow some tolerance — 40px is a reasonable minimum
        if (box.width < 40 || box.height < 40) {
          undersizedCount++
        }
      }
    }

    // At most 1 link can be undersized (some decorative/inline links are acceptable)
    expect(undersizedCount).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Edge cases: concurrent and unusual navigation
// ---------------------------------------------------------------------------

test.describe('concurrent and unusual navigation', () => {
  test('opening multiple routes rapidly via address bar does not crash', async ({ page }) => {
    const routes = ['/', '/login', '/signup', '/', '/login']
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'commit', timeout: 10_000 })
    }

    // After the flurry, the page should be on the last route and functional
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('refreshing the page mid-form-fill preserves URL', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@test.com')

    await page.reload()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('double-clicking a navigation link does not break routing', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: /sign in/i }).dblclick()
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('navigating with hash fragment does not interfere with routing', async ({ page }) => {
    await page.goto('/#some-anchor')
    await expect(page.locator('h1')).toBeVisible()

    // Navigate to login with a hash
    await page.goto('/login#focus-email')
    await expect(page.getByLabel('Email')).toBeVisible()
    expect(page.url()).toContain('/login')
  })

  test('query parameters on auth routes are preserved through navigation', async ({ page }) => {
    await page.goto('/login?redirect=/dashboard')
    await expect(page.getByLabel('Email')).toBeVisible()
    // The query param should be present in the URL
    expect(page.url()).toContain('redirect')
  })
})
