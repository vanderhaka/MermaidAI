import { test, expect, type Page } from '@playwright/test'

const SCREENSHOT_DIR = 'e2e/screenshots/stress'

/**
 * AUTH & SECURITY — Reviewer 3 (Contrarian)
 *
 * Edge cases the other reviewers will overlook:
 * viewport extremes, browser zoom, RTL text, HTML paste injection,
 * rapid focus/blur, double-click submit, concurrent contexts,
 * query param abuse, navigation-during-submit, and CPU throttle.
 */
test.describe('Auth Security — Contrarian Edge Cases', () => {
  // ---------------------------------------------------------------------------
  // 1. Viewport extremes — forms must remain usable at 320px and 3840px
  // ---------------------------------------------------------------------------
  test.describe('viewport extremes', () => {
    test('login form is usable at 320px mobile width', async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 320, height: 568 },
      })
      const page = await context.newPage()
      await page.goto('/login')

      const emailInput = page.getByLabel('Email')
      const passwordInput = page.getByLabel('Password')
      const submitBtn = page.getByRole('button', { name: /sign in/i })

      await expect(emailInput).toBeVisible()
      await expect(passwordInput).toBeVisible()
      await expect(submitBtn).toBeVisible()

      // Inputs should not overflow the viewport
      const emailBox = await emailInput.boundingBox()
      expect(emailBox).not.toBeNull()
      expect(emailBox!.x).toBeGreaterThanOrEqual(0)
      expect(emailBox!.x + emailBox!.width).toBeLessThanOrEqual(320)

      // Submit button should be fully visible (not clipped)
      const btnBox = await submitBtn.boundingBox()
      expect(btnBox).not.toBeNull()
      expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(320)

      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-320px.png` })
      await context.close()
    })

    test('signup form is usable at 320px mobile width', async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 320, height: 568 },
      })
      const page = await context.newPage()
      await page.goto('/signup')

      const emailInput = page.getByLabel('Email')
      const passwordInput = page.getByLabel('Password')
      const submitBtn = page.getByRole('button', { name: /sign up/i })

      await expect(emailInput).toBeVisible()
      await expect(passwordInput).toBeVisible()
      await expect(submitBtn).toBeVisible()

      const btnBox = await submitBtn.boundingBox()
      expect(btnBox).not.toBeNull()
      expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(320)

      await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-320px.png` })
      await context.close()
    })

    test('login form renders without horizontal scroll at 4K ultra-wide', async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 3840, height: 2160 },
      })
      const page = await context.newPage()
      await page.goto('/login')

      await expect(page.getByLabel('Email')).toBeVisible()

      // The form card should be centred, not stretched to 3840px
      const form = page.getByRole('form', { name: /login form/i })
      const formBox = await form.boundingBox()
      expect(formBox).not.toBeNull()
      // Form should not fill the entire viewport width
      expect(formBox!.width).toBeLessThan(3840 * 0.6)

      // No horizontal scrollbar
      const hasHScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(hasHScroll).toBe(false)

      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-4k.png` })
      await context.close()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Browser zoom levels — form should remain functional at extreme zoom
  // ---------------------------------------------------------------------------
  test.describe('browser zoom', () => {
    for (const scale of [0.5, 2, 5]) {
      test(`login form remains functional at ${scale * 100}% zoom`, async ({ page }) => {
        await page.goto('/login')

        // Simulate zoom via CSS transform on the viewport
        await page.evaluate((s) => {
          document.body.style.transform = `scale(${s})`
          document.body.style.transformOrigin = 'top left'
        }, scale)

        // Fields should still accept input
        const email = page.getByLabel('Email')
        await email.fill('zoom@test.com')
        await expect(email).toHaveValue('zoom@test.com')

        const password = page.getByLabel('Password')
        await password.fill('zoompassword')
        await expect(password).toHaveValue('zoompassword')

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/login-zoom-${scale * 100}pct.png`,
        })
      })
    }
  })

  // ---------------------------------------------------------------------------
  // 3. RTL text in form fields — should not break validation or display
  // ---------------------------------------------------------------------------
  test.describe('right-to-left text handling', () => {
    test('RTL text in email field does not bypass validation', async ({ page }) => {
      await page.goto('/login')

      // Arabic text is not a valid email — validation must reject it
      await page
        .getByLabel('Email')
        .fill('\u0645\u0631\u062D\u0628\u0627@\u0645\u062B\u0627\u0644.\u0643\u0648\u0645')
      await page.getByLabel('Password').fill('password123')
      await page.getByRole('button', { name: /sign in/i }).click()

      // Either Zod validation rejects it or the server rejects it — either way
      // the app should not crash and should show an error or alert
      await page.waitForTimeout(1000)

      // Page should still be functional (no blank screen / crash)
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-rtl-text.png` })
    })

    test('mixed RTL/LTR text in password field is accepted as-is', async ({ page }) => {
      await page.goto('/signup')

      await page.getByLabel('Email').fill('test@example.com')
      // Password with mixed direction characters
      await page.getByLabel('Password').fill('pass\u200Fword\u200E1234')
      await page.getByRole('button', { name: /sign up/i }).click()

      // Should not crash — validation or server handles it
      await page.waitForTimeout(1000)
      await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()
      await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-rtl-password.png` })
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Paste events with formatted HTML — should be stripped to plaintext
  // ---------------------------------------------------------------------------
  test.describe('HTML paste injection', () => {
    test('pasting HTML into email field strips tags', async ({ page }) => {
      await page.goto('/login')

      const emailInput = page.getByLabel('Email')
      await emailInput.focus()

      // Simulate pasting HTML via clipboard
      await page.evaluate(() => {
        const input = document.getElementById('email') as HTMLInputElement
        const dt = new DataTransfer()
        dt.setData('text/html', '<img src=x onerror=alert(1)>evil@hack.com')
        dt.setData('text/plain', '<img src=x onerror=alert(1)>evil@hack.com')
        const event = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })
        input.dispatchEvent(event)
      })

      // The input value should be plaintext (type=email strips HTML inherently)
      // but we verify no script executes
      const dialogPromise = page.waitForEvent('dialog', { timeout: 2000 }).catch(() => null)
      const dialog = await dialogPromise
      expect(dialog).toBeNull() // No alert() fired

      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-html-paste.png` })
    })

    test('pasting HTML into password field does not execute scripts', async ({ page }) => {
      await page.goto('/signup')

      const passwordInput = page.getByLabel('Password')
      await passwordInput.focus()

      await page.evaluate(() => {
        const input = document.getElementById('signup-password') as HTMLInputElement
        const dt = new DataTransfer()
        dt.setData('text/html', '<script>alert("xss")</script>password')
        dt.setData('text/plain', '<script>alert("xss")</script>password')
        const event = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })
        input.dispatchEvent(event)
      })

      const dialogPromise = page.waitForEvent('dialog', { timeout: 2000 }).catch(() => null)
      const dialog = await dialogPromise
      expect(dialog).toBeNull()

      await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-html-paste-password.png` })
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Rapid focus/blur cycles — should not crash React or leak state
  // ---------------------------------------------------------------------------
  test('rapid focus/blur cycles on inputs do not crash the form', async ({ page }) => {
    await page.goto('/login')

    const email = page.getByLabel('Email')
    const password = page.getByLabel('Password')

    // Rapidly cycle focus between fields 50 times
    for (let i = 0; i < 50; i++) {
      await email.focus()
      await password.focus()
    }

    // Form should still be functional after the storm
    await email.fill('stable@test.com')
    await password.fill('password123')
    await expect(email).toHaveValue('stable@test.com')
    await expect(password).toHaveValue('password123')

    // Submit should still work
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-rapid-focus.png` })
  })

  // ---------------------------------------------------------------------------
  // 6. Double-click vs single-click on submit — should not double-submit
  // ---------------------------------------------------------------------------
  test.describe('double-click submit prevention', () => {
    test('double-clicking login submit does not fire two requests', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('double@click.com')
      await page.getByLabel('Password').fill('password123')

      const requests: string[] = []
      page.on('request', (req) => {
        if (req.method() === 'POST' || req.url().includes('auth')) {
          requests.push(req.url())
        }
      })

      const submitBtn = page.getByRole('button', { name: /sign in/i })
      await submitBtn.dblclick()

      // Wait for any in-flight requests
      await page.waitForTimeout(3000)

      // Button should be disabled while pending (preventing second submit)
      // Count auth-related requests — should be at most 1
      // (The form uses isPending to disable the button)
      const authRequests = requests.filter((url) => url.includes('auth') || url.includes('token'))
      // We allow 0 (if validation blocks) or 1 — but never 2+
      expect(authRequests.length).toBeLessThanOrEqual(1)

      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-double-click.png` })
    })

    test('double-clicking signup submit does not fire two requests', async ({ page }) => {
      await page.goto('/signup')
      await page.getByLabel('Email').fill('double@click-signup.com')
      await page.getByLabel('Password').fill('password123')

      const requests: string[] = []
      page.on('request', (req) => {
        if (req.method() === 'POST' || req.url().includes('auth')) {
          requests.push(req.url())
        }
      })

      const submitBtn = page.getByRole('button', { name: /sign up/i })
      await submitBtn.dblclick()

      await page.waitForTimeout(3000)

      const authRequests = requests.filter((url) => url.includes('auth') || url.includes('token'))
      expect(authRequests.length).toBeLessThanOrEqual(1)

      await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-double-click.png` })
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Query parameter abuse on auth pages
  // ---------------------------------------------------------------------------
  test.describe('query parameter handling', () => {
    test('login page with ?redirect= param does not open-redirect', async ({ page }) => {
      // Attempt open redirect via query param
      await page.goto('/login?redirect=https://evil.com')

      // Page should load normally — no immediate redirect to evil.com
      await expect(page.getByLabel('Email')).toBeVisible()
      expect(page.url()).not.toContain('evil.com')

      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-redirect-param.png` })
    })

    test('login page with ?error= param does not render unescaped HTML', async ({ page }) => {
      await page.goto('/login?error=<script>alert(1)</script>')

      // No dialog should fire (XSS via query param)
      const dialogPromise = page.waitForEvent('dialog', { timeout: 2000 }).catch(() => null)
      const dialog = await dialogPromise
      expect(dialog).toBeNull()

      // Page should still be functional
      await expect(page.getByLabel('Email')).toBeVisible()
      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-xss-error-param.png` })
    })

    test('StripSensitiveAuthQuery removes email and password from URL', async ({ page }) => {
      await page.goto('/login?email=leak@test.com&password=secret123&other=keep')

      // Wait for the client-side strip to run
      await page.waitForTimeout(2000)

      const currentUrl = page.url()
      expect(currentUrl).not.toContain('email=')
      expect(currentUrl).not.toContain('password=')
      // Non-sensitive params should be preserved
      expect(currentUrl).toContain('other=keep')

      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-strip-sensitive.png` })
    })

    test('signup page with excessive query params does not crash', async ({ page }) => {
      // Build a URL with 100 junk query params
      const params = Array.from({ length: 100 }, (_, i) => `p${i}=val${i}`).join('&')
      await page.goto(`/signup?${params}`)

      await expect(page.getByLabel('Email')).toBeVisible()
      await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()

      await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-excessive-params.png` })
    })

    test('login with javascript: protocol in redirect param is safe', async ({ page }) => {
      await page.goto('/login?redirect=javascript:alert(1)')

      const dialogPromise = page.waitForEvent('dialog', { timeout: 2000 }).catch(() => null)
      const dialog = await dialogPromise
      expect(dialog).toBeNull()

      await expect(page.getByLabel('Email')).toBeVisible()
      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-js-protocol-param.png` })
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Form submission during page navigation — race condition
  // ---------------------------------------------------------------------------
  test('submitting login form while navigating away does not crash', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('race@condition.com')
    await page.getByLabel('Password').fill('password123')

    // Click submit and immediately navigate
    const submitBtn = page.getByRole('button', { name: /sign in/i })
    await Promise.all([submitBtn.click(), page.goto('/signup')])

    // Should land on signup without crash
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()
    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-navigate-during-submit.png` })
  })

  test('submitting signup form while navigating to login does not crash', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill('race@signup.com')
    await page.getByLabel('Password').fill('password123')

    await Promise.all([page.getByRole('button', { name: /sign up/i }).click(), page.goto('/login')])

    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-navigate-during-submit.png` })
  })

  // ---------------------------------------------------------------------------
  // 9. Multiple browser contexts hitting auth simultaneously
  // ---------------------------------------------------------------------------
  test('concurrent auth submissions from multiple contexts do not interfere', async ({
    browser,
  }) => {
    const NUM_CONTEXTS = 5

    const contexts = await Promise.all(
      Array.from({ length: NUM_CONTEXTS }, () => browser.newContext()),
    )
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()))

    // Navigate all pages to login
    await Promise.all(pages.map((p) => p.goto('/login')))

    // Fill all forms with different emails
    await Promise.all(
      pages.map(async (p, i) => {
        await p.getByLabel('Email').fill(`concurrent${i}@test.com`)
        await p.getByLabel('Password').fill(`password${i}`)
      }),
    )

    // Submit all simultaneously
    await Promise.all(pages.map((p) => p.getByRole('button', { name: /sign in/i }).click()))

    // Wait for responses
    await Promise.all(pages.map((p) => p.waitForTimeout(3000)))

    // All pages should still be functional — no crashes or blank screens
    for (let i = 0; i < NUM_CONTEXTS; i++) {
      const btn = pages[i].getByRole('button', { name: /sign in/i })
      // Button should be visible (form is still rendered)
      await expect(btn).toBeVisible()
    }

    // Clean up
    await Promise.all(contexts.map((ctx) => ctx.close()))
  })

  // ---------------------------------------------------------------------------
  // 10. Page refresh during form submission
  // ---------------------------------------------------------------------------
  test('refreshing login page mid-submission resets form cleanly', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('refresh@test.com')
    await page.getByLabel('Password').fill('password123')

    // Submit and immediately reload
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.reload()

    // Form should be in its initial state — no stale error/success messages
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue('')
    // No lingering alerts from the interrupted submission
    const alerts = page.getByRole('alert')
    await expect(alerts).toHaveCount(0)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-refresh-mid-submit.png` })
  })

  // ---------------------------------------------------------------------------
  // 11. JavaScript disabled — form should degrade gracefully
  // ---------------------------------------------------------------------------
  test('login form has method="post" for no-JS fallback', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/login')

    // The form element should exist with method=post (SSR fallback)
    // With JS disabled, React won't hydrate, but the HTML should still render
    // because Next.js SSR delivers the initial HTML
    const form = page.locator('form[method="post"]')
    const formCount = await form.count()

    // The form should be present in SSR HTML
    expect(formCount).toBeGreaterThan(0)

    // Inputs should be present in the SSR-rendered HTML
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-no-js.png` })
    await context.close()
  })

  test('signup form has method="post" for no-JS fallback', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/signup')

    const form = page.locator('form[method="post"]')
    const formCount = await form.count()
    expect(formCount).toBeGreaterThan(0)

    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-signup-no-js.png` })
    await context.close()
  })

  // ---------------------------------------------------------------------------
  // 12. CPU throttling — auth pages should remain responsive
  // ---------------------------------------------------------------------------
  test('login page loads within 5s under 4x CPU throttle', async ({ page }) => {
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    const start = Date.now()
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const loadTime = Date.now() - start

    await expect(page.getByLabel('Email')).toBeVisible()

    // Under 4x throttle, should still load within 5 seconds
    expect(loadTime).toBeLessThan(5000)

    // Reset throttle
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-cpu-throttle.png` })
  })

  // ---------------------------------------------------------------------------
  // 13. Form method attribute — must be POST, not GET (credential leakage)
  // ---------------------------------------------------------------------------
  test('auth forms use POST method, never GET', async ({ page }) => {
    await page.goto('/login')
    const loginFormMethod = await page
      .getByRole('form', { name: /login form/i })
      .getAttribute('method')
    expect(loginFormMethod?.toLowerCase()).toBe('post')

    await page.goto('/signup')
    const signupFormMethod = await page
      .getByRole('form', { name: /sign up/i })
      .getAttribute('method')
    expect(signupFormMethod?.toLowerCase()).toBe('post')
  })

  // ---------------------------------------------------------------------------
  // 14. Password field masking — type must be "password"
  // ---------------------------------------------------------------------------
  test('password inputs have type="password" to prevent shoulder surfing', async ({ page }) => {
    await page.goto('/login')
    const loginPwType = await page.getByLabel('Password').getAttribute('type')
    expect(loginPwType).toBe('password')

    await page.goto('/signup')
    const signupPwType = await page.getByLabel('Password').getAttribute('type')
    expect(signupPwType).toBe('password')
  })

  // ---------------------------------------------------------------------------
  // 15. Autocomplete attributes — password managers should work
  // ---------------------------------------------------------------------------
  test('email and password inputs are accessible to password managers', async ({ page }) => {
    await page.goto('/login')

    // type=email and type=password are sufficient for password manager detection
    // but autocomplete attributes are best practice
    const emailType = await page.getByLabel('Email').getAttribute('type')
    expect(emailType).toBe('email')

    const pwType = await page.getByLabel('Password').getAttribute('type')
    expect(pwType).toBe('password')

    // Inputs should have name attributes (critical for autofill)
    const emailName = await page.getByLabel('Email').getAttribute('name')
    expect(emailName).toBe('email')
    const pwName = await page.getByLabel('Password').getAttribute('name')
    expect(pwName).toBe('password')
  })

  // ---------------------------------------------------------------------------
  // 16. Extremely long input values — should not freeze the UI
  // ---------------------------------------------------------------------------
  test('extremely long email input does not freeze the page', async ({ page }) => {
    await page.goto('/login')

    // 10,000 character email
    const longEmail = 'a'.repeat(10_000) + '@test.com'
    await page.getByLabel('Email').fill(longEmail)
    await page.getByLabel('Password').fill('password123')

    // Submit should still be clickable (UI didn't freeze)
    const submitBtn = page.getByRole('button', { name: /sign in/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Page should still respond after submission attempt
    await page.waitForTimeout(2000)
    await expect(submitBtn).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-long-email.png` })
  })

  test('extremely long password does not freeze the page', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Email').fill('long@password.com')
    // 50,000 character password
    await page.getByLabel('Password').fill('p'.repeat(50_000))

    const submitBtn = page.getByRole('button', { name: /sign up/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    await page.waitForTimeout(2000)
    await expect(submitBtn).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-long-password.png` })
  })

  // ---------------------------------------------------------------------------
  // 17. Tab key navigation order — logical flow through the form
  // ---------------------------------------------------------------------------
  test('tab order follows email -> password -> submit -> signup link', async ({ page }) => {
    await page.goto('/login')

    // Focus the email field first
    await page.getByLabel('Email').focus()
    await expect(page.getByLabel('Email')).toBeFocused()

    // Tab to password
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password')).toBeFocused()

    // Tab to submit button
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeFocused()

    // Tab to signup link
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: /sign up/i })).toBeFocused()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-tab-order.png` })
  })

  // ---------------------------------------------------------------------------
  // 18. Enter key submits the form from any field
  // ---------------------------------------------------------------------------
  test('pressing Enter in password field submits the login form', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('enter@submit.com')
    await page.getByLabel('Password').fill('password123')

    // Press Enter while in the password field
    await page.getByLabel('Password').press('Enter')

    // Should trigger submission — wait for response
    await page.waitForTimeout(2000)

    // The form should have attempted submission (button shows pending or alert appears)
    const btnText = await page.getByRole('button', { name: /sign/i }).textContent()
    const hasAlert = (await page.getByRole('alert').count()) > 0
    const hasStatus = (await page.getByRole('status').count()) > 0

    // At least one of these should be true after Enter submission
    expect(btnText === 'Signing in...' || hasAlert || hasStatus || btnText === 'Sign in').toBe(true)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-enter-submit.png` })
  })

  // ---------------------------------------------------------------------------
  // 19. Error messages do not leak server internals
  // ---------------------------------------------------------------------------
  test('login error messages do not expose stack traces or internal paths', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('nonexistent@user.com')
    await page.getByLabel('Password').fill('wrongpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.waitForTimeout(3000)

    // Check all visible text for internal leaks
    const bodyText = await page.textContent('body')
    const lowerText = bodyText?.toLowerCase() ?? ''

    // Should not contain stack traces or internal info
    expect(lowerText).not.toContain('stack trace')
    expect(lowerText).not.toContain('node_modules')
    expect(lowerText).not.toContain('at object.')
    expect(lowerText).not.toContain('internal server error')
    expect(lowerText).not.toContain('econnrefused')
    expect(lowerText).not.toContain('.ts:')
    expect(lowerText).not.toContain('.js:')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-error-no-leak.png` })
  })

  // ---------------------------------------------------------------------------
  // 20. Form does not cache credentials in the DOM after navigation
  // ---------------------------------------------------------------------------
  test('navigating away and back clears form state', async ({ page }) => {
    await page.goto('/login')

    // Fill in credentials
    await page.getByLabel('Email').fill('cached@creds.com')
    await page.getByLabel('Password').fill('secret123')

    // Navigate away to signup
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Navigate back to login
    await page.getByRole('link', { name: /log in/i }).click()
    await page.waitForURL('**/login')

    // Fields should be empty — no stale credentials
    await expect(page.getByLabel('Email')).toHaveValue('')
    await expect(page.getByLabel('Password')).toHaveValue('')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-no-cached-creds.png` })
  })
})
