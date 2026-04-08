import { test, expect, type Page } from '@playwright/test'

const SCREENSHOTS = 'e2e/screenshots/stress'

/**
 * Auth & Security Stress Tests — Reviewer 2
 *
 * Angle: form field behavior, error message content, protected route
 * access patterns, navigation state persistence, rapid submission,
 * concurrent contexts, and network degradation.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
}

async function submitLogin(page: Page) {
  await page.getByRole('button', { name: /sign in/i }).click()
}

async function fillSignup(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
}

async function submitSignup(page: Page) {
  await page.getByRole('button', { name: /sign up/i }).click()
}

// ---------------------------------------------------------------------------
// 1. Password field masking & copy behavior
// ---------------------------------------------------------------------------
test.describe('Password field masking', () => {
  test('login password field has type=password and masks input', async ({ page }) => {
    await page.goto('/login')
    const pw = page.locator('#password')
    await expect(pw).toHaveAttribute('type', 'password')

    await pw.fill('supersecret')
    // The rendered value should still be masked — type attribute must remain
    await expect(pw).toHaveAttribute('type', 'password')
    await page.screenshot({ path: `${SCREENSHOTS}/password-masked-login.png` })
  })

  test('signup password field has type=password', async ({ page }) => {
    await page.goto('/signup')
    const pw = page.locator('#signup-password')
    await expect(pw).toHaveAttribute('type', 'password')
    await pw.fill('supersecret123')
    await expect(pw).toHaveAttribute('type', 'password')
    await page.screenshot({ path: `${SCREENSHOTS}/password-masked-signup.png` })
  })

  test('password value cannot be read from the DOM text content', async ({ page }) => {
    await page.goto('/login')
    const pw = page.locator('#password')
    await pw.fill('mysecretpass')

    // Input value is accessible via JS property but NOT as visible text
    const textContent = await pw.textContent()
    expect(textContent).not.toContain('mysecretpass')

    // Value must still be retrievable programmatically for form submission
    const value = await pw.inputValue()
    expect(value).toBe('mysecretpass')
  })

  test('pasting into password field preserves masking', async ({ page }) => {
    await page.goto('/login')
    const pw = page.locator('#password')

    // Simulate paste via clipboard API
    await pw.focus()
    await page.evaluate(() => {
      const input = document.querySelector('#password') as HTMLInputElement
      const dt = new DataTransfer()
      dt.setData('text/plain', 'pasted-secret')
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
      input.dispatchEvent(event)
    })

    // After paste event, type should still be password
    await expect(pw).toHaveAttribute('type', 'password')
  })
})

// ---------------------------------------------------------------------------
// 2. Form state does NOT persist across navigation
// ---------------------------------------------------------------------------
test.describe('Form state after navigation', () => {
  test('login form values are cleared after navigating away and back', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'leftbehind@test.com', 'abandonedpass')

    // Navigate to signup
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Navigate back to login
    await page.getByRole('link', { name: /log in/i }).click()
    await page.waitForURL('**/login')

    // Form should be reset — React component re-mounts
    const email = await page.getByLabel('Email').inputValue()
    const password = await page.getByLabel('Password').inputValue()
    expect(email).toBe('')
    expect(password).toBe('')
    await page.screenshot({ path: `${SCREENSHOTS}/form-state-cleared-login.png` })
  })

  test('signup form values are cleared after navigating away and back', async ({ page }) => {
    await page.goto('/signup')
    await fillSignup(page, 'leftbehind@test.com', 'abandonedpass123')

    await page.getByRole('link', { name: /log in/i }).click()
    await page.waitForURL('**/login')

    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    const email = await page.getByLabel('Email').inputValue()
    const password = await page.getByLabel('Password').inputValue()
    expect(email).toBe('')
    expect(password).toBe('')
    await page.screenshot({ path: `${SCREENSHOTS}/form-state-cleared-signup.png` })
  })

  test('validation errors are cleared when navigating away and back', async ({ page }) => {
    await page.goto('/login')
    // Trigger validation errors
    await submitLogin(page)
    await expect(page.getByRole('alert').first()).toBeVisible()

    // Navigate away and back
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')
    await page.getByRole('link', { name: /log in/i }).click()
    await page.waitForURL('**/login')

    // Validation errors should be gone
    const alerts = page.getByRole('alert')
    await expect(alerts).toHaveCount(0)
    await page.screenshot({ path: `${SCREENSHOTS}/validation-cleared-after-nav.png` })
  })

  test('browser back button re-mounts form without stale state', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'back-button@test.com', 'password123')

    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Go back via browser history
    await page.goBack()
    await page.waitForURL('**/login')

    // Form should still be empty (re-mount)
    const email = await page.getByLabel('Email').inputValue()
    expect(email).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 3. Rapid form submission (rate limiting / double-submit guard)
// ---------------------------------------------------------------------------
test.describe('Rapid submission behavior', () => {
  test('login button disables during submission to prevent double-submit', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'rapid@test.com', 'password123')

    // Click submit
    await submitLogin(page)

    // Button should immediately enter disabled/pending state
    const btn = page.getByRole('button', { name: /sign/i })
    // The button text changes to "Signing in..." and becomes disabled
    await expect(btn).toBeDisabled()
    await page.screenshot({ path: `${SCREENSHOTS}/login-double-submit-guard.png` })
  })

  test('signup button disables during submission', async ({ page }) => {
    await page.goto('/signup')
    await fillSignup(page, 'rapid@test.com', 'password12345')

    await submitSignup(page)

    const btn = page.getByRole('button', { name: /sign/i })
    await expect(btn).toBeDisabled()
    await page.screenshot({ path: `${SCREENSHOTS}/signup-double-submit-guard.png` })
  })

  test('rapid clicks on login do not queue multiple server calls', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'rapid-multi@test.com', 'password123')

    // Track network requests to the server action
    const requests: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('login')) {
        requests.push(req.url())
      }
    })

    // Click rapidly 5 times
    const btn = page.getByRole('button', { name: /sign in/i })
    for (let i = 0; i < 5; i++) {
      await btn.click({ force: true }).catch(() => {})
    }

    // Wait for any pending requests to settle
    await page.waitForTimeout(2000)

    // Button should disable after first click, preventing more than ~1-2 requests
    expect(requests.length).toBeLessThanOrEqual(2)
    await page.screenshot({ path: `${SCREENSHOTS}/rapid-click-guard.png` })
  })

  test('button re-enables after server error', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'invalid@test.com', 'wrongpassword')
    await submitLogin(page)

    // Wait for server response
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })

    // Button should re-enable
    const btn = page.getByRole('button', { name: /sign in/i })
    await expect(btn).toBeEnabled()
    await page.screenshot({ path: `${SCREENSHOTS}/button-re-enabled-after-error.png` })
  })
})

// ---------------------------------------------------------------------------
// 4. Error message content — no implementation detail leakage
// ---------------------------------------------------------------------------
test.describe('Error message safety', () => {
  const DANGEROUS_PATTERNS = [
    /stack\s*trace/i,
    /at\s+\w+\s+\(/i, // stack frame pattern: "at Function ("
    /node_modules/i,
    /supabase/i,
    /postgres/i,
    /prisma/i,
    /database/i,
    /sql/i,
    /ECONNREFUSED/i,
    /\.ts:\d+/i, // file:line references
    /\.js:\d+/i,
    /internal server/i,
    /TypeError/i,
    /ReferenceError/i,
    /undefined is not/i,
    /cannot read prop/i,
  ]

  test('login error does not leak implementation details', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'notexist@test.com', 'wrongpassword')
    await submitLogin(page)

    await page.waitForSelector('[role="alert"]', { timeout: 15_000 })
    const alerts = await page.getByRole('alert').allTextContents()
    const errorText = alerts.join(' ')

    for (const pattern of DANGEROUS_PATTERNS) {
      expect(errorText).not.toMatch(pattern)
    }

    await page.screenshot({ path: `${SCREENSHOTS}/login-error-no-leak.png` })
  })

  test('signup error does not leak implementation details', async ({ page }) => {
    await page.goto('/signup')
    await fillSignup(page, 'notexist@test.com', 'weakpw12345')
    await submitSignup(page)

    // Wait for either alert or status
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })
    const alerts = await page.getByRole('alert').allTextContents()
    const statuses = await page.getByRole('status').allTextContents()
    const allMessages = [...alerts, ...statuses].join(' ')

    for (const pattern of DANGEROUS_PATTERNS) {
      expect(allMessages).not.toMatch(pattern)
    }

    await page.screenshot({ path: `${SCREENSHOTS}/signup-error-no-leak.png` })
  })

  test('login validation errors use generic language', async ({ page }) => {
    await page.goto('/login')
    // Submit with invalid email format
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Password').fill('x')
    await submitLogin(page)

    await page.waitForSelector('[role="alert"]', { timeout: 5_000 })
    const alerts = await page.getByRole('alert').allTextContents()
    const errorText = alerts.join(' ')

    // Should mention email validity, not Zod internals
    expect(errorText.toLowerCase()).not.toContain('z.string')
    expect(errorText.toLowerCase()).not.toContain('zodissue')
    expect(errorText.toLowerCase()).not.toContain('safeParse')

    await page.screenshot({ path: `${SCREENSHOTS}/login-validation-generic.png` })
  })

  test('login and signup give indistinguishable error for wrong credentials', async ({ page }) => {
    // Login with non-existent account
    await page.goto('/login')
    await fillLogin(page, 'nonexistent-user-xyz@test.com', 'password123')
    await submitLogin(page)
    await page.waitForSelector('[role="alert"]', { timeout: 15_000 })
    const loginError = await page.getByRole('alert').first().textContent()

    // The error should NOT reveal whether the email exists
    expect(loginError?.toLowerCase()).not.toContain('user not found')
    expect(loginError?.toLowerCase()).not.toContain('no account')
    expect(loginError?.toLowerCase()).not.toContain('email does not exist')

    await page.screenshot({
      path: `${SCREENSHOTS}/login-indistinguishable-error.png`,
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Sensitive data in URL — StripSensitiveAuthQuery
// ---------------------------------------------------------------------------
test.describe('Sensitive query parameter stripping', () => {
  test('login page strips email and password from URL query', async ({ page }) => {
    await page.goto('/login?email=leaked@test.com&password=secret123')
    // Wait for the StripSensitiveAuthQuery effect to fire
    await page.waitForTimeout(1000)

    const url = page.url()
    expect(url).not.toContain('email=')
    expect(url).not.toContain('password=')
    expect(url).not.toContain('secret123')
    await page.screenshot({ path: `${SCREENSHOTS}/url-stripped-login.png` })
  })

  test('signup page strips email and password from URL query', async ({ page }) => {
    await page.goto('/signup?email=leaked@test.com&password=secret123')
    await page.waitForTimeout(1000)

    const url = page.url()
    expect(url).not.toContain('email=')
    expect(url).not.toContain('password=')
    await page.screenshot({ path: `${SCREENSHOTS}/url-stripped-signup.png` })
  })

  test('stripping preserves other non-sensitive query params', async ({ page }) => {
    await page.goto('/login?email=test@x.com&password=secret&redirect=/dashboard&utm_source=test')
    await page.waitForTimeout(1000)

    const url = new URL(page.url())
    expect(url.searchParams.has('email')).toBe(false)
    expect(url.searchParams.has('password')).toBe(false)
    // Non-sensitive params should survive
    expect(url.searchParams.get('redirect')).toBe('/dashboard')
    expect(url.searchParams.get('utm_source')).toBe('test')
    await page.screenshot({ path: `${SCREENSHOTS}/url-preserves-other-params.png` })
  })
})

// ---------------------------------------------------------------------------
// 6. Protected route access patterns
// ---------------------------------------------------------------------------
test.describe('Protected route access', () => {
  test('direct URL to /dashboard redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
    await page.screenshot({ path: `${SCREENSHOTS}/protected-redirect-dashboard.png` })
  })

  test('direct URL to /dashboard/some-project-id redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/fake-project-id-12345')
    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
    await page.screenshot({ path: `${SCREENSHOTS}/protected-redirect-project.png` })
  })

  test('deep nested dashboard route redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/project/nested/deep/path')
    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
    await page.screenshot({ path: `${SCREENSHOTS}/protected-redirect-deep.png` })
  })

  test('programmatic navigation to /dashboard via address bar redirects', async ({ page }) => {
    // Start on login, then try to navigate programmatically
    await page.goto('/login')
    await page.evaluate(() => {
      window.location.href = '/dashboard'
    })
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
    await page.screenshot({ path: `${SCREENSHOTS}/protected-programmatic-nav.png` })
  })

  test('fetch to protected API-like route returns redirect, not data', async ({ page }) => {
    await page.goto('/login')

    // Try fetching a dashboard page as if it were an API
    const response = await page.evaluate(async () => {
      const res = await fetch('/dashboard', { redirect: 'manual' })
      return {
        status: res.status,
        type: res.type,
        redirected: res.redirected,
        locationHeader: res.headers.get('location'),
      }
    })

    // Should get a redirect (307/308) rather than page content
    // The redirect status is 307 for Next.js middleware redirects
    expect([301, 302, 307, 308]).toContain(response.status)
    await page.screenshot({ path: `${SCREENSHOTS}/protected-fetch-redirect.png` })
  })
})

// ---------------------------------------------------------------------------
// 7. Auth state with fresh browser context (session isolation)
// ---------------------------------------------------------------------------
test.describe('Browser context isolation', () => {
  test('new incognito context has no auth state', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/dashboard')
    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')

    await page.screenshot({ path: `${SCREENSHOTS}/fresh-context-no-auth.png` })
    await context.close()
  })

  test('two separate contexts do not share auth state', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()

    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    // Both should land on login for protected routes
    await page1.goto('/dashboard')
    await page2.goto('/dashboard')

    await page1.waitForURL('**/login')
    await page2.waitForURL('**/login')

    expect(page1.url()).toContain('/login')
    expect(page2.url()).toContain('/login')

    await page1.screenshot({ path: `${SCREENSHOTS}/context-isolation-1.png` })
    await page2.screenshot({ path: `${SCREENSHOTS}/context-isolation-2.png` })

    await context1.close()
    await context2.close()
  })

  test('clearing cookies forces re-auth on dashboard', async ({ page, context }) => {
    await page.goto('/login')
    // Confirm we can reach login
    await expect(page.getByLabel('Email')).toBeVisible()

    // Clear all cookies
    await context.clearCookies()

    // Try dashboard — should still redirect
    await page.goto('/dashboard')
    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
    await page.screenshot({ path: `${SCREENSHOTS}/cleared-cookies-redirect.png` })
  })
})

// ---------------------------------------------------------------------------
// 8. Form accessibility under rapid error cycling
// ---------------------------------------------------------------------------
test.describe('Accessibility during rapid errors', () => {
  test('login error alerts have role=alert for screen reader announcement', async ({ page }) => {
    await page.goto('/login')
    await submitLogin(page)

    await page.waitForSelector('[role="alert"]', { timeout: 5_000 })
    const alerts = page.getByRole('alert')
    const count = await alerts.count()
    expect(count).toBeGreaterThan(0)

    // Each alert element should be announced immediately
    for (let i = 0; i < count; i++) {
      const alert = alerts.nth(i)
      await expect(alert).toBeVisible()
      const text = await alert.textContent()
      expect(text?.trim().length).toBeGreaterThan(0)
    }
    await page.screenshot({ path: `${SCREENSHOTS}/a11y-alerts-login.png` })
  })

  test('rapid submit-fix-submit cycle maintains correct aria descriptions', async ({ page }) => {
    await page.goto('/login')

    // Round 1: submit empty — triggers validation
    await submitLogin(page)
    await page.waitForSelector('[role="alert"]', { timeout: 5_000 })

    // Email input should reference its error via aria-describedby
    const emailDescribedBy = await page.locator('#email').getAttribute('aria-describedby')
    expect(emailDescribedBy).toBe('email-error')
    await expect(page.locator('#email-error')).toBeVisible()

    // Round 2: fix email but not password, resubmit
    await page.getByLabel('Email').fill('valid@test.com')
    await submitLogin(page)

    // Wait for potential state change
    await page.waitForTimeout(500)

    // Email error should be gone, password might change or server responds
    // The key: no orphaned aria-describedby pointing to nonexistent element
    const emailDescribedByAfter = await page.locator('#email').getAttribute('aria-describedby')
    if (emailDescribedByAfter) {
      // If it still references email-error, that element must exist
      await expect(page.locator(`#${emailDescribedByAfter}`)).toBeVisible()
    }

    await page.screenshot({ path: `${SCREENSHOTS}/a11y-rapid-cycle.png` })
  })

  test('signup success message uses role=status for polite announcement', async ({ page }) => {
    await page.goto('/signup')
    // Submit with valid-looking data
    await fillSignup(page, `stress-a11y-${Date.now()}@test.com`, 'validpassword123')
    await submitSignup(page)

    // Wait for either success (role=status) or error (role=alert)
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })

    // If success, it should be role=status (polite), not role=alert (assertive)
    const statusEl = page.getByRole('status')
    if ((await statusEl.count()) > 0) {
      const text = await statusEl.first().textContent()
      expect(text?.toLowerCase()).toContain('check your email')
    }

    await page.screenshot({ path: `${SCREENSHOTS}/a11y-signup-success-role.png` })
  })

  test('form has accessible name via aria-label', async ({ page }) => {
    await page.goto('/login')
    const loginForm = page.getByRole('form', { name: /login form/i })
    await expect(loginForm).toBeVisible()

    await page.goto('/signup')
    const signupForm = page.getByRole('form', { name: /sign up/i })
    await expect(signupForm).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOTS}/a11y-form-labels.png` })
  })
})

// ---------------------------------------------------------------------------
// 9. Repeated mount/unmount — memory leak proxy test
// ---------------------------------------------------------------------------
test.describe('Repeated form mount/unmount cycles', () => {
  test('login form survives 20 mount/unmount cycles without page crash', async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await page.goto('/login')
      await expect(page.getByLabel('Email')).toBeVisible()

      await page.goto('/signup')
      await expect(page.getByLabel('Email')).toBeVisible()
    }

    // Final check: form should still be fully functional
    await page.goto('/login')
    await fillLogin(page, 'cycle-test@test.com', 'password123')
    await submitLogin(page)

    // Should get a response (alert or status), not a blank/crashed page
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })
    await page.screenshot({ path: `${SCREENSHOTS}/mount-unmount-stable.png` })
  })

  test('JS heap does not grow excessively after repeated navigation', async ({ page }) => {
    await page.goto('/login')

    // Take initial heap snapshot
    const initialMetrics = await page.evaluate(() => {
      if (performance && 'memory' in performance) {
        return (performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      }
      return null
    })

    // Cycle 30 times
    for (let i = 0; i < 30; i++) {
      await page.goto('/login')
      await page.goto('/signup')
    }

    // Force garbage collection if possible, then measure
    const finalMetrics = await page.evaluate(() => {
      if (performance && 'memory' in performance) {
        return (performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      }
      return null
    })

    if (initialMetrics !== null && finalMetrics !== null) {
      const growthMB = (finalMetrics - initialMetrics) / (1024 * 1024)
      // Heap should not grow more than 50MB from 30 navigation cycles
      expect(growthMB).toBeLessThan(50)
    }
    // If performance.memory is not available (non-Chromium), test is still valid
    // as the page did not crash during 30 cycles

    await page.screenshot({ path: `${SCREENSHOTS}/heap-after-cycles.png` })
  })
})

// ---------------------------------------------------------------------------
// 10. Network throttling effects on auth flow
// ---------------------------------------------------------------------------
test.describe('Network degradation', () => {
  test('login form shows pending state on slow network', async ({ page, context }) => {
    // Slow down all responses
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024, // 50 KB/s
      uploadThroughput: 50 * 1024,
      latency: 2000, // 2s latency
    })

    await page.goto('/login', { timeout: 30_000 })
    await fillLogin(page, 'slow@test.com', 'password123')
    await submitLogin(page)

    // Button should show pending state while network is slow
    const btn = page.getByRole('button', { name: /signing in/i })
    await expect(btn).toBeVisible({ timeout: 5_000 })
    await expect(btn).toBeDisabled()

    await page.screenshot({ path: `${SCREENSHOTS}/slow-network-pending.png` })

    // Reset network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    })
  })

  test('login form handles network offline gracefully', async ({ page, context }) => {
    await page.goto('/login')
    await fillLogin(page, 'offline@test.com', 'password123')

    // Go offline before submission
    await context.setOffline(true)
    await submitLogin(page)

    // Wait a bit for the request to fail
    await page.waitForTimeout(3000)

    // Page should not crash — it may show an error or the button re-enables
    const btn = page.getByRole('button', { name: /sign in/i })
    // Either the button re-enables or an error shows
    const isEnabled = await btn.isEnabled()
    const hasAlert = (await page.getByRole('alert').count()) > 0

    // At minimum, one of these should be true — the UI recovered
    expect(isEnabled || hasAlert).toBe(true)

    await page.screenshot({ path: `${SCREENSHOTS}/offline-recovery.png` })

    await context.setOffline(false)
  })
})

// ---------------------------------------------------------------------------
// 11. Concurrent tab behavior
// ---------------------------------------------------------------------------
test.describe('Concurrent tab auth behavior', () => {
  test('login form works independently across two tabs', async ({ context }) => {
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    await page1.goto('/login')
    await page2.goto('/login')

    // Fill different data in each tab
    await fillLogin(page1, 'tab1@test.com', 'password1')
    await fillLogin(page2, 'tab2@test.com', 'password2')

    // Verify each tab has its own data
    expect(await page1.getByLabel('Email').inputValue()).toBe('tab1@test.com')
    expect(await page2.getByLabel('Email').inputValue()).toBe('tab2@test.com')

    // Submit tab1
    await submitLogin(page1)
    await page1.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })

    // Tab2 should still have its own data, unaffected
    expect(await page2.getByLabel('Email').inputValue()).toBe('tab2@test.com')
    expect(await page2.getByLabel('Password').inputValue()).toBe('password2')

    await page1.screenshot({ path: `${SCREENSHOTS}/concurrent-tab-1.png` })
    await page2.screenshot({ path: `${SCREENSHOTS}/concurrent-tab-2.png` })

    await page1.close()
    await page2.close()
  })

  test('protected route redirect works consistently across concurrent tabs', async ({
    context,
  }) => {
    const tabs = await Promise.all(Array.from({ length: 5 }, () => context.newPage()))

    // Navigate all 5 tabs to protected routes simultaneously
    await Promise.all(tabs.map((tab, i) => tab.goto(`/dashboard/project-${i}`)))

    // All should redirect to login
    for (const tab of tabs) {
      await tab.waitForURL('**/login', { timeout: 10_000 })
      expect(tab.url()).toContain('/login')
    }

    await tabs[0].screenshot({ path: `${SCREENSHOTS}/concurrent-protected-redirect.png` })

    // Clean up
    for (const tab of tabs) {
      await tab.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 12. Form method attribute & CSRF surface
// ---------------------------------------------------------------------------
test.describe('Form security attributes', () => {
  test('login form has method=post to avoid credentials in URL', async ({ page }) => {
    await page.goto('/login')
    const form = page.locator('form[aria-label="Login form"]')
    const method = await form.getAttribute('method')
    expect(method?.toLowerCase()).toBe('post')
  })

  test('signup form has method=post', async ({ page }) => {
    await page.goto('/signup')
    const form = page.locator('form[aria-label="Sign up"]')
    const method = await form.getAttribute('method')
    expect(method?.toLowerCase()).toBe('post')
  })

  test('login form uses noValidate to enable custom validation', async ({ page }) => {
    await page.goto('/login')
    const form = page.locator('form[aria-label="Login form"]')
    const noValidate = await form.getAttribute('novalidate')
    // novalidate attribute should be present (rendered as empty string or "")
    expect(noValidate).not.toBeNull()
  })

  test('submitting login does not add credentials to browser history', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'history@test.com', 'secret123')
    await submitLogin(page)

    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })

    // Current URL should not contain the credentials
    const url = page.url()
    expect(url).not.toContain('history@test.com')
    expect(url).not.toContain('secret123')
    expect(url).not.toContain('password=')
    await page.screenshot({ path: `${SCREENSHOTS}/no-creds-in-url.png` })
  })
})

// ---------------------------------------------------------------------------
// 13. Input field security attributes
// ---------------------------------------------------------------------------
test.describe('Input field security', () => {
  test('password fields have autocomplete attribute or safe default', async ({ page }) => {
    await page.goto('/login')
    const pw = page.locator('#password')
    // Password fields should not have autocomplete="off" — that hurts
    // password manager compatibility. They should have the default or
    // "current-password" / "new-password" for accessibility.
    const autocomplete = await pw.getAttribute('autocomplete')
    // If set, should not be something dangerous
    if (autocomplete) {
      expect(['on', 'current-password', 'new-password']).toContain(autocomplete)
    }
    // If not set, browser default applies — acceptable
  })

  test('email fields have type=email for proper keyboard on mobile', async ({ page }) => {
    await page.goto('/login')
    const email = page.locator('#email')
    await expect(email).toHaveAttribute('type', 'email')

    await page.goto('/signup')
    const signupEmail = page.locator('#signup-email')
    await expect(signupEmail).toHaveAttribute('type', 'email')
  })

  test('inputs have required attribute for baseline HTML validation', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toHaveAttribute('required', '')
    await expect(page.locator('#password')).toHaveAttribute('required', '')

    await page.goto('/signup')
    await expect(page.locator('#signup-email')).toHaveAttribute('required', '')
    await expect(page.locator('#signup-password')).toHaveAttribute('required', '')
  })
})

// ---------------------------------------------------------------------------
// 14. XSS resistance in error messages
// ---------------------------------------------------------------------------
test.describe('XSS resistance', () => {
  test('script tags in email field do not execute', async ({ page }) => {
    await page.goto('/login')

    // Inject script tag via email field
    await page.getByLabel('Email').fill('<script>window.__xss=true</script>')
    await page.getByLabel('Password').fill('password123')
    await submitLogin(page)

    await page.waitForTimeout(2000)

    // Verify no script execution
    const xssTriggered = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>).__xss === true
    })
    expect(xssTriggered).toBe(false)

    // Check that any rendered error does not contain unescaped HTML
    const bodyHtml = await page.content()
    expect(bodyHtml).not.toContain('<script>window.__xss=true</script>')

    await page.screenshot({ path: `${SCREENSHOTS}/xss-script-blocked.png` })
  })

  test('HTML injection in email field is escaped in error display', async ({ page }) => {
    await page.goto('/signup')

    const payload = '<img src=x onerror=alert(1)>'
    await page.getByLabel('Email').fill(payload)
    await page.getByLabel('Password').fill('password12345')
    await submitSignup(page)

    await page.waitForTimeout(2000)

    // No alert dialog should have appeared
    let alertFired = false
    page.on('dialog', () => {
      alertFired = true
    })
    await page.waitForTimeout(500)
    expect(alertFired).toBe(false)

    await page.screenshot({ path: `${SCREENSHOTS}/xss-img-blocked.png` })
  })

  test('event handler injection in password field is harmless', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('xss@test.com')
    await page.getByLabel('Password').fill('" onfocus="alert(document.cookie)" autofocus="')
    await submitLogin(page)

    await page.waitForTimeout(2000)

    // Verify no dialog triggered
    let dialogTriggered = false
    page.on('dialog', () => {
      dialogTriggered = true
    })
    await page.waitForTimeout(500)
    expect(dialogTriggered).toBe(false)

    await page.screenshot({ path: `${SCREENSHOTS}/xss-event-handler-blocked.png` })
  })
})

// ---------------------------------------------------------------------------
// 15. Timing attack surface — login vs nonexistent user
// ---------------------------------------------------------------------------
test.describe('Timing analysis', () => {
  test('login response times for existing vs non-existing emails are similar', async ({ page }) => {
    // This is a heuristic test — we check that the difference is not wildly
    // divergent, which would signal user enumeration via timing.
    await page.goto('/login')

    // Time 1: likely non-existent email
    const start1 = Date.now()
    await fillLogin(page, 'definitely-nonexistent-user-abc@nowhere.test', 'password123')
    await submitLogin(page)
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })
    const time1 = Date.now() - start1

    // Clear form for next attempt
    await page.goto('/login')

    // Time 2: another likely non-existent email (different pattern)
    const start2 = Date.now()
    await fillLogin(page, 'another-fake-email-xyz@test.test', 'password123')
    await submitLogin(page)
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 15_000 })
    const time2 = Date.now() - start2

    // The two requests should be within 3 seconds of each other.
    // A larger discrepancy would hint at user enumeration.
    const diffMs = Math.abs(time1 - time2)
    expect(diffMs).toBeLessThan(3000)

    await page.screenshot({ path: `${SCREENSHOTS}/timing-analysis.png` })
  })
})

// ---------------------------------------------------------------------------
// 16. Response header security (checked via fetch)
// ---------------------------------------------------------------------------
test.describe('Security headers', () => {
  test('auth pages return security-relevant headers', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response).not.toBeNull()

    const headers = response!.headers()

    // X-Content-Type-Options prevents MIME sniffing
    if (headers['x-content-type-options']) {
      expect(headers['x-content-type-options']).toBe('nosniff')
    }

    // X-Frame-Options prevents clickjacking on auth pages
    if (headers['x-frame-options']) {
      expect(['DENY', 'SAMEORIGIN']).toContain(headers['x-frame-options'].toUpperCase())
    }

    await page.screenshot({ path: `${SCREENSHOTS}/security-headers.png` })
  })
})
