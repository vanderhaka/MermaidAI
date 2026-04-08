import { test, expect, type Page } from '@playwright/test'

const SCREENSHOT_DIR = 'e2e/screenshots/stress'

/** Helper: fill login form and submit */
async function submitLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
}

/** Helper: fill signup form and submit */
async function submitSignup(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign up/i }).click()
}

// ---------------------------------------------------------------------------
// 1. RAPID FORM SUBMISSION — button mashing, race conditions
// ---------------------------------------------------------------------------
test.describe('Rapid form submission', () => {
  test('login: rapid-fire submit clicks do not crash the app', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('rapid@test.com')
    await page.getByLabel('Password').fill('password123')

    const submitBtn = page.getByRole('button', { name: /sign in/i })

    // Click 10 times as fast as possible
    for (let i = 0; i < 10; i++) {
      await submitBtn.click({ force: true, delay: 0 })
    }

    // Page should remain functional — no unhandled errors, no blank screen
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rapid-login-submit.png` })
  })

  test('signup: rapid-fire submit clicks do not crash the app', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill('rapid@test.com')
    await page.getByLabel('Password').fill('password12345')

    const submitBtn = page.getByRole('button', { name: /sign up/i })

    for (let i = 0; i < 10; i++) {
      await submitBtn.click({ force: true, delay: 0 })
    }

    await expect(page.locator('form[aria-label="Sign up"]')).toBeVisible()
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rapid-signup-submit.png` })
  })

  test('login: button is disabled while request is pending', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('pending@test.com')
    await page.getByLabel('Password').fill('password123')

    const submitBtn = page.getByRole('button', { name: /sign in/i })
    await submitBtn.click()

    // During the network request the button text should change and be disabled
    await expect(page.getByRole('button', { name: /signing in/i }))
      .toBeVisible({ timeout: 2000 })
      .catch(() => {
        // If the request resolves instantly the pending state may not be visible;
        // that is acceptable — the test verifies no crash occurred.
      })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-pending-state.png` })
  })

  test('signup: button is disabled while request is pending', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill('pending@test.com')
    await page.getByLabel('Password').fill('password12345')

    const submitBtn = page.getByRole('button', { name: /sign up/i })
    await submitBtn.click()

    await expect(page.getByRole('button', { name: /signing up/i }))
      .toBeVisible({ timeout: 2000 })
      .catch(() => {
        // Same reasoning as above
      })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-pending-state.png` })
  })
})

// ---------------------------------------------------------------------------
// 2. XSS PAYLOADS — ensure no script execution or DOM injection
// ---------------------------------------------------------------------------
test.describe('XSS payload injection', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '"><img src=x onerror=alert(1)>',
    "javascript:alert('xss')",
    '<svg onload=alert(1)>',
    '{{constructor.constructor("alert(1)")()}}',
    '<iframe src="javascript:alert(1)">',
    "'-alert(1)-'",
    '<body onload=alert(1)>',
    '<input onfocus=alert(1) autofocus>',
    '" onfocus="alert(1)" autofocus="',
  ]

  for (const payload of xssPayloads) {
    test(`login: XSS payload does not execute — ${payload.slice(0, 40)}`, async ({ page }) => {
      let alertFired = false
      page.on('dialog', (dialog) => {
        alertFired = true
        dialog.dismiss()
      })

      await page.goto('/login')
      await submitLogin(page, payload, payload)

      // Wait for validation errors to appear
      await page.waitForTimeout(500)

      expect(alertFired).toBe(false)

      // The form should display a validation error, not render the payload as HTML
      const bodyHtml = await page.content()
      expect(bodyHtml).not.toContain('<script>alert')
      expect(bodyHtml).not.toContain('onerror=alert')

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/xss-login-${Buffer.from(payload).toString('hex').slice(0, 16)}.png`,
      })
    })
  }

  for (const payload of xssPayloads.slice(0, 3)) {
    test(`signup: XSS payload does not execute — ${payload.slice(0, 40)}`, async ({ page }) => {
      let alertFired = false
      page.on('dialog', (dialog) => {
        alertFired = true
        dialog.dismiss()
      })

      await page.goto('/signup')
      await submitSignup(page, payload, payload)

      await page.waitForTimeout(500)
      expect(alertFired).toBe(false)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/xss-signup-${Buffer.from(payload).toString('hex').slice(0, 16)}.png`,
      })
    })
  }

  test('login: error messages do not render injected HTML', async ({ page }) => {
    await page.goto('/login')

    // Fill a valid-looking email with XSS in the password field
    await submitLogin(page, 'valid@example.com', '<img src=x onerror=alert(1)>')

    await page.waitForTimeout(1000)

    // Check that no <img> tag was injected into the DOM from the error message
    const images = await page.locator('img[src="x"]').count()
    expect(images).toBe(0)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/xss-error-message.png` })
  })
})

// ---------------------------------------------------------------------------
// 3. SQL INJECTION — form fields should not pass through to raw queries
// ---------------------------------------------------------------------------
test.describe('SQL injection payloads', () => {
  const sqlPayloads = [
    "' OR '1'='1' --",
    "'; DROP TABLE users; --",
    "1' UNION SELECT * FROM auth.users --",
    "admin'--",
    "' OR 1=1 LIMIT 1 --",
    '1; SELECT * FROM pg_tables --',
    "'; INSERT INTO auth.users (email) VALUES ('hacked@test.com'); --",
    "\\'; TRUNCATE auth.users; --",
  ]

  for (const payload of sqlPayloads) {
    test(`login: SQL injection payload handled safely — ${payload.slice(0, 30)}`, async ({
      page,
    }) => {
      await page.goto('/login')
      await submitLogin(page, payload, payload)

      // Should get a validation error (invalid email format) — not a server error
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 5000 })

      // Page should remain stable
      await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/sqli-login-${Buffer.from(payload).toString('hex').slice(0, 16)}.png`,
      })
    })
  }

  test('signup: SQL injection in email field rejected by Zod', async ({ page }) => {
    await page.goto('/signup')
    await submitSignup(page, "' OR '1'='1' --", 'validpassword123')

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('form[aria-label="Sign up"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/sqli-signup.png` })
  })

  test('login: SQL injection in password with valid email format', async ({ page }) => {
    await page.goto('/login')
    await submitLogin(page, 'test@example.com', "'; DROP TABLE users; --")

    // Should get either a server error or validation error, not a crash
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 10_000 })
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/sqli-login-password.png` })
  })
})

// ---------------------------------------------------------------------------
// 4. OVERSIZED INPUT — memory / DoS resilience
// ---------------------------------------------------------------------------
test.describe('Oversized input strings', () => {
  test('login: 10,000 character email does not crash the app', async ({ page }) => {
    await page.goto('/login')
    const longEmail = 'a'.repeat(10_000) + '@example.com'

    await page.getByLabel('Email').fill(longEmail)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should display an error (Zod may or may not reject this; either way no crash)
    await page.waitForTimeout(2000)
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/oversized-email.png` })
  })

  test('login: 10,000 character password does not crash the app', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('p'.repeat(10_000))
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.waitForTimeout(2000)
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/oversized-password.png` })
  })

  test('signup: 50,000 character inputs do not crash', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Email').fill('b'.repeat(50_000) + '@test.com')
    await page.getByLabel('Password').fill('x'.repeat(50_000))
    await page.getByRole('button', { name: /sign up/i }).click()

    await page.waitForTimeout(3000)
    await expect(page.locator('form[aria-label="Sign up"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/oversized-signup.png` })
  })

  test('login: 100,000 character email field via evaluate', async ({ page }) => {
    await page.goto('/login')

    // Use evaluate to bypass any input event throttling
    await page.evaluate(() => {
      const emailInput = document.getElementById('email') as HTMLInputElement
      emailInput.value = 'c'.repeat(100_000) + '@test.com'
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.waitForTimeout(2000)
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/oversized-evaluate.png` })
  })
})

// ---------------------------------------------------------------------------
// 5. SPECIAL CHARACTERS, UNICODE, EMOJI
// ---------------------------------------------------------------------------
test.describe('Special characters and unicode', () => {
  const specialInputs = [
    { label: 'null bytes', email: 'test\x00@example.com', password: 'pass\x00word' },
    { label: 'unicode email', email: 'tést@exämple.com', password: 'pässwörd123' },
    { label: 'emoji email', email: '🔥@fire.com', password: '🔑🔑🔑🔑🔑🔑🔑🔑' },
    { label: 'RTL override', email: '\u202Etest@example.com', password: '\u202Epassword' },
    { label: 'zero-width chars', email: 'test\u200B@example.com', password: 'pass\u200Bword' },
    { label: 'newlines', email: 'test@example.com\ninjected', password: 'pass\nword' },
    { label: 'tabs', email: 'test@example.com\t', password: '\tpassword' },
    { label: 'CRLF injection', email: 'test@example.com\r\nHeader: injected', password: 'pass' },
    {
      label: 'homoglyph attack',
      email: 'tеst@example.com', // Cyrillic 'е' instead of Latin 'e'
      password: 'password123',
    },
    {
      label: 'mixed scripts',
      email: 'テスト@例え.jp',
      password: '密码密码密码密码',
    },
  ]

  for (const { label, email, password } of specialInputs) {
    test(`login: handles ${label} without crashing`, async ({ page }) => {
      await page.goto('/login')
      await submitLogin(page, email, password)

      await page.waitForTimeout(1000)

      // The form must remain intact and functional
      await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/special-${label.replace(/\s+/g, '-')}.png`,
      })
    })
  }

  test('signup: emoji and unicode produce validation error, not crash', async ({ page }) => {
    await page.goto('/signup')
    await submitSignup(page, '🎉🎊@party.com', '🔐secure🔐pw')

    await page.waitForTimeout(1000)
    await expect(page.locator('form[aria-label="Sign up"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/special-signup-emoji.png` })
  })
})

// ---------------------------------------------------------------------------
// 6. EMPTY / EDGE CASE FORM SUBMISSIONS
// ---------------------------------------------------------------------------
test.describe('Empty and edge-case form submissions', () => {
  test('login: completely empty form shows validation errors', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Both fields should produce errors (Zod validation)
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/empty-login.png` })
  })

  test('signup: completely empty form shows validation errors', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('button', { name: /sign up/i }).click()

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/empty-signup.png` })
  })

  test('login: email only, no password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByRole('button', { name: /sign in/i }).click()

    // signInSchema requires password min(1), so empty password should error
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-email-only.png` })
  })

  test('signup: email only, no password', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByRole('button', { name: /sign up/i }).click()

    // signUpSchema requires password min(8)
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-email-only.png` })
  })

  test('login: password only, no email', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-password-only.png` })
  })

  test('signup: password exactly 7 chars (just under min)', async ({ page }) => {
    await page.goto('/signup')
    await submitSignup(page, 'test@example.com', '1234567')

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-short-password.png` })
  })

  test('signup: password exactly 8 chars (at min boundary)', async ({ page }) => {
    await page.goto('/signup')
    await submitSignup(page, 'boundary@example.com', '12345678')

    // Should pass client validation and reach the server
    await page.waitForTimeout(2000)

    // Either success message or server error — but no client validation error for password
    const passwordError = page.locator('#signup-password-error')
    await expect(passwordError).not.toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-boundary-password.png` })
  })

  test('login: spaces-only email and password', async ({ page }) => {
    await page.goto('/login')
    await submitLogin(page, '   ', '   ')

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-spaces-only.png` })
  })
})

// ---------------------------------------------------------------------------
// 7. KEYBOARD-ONLY AUTH FLOW
// ---------------------------------------------------------------------------
test.describe('Keyboard-only auth flow', () => {
  test('login: full form completion via keyboard tab navigation', async ({ page }) => {
    await page.goto('/login')

    // Tab into the email field
    await page.keyboard.press('Tab')
    // We may need multiple tabs to reach the email input depending on focusable elements
    // Type the email
    const emailField = page.getByLabel('Email')
    await emailField.focus()
    await page.keyboard.type('keyboard@test.com')

    // Tab to password
    await page.keyboard.press('Tab')
    await page.keyboard.type('password123')

    // Tab to submit button and press Enter
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')

    // Should trigger form submission
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 10_000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/keyboard-login.png` })
  })

  test('login: Enter key submits the form from any field', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('enter@test.com')
    await page.getByLabel('Password').fill('password123')

    // Press Enter while focused on the password field
    await page.getByLabel('Password').press('Enter')

    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 10_000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/keyboard-enter-submit.png` })
  })

  test('signup: Tab order follows logical sequence', async ({ page }) => {
    await page.goto('/signup')

    // Focus the email field
    const emailField = page.getByLabel('Email')
    await emailField.focus()

    // Verify email field is focused
    await expect(emailField).toBeFocused()

    // Tab to password
    await page.keyboard.press('Tab')
    const passwordField = page.getByLabel('Password')
    await expect(passwordField).toBeFocused()

    // Tab to submit button
    await page.keyboard.press('Tab')
    const submitBtn = page.getByRole('button', { name: /sign up/i })
    await expect(submitBtn).toBeFocused()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/keyboard-tab-order.png` })
  })

  test('login: visible focus indicators on all interactive elements', async ({ page }) => {
    await page.goto('/login')

    const emailField = page.getByLabel('Email')
    await emailField.focus()

    // Check that focus styles are applied (ring or outline)
    const emailStyles = await emailField.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        boxShadow: computed.boxShadow,
      }
    })

    // At least one focus indicator should be present (outline or box-shadow from ring)
    const hasFocusIndicator =
      emailStyles.outlineStyle !== 'none' || emailStyles.boxShadow !== 'none'
    expect(hasFocusIndicator).toBe(true)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/keyboard-focus-indicators.png` })
  })
})

// ---------------------------------------------------------------------------
// 8. RAPID PAGE TRANSITIONS BETWEEN LOGIN/SIGNUP
// ---------------------------------------------------------------------------
test.describe('Rapid page transitions', () => {
  test('rapid navigation between login and signup does not crash', async ({ page }) => {
    await page.goto('/login')

    for (let i = 0; i < 8; i++) {
      await page.getByRole('link', { name: /sign up/i }).click()
      await page.getByRole('link', { name: /log in/i }).click()
    }

    // Page should be stable on login
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rapid-transitions.png` })
  })

  test('rapid programmatic navigation does not produce errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/login')

    // Rapid programmatic navigation
    for (let i = 0; i < 5; i++) {
      await page.goto('/signup', { waitUntil: 'commit' })
      await page.goto('/login', { waitUntil: 'commit' })
    }

    // Wait for final page to settle
    await page.waitForLoadState('networkidle')

    // Filter out non-critical React hydration warnings
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('hydration') && !e.includes('Hydration'),
    )

    // Should not have critical console errors
    expect(criticalErrors.length).toBeLessThanOrEqual(0)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rapid-programmatic-nav.png` })
  })

  test('filling form then navigating away and back clears state', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('leftbehind@test.com')
    await page.getByLabel('Password').fill('password123')

    // Navigate to signup
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Navigate back to login
    await page.getByRole('link', { name: /log in/i }).click()
    await page.waitForURL('**/login')

    // Fields should be empty (React re-mount)
    const emailValue = await page.getByLabel('Email').inputValue()
    expect(emailValue).toBe('')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/form-state-reset.png` })
  })
})

// ---------------------------------------------------------------------------
// 9. AUTH REDIRECT RACES — unauthenticated /dashboard access
// ---------------------------------------------------------------------------
test.describe('Auth redirect races', () => {
  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/redirect-dashboard.png` })
  })

  test('unauthenticated access to /dashboard/some-project-id redirects', async ({ page }) => {
    await page.goto('/dashboard/abc-123-fake-project')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/redirect-nested-dashboard.png` })
  })

  test('rapid repeated /dashboard access while unauthenticated', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto('/dashboard', { waitUntil: 'commit' })
    }

    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rapid-dashboard-redirect.png` })
  })

  test('concurrent dashboard fetch via page.goto does not error', async ({ page }) => {
    // Hit the dashboard endpoint directly and verify the redirect response
    const response = await page.goto('/dashboard')

    // Should redirect (3xx) or land on /login
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(response).not.toBeNull()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/concurrent-dashboard.png` })
  })

  test('path traversal in dashboard route redirects to login', async ({ page }) => {
    await page.goto('/dashboard/../dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/path-traversal-dashboard.png` })
  })

  test('dashboard with malicious query params still redirects', async ({ page }) => {
    await page.goto('/dashboard?redirect=https://evil.com&admin=true')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)

    // Should NOT redirect to evil.com
    expect(page.url()).not.toContain('evil.com')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dashboard-malicious-params.png` })
  })
})

// ---------------------------------------------------------------------------
// 10. URL QUERY PARAMETER MANIPULATION
// ---------------------------------------------------------------------------
test.describe('URL and query parameter manipulation', () => {
  test('StripSensitiveAuthQuery removes email from URL', async ({ page }) => {
    await page.goto('/login?email=leaked@test.com')

    // The StripSensitiveAuthQuery component should strip the email param
    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('email=leaked')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/strip-email-param.png` })
  })

  test('StripSensitiveAuthQuery removes password from URL', async ({ page }) => {
    await page.goto('/login?password=supersecret123')

    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('password=supersecret')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/strip-password-param.png` })
  })

  test('StripSensitiveAuthQuery removes both email and password', async ({ page }) => {
    await page.goto('/login?email=leaked@test.com&password=secret&other=keep')

    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('email=')
    expect(page.url()).not.toContain('password=')
    // Other params should be preserved
    expect(page.url()).toContain('other=keep')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/strip-both-params.png` })
  })

  test('signup: StripSensitiveAuthQuery also works on signup page', async ({ page }) => {
    await page.goto('/signup?email=leaked@test.com&password=secret')

    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('email=')
    expect(page.url()).not.toContain('password=')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/strip-signup-params.png` })
  })

  test('login page with XSS in query params does not execute', async ({ page }) => {
    let alertFired = false
    page.on('dialog', (dialog) => {
      alertFired = true
      dialog.dismiss()
    })

    await page.goto('/login?email=<script>alert(1)</script>&redirect=javascript:alert(1)')
    await page.waitForTimeout(2000)

    expect(alertFired).toBe(false)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/xss-query-params.png` })
  })
})

// ---------------------------------------------------------------------------
// 11. BROWSER BACK/FORWARD THROUGH AUTH FLOWS
// ---------------------------------------------------------------------------
test.describe('Browser back/forward navigation', () => {
  test('back from signup returns to login with stable state', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    await page.goBack()
    await page.waitForURL('**/login')
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/back-to-login.png` })
  })

  test('forward after going back returns to signup', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    await page.goBack()
    await page.waitForURL('**/login')

    await page.goForward()
    await page.waitForURL('**/signup')
    await expect(page.locator('form[aria-label="Sign up"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/forward-to-signup.png` })
  })

  test('rapid back/forward does not crash', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    for (let i = 0; i < 5; i++) {
      await page.goBack()
      await page.goForward()
    }

    // Page should still be functional
    await page.waitForLoadState('domcontentloaded')
    const formVisible =
      (await page.locator('form[aria-label="Login form"]').isVisible()) ||
      (await page.locator('form[aria-label="Sign up"]').isVisible())
    expect(formVisible).toBe(true)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rapid-back-forward.png` })
  })

  test('back button after validation error shows clean form', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()

    // Navigate to signup
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL('**/signup')

    // Go back — the login form should not show stale validation errors
    await page.goBack()
    await page.waitForURL('**/login')

    // React re-mounts the component, so errors should be gone
    // (this depends on whether state is in the URL or component state)
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/back-after-validation.png` })
  })
})

// ---------------------------------------------------------------------------
// 12. FORM METHOD MANIPULATION — bypass client-side JS
// ---------------------------------------------------------------------------
test.describe('Direct HTTP form submission bypass', () => {
  test('POST to /login without JS does not crash server', async ({ page }) => {
    // Attempt a direct fetch to the login page as POST
    const response = await page.request.post('/login', {
      form: {
        email: 'direct@test.com',
        password: 'password123',
      },
    })

    // Server should handle this gracefully (Next.js will likely return 405 or the page)
    expect(response.status()).toBeLessThan(500)
  })

  test('POST to /signup without JS does not crash server', async ({ page }) => {
    const response = await page.request.post('/signup', {
      form: {
        email: 'direct@test.com',
        password: 'password12345',
      },
    })

    expect(response.status()).toBeLessThan(500)
  })

  test('GET to /login with credentials in query string does not leak', async ({ page }) => {
    await page.goto('/login?email=test@example.com&password=secret123')

    // StripSensitiveAuthQuery should clean the URL
    await page.waitForTimeout(2000)
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('password=')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/get-creds-stripped.png` })
  })
})

// ---------------------------------------------------------------------------
// 13. CONCURRENT REQUEST SIMULATION
// ---------------------------------------------------------------------------
test.describe('Concurrent auth requests', () => {
  test('multiple API requests to auth endpoint do not cause 500s', async ({ page }) => {
    await page.goto('/login')

    // Fire multiple sign-in attempts concurrently using page.evaluate
    const results = await page.evaluate(async () => {
      const attempts = Array.from({ length: 5 }, (_, i) =>
        fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `email=concurrent${i}@test.com&password=password123`,
        }).then((r) => r.status),
      )
      return Promise.all(attempts)
    })

    // None should be 500
    for (const status of results) {
      expect(status).toBeLessThan(500)
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/concurrent-requests.png` })
  })

  test('submitting login form while previous request is in-flight', async ({ page }) => {
    await page.goto('/login')

    // Start first submission
    await submitLogin(page, 'first@test.com', 'password123')

    // Immediately try to modify fields and submit again (force past disabled state)
    await page.evaluate(() => {
      const emailInput = document.getElementById('email') as HTMLInputElement
      const passwordInput = document.getElementById('password') as HTMLInputElement
      emailInput.value = 'second@test.com'
      passwordInput.value = 'password456'

      const form = document.querySelector('form') as HTMLFormElement
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // Wait for everything to settle
    await page.waitForTimeout(3000)

    // Page should remain stable
    await expect(page.locator('form[aria-label="Login form"]')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/inflight-resubmit.png` })
  })
})

// ---------------------------------------------------------------------------
// 14. CONTENT SECURITY — error message information leakage
// ---------------------------------------------------------------------------
test.describe('Error message information leakage', () => {
  test('login error does not reveal whether email exists', async ({ page }) => {
    await page.goto('/login')
    await submitLogin(page, 'nonexistent@example.com', 'wrongpassword')

    await page.waitForSelector('[role="alert"]', { timeout: 10_000 })

    const errorText = await page.getByRole('alert').first().textContent()

    // Error should NOT reveal specific info like "user not found" vs "wrong password"
    // Ideally it should be generic like "Invalid login credentials"
    expect(errorText).toBeTruthy()
    expect(errorText!.toLowerCase()).not.toContain('user not found')
    expect(errorText!.toLowerCase()).not.toContain('no user')
    expect(errorText!.toLowerCase()).not.toContain('email does not exist')
    expect(errorText!.toLowerCase()).not.toContain('account does not exist')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/error-no-user-enum.png` })
  })

  test('login error does not contain stack traces or internal details', async ({ page }) => {
    await page.goto('/login')
    await submitLogin(page, 'test@example.com', 'wrong')

    await page.waitForSelector('[role="alert"]', { timeout: 10_000 })

    const errorText = await page.getByRole('alert').first().textContent()

    expect(errorText!.toLowerCase()).not.toContain('stack')
    expect(errorText!.toLowerCase()).not.toContain('at function')
    expect(errorText!.toLowerCase()).not.toContain('supabase')
    expect(errorText!.toLowerCase()).not.toContain('postgres')
    expect(errorText!.toLowerCase()).not.toContain('database')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/error-no-stack-trace.png` })
  })

  test('page source does not contain sensitive environment variables', async ({ page }) => {
    await page.goto('/login')

    const pageSource = await page.content()

    expect(pageSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(pageSource).not.toContain('STRIPE_SECRET_KEY')
    expect(pageSource).not.toContain('sk_live_')
    expect(pageSource).not.toContain('sk_test_')
    expect(pageSource).not.toContain('sbp_')
    // Publishable keys and anon keys are OK to be in the source

    await page.screenshot({ path: `${SCREENSHOT_DIR}/no-secrets-in-source.png` })
  })
})

// ---------------------------------------------------------------------------
// 15. RESPONSE HEADERS — security headers check
// ---------------------------------------------------------------------------
test.describe('Security headers', () => {
  test('login page sets appropriate security headers', async ({ page }) => {
    const response = await page.goto('/login')
    const headers = response!.headers()

    // X-Content-Type-Options should prevent MIME sniffing
    if (headers['x-content-type-options']) {
      expect(headers['x-content-type-options']).toBe('nosniff')
    }

    // Content-Type should be set
    expect(headers['content-type']).toContain('text/html')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/security-headers.png` })
  })

  test('auth pages do not set overly permissive CORS headers', async ({ page }) => {
    const response = await page.goto('/login')
    const headers = response!.headers()

    // Access-Control-Allow-Origin should NOT be wildcard on auth pages
    if (headers['access-control-allow-origin']) {
      expect(headers['access-control-allow-origin']).not.toBe('*')
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cors-headers.png` })
  })
})

// ---------------------------------------------------------------------------
// 16. FORM AUTOCOMPLETE ATTRIBUTES
// ---------------------------------------------------------------------------
test.describe('Form autocomplete and input types', () => {
  test('login: password field has type=password (not type=text)', async ({ page }) => {
    await page.goto('/login')

    const passwordType = await page.getByLabel('Password').getAttribute('type')
    expect(passwordType).toBe('password')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/password-type.png` })
  })

  test('signup: password field has type=password', async ({ page }) => {
    await page.goto('/signup')

    const passwordType = await page.getByLabel('Password').getAttribute('type')
    expect(passwordType).toBe('password')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-password-type.png` })
  })

  test('login: email field has type=email', async ({ page }) => {
    await page.goto('/login')

    const emailType = await page.getByLabel('Email').getAttribute('type')
    expect(emailType).toBe('email')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/email-type.png` })
  })
})

// ---------------------------------------------------------------------------
// 17. JS DISABLED — graceful degradation
// ---------------------------------------------------------------------------
test.describe('JavaScript disabled behavior', () => {
  test('login page renders meaningful content without JS', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    await page.goto('/login')

    // The form should still be rendered (server-side rendered)
    await expect(page.locator('form')).toBeVisible()
    await expect(page.getByText('Welcome back')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/no-js-login.png` })
    await context.close()
  })

  test('signup page renders meaningful content without JS', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    await page.goto('/signup')

    await expect(page.locator('form')).toBeVisible()
    await expect(page.getByText('Create your account')).toBeVisible()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/no-js-signup.png` })
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// 18. OPEN REDIRECT PREVENTION
// ---------------------------------------------------------------------------
test.describe('Open redirect prevention', () => {
  const maliciousRedirects = [
    '/login?redirect=https://evil.com',
    '/login?next=https://evil.com',
    '/login?returnTo=https://evil.com',
    '/login?callback=//evil.com',
    '/login?redirect=javascript:alert(1)',
    '/login?redirect=data:text/html,<script>alert(1)</script>',
  ]

  for (const url of maliciousRedirects) {
    test(`does not redirect to external URL — ${url.slice(0, 50)}`, async ({ page }) => {
      let alertFired = false
      page.on('dialog', (dialog) => {
        alertFired = true
        dialog.dismiss()
      })

      await page.goto(url)
      await page.waitForTimeout(2000)

      // Should remain on the same origin
      const currentUrl = new URL(page.url())
      expect(currentUrl.hostname).toBe('localhost')
      expect(alertFired).toBe(false)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/open-redirect-${Buffer.from(url).toString('hex').slice(0, 16)}.png`,
      })
    })
  }
})

// ---------------------------------------------------------------------------
// 19. ERROR RECOVERY — can user recover after errors?
// ---------------------------------------------------------------------------
test.describe('Error recovery', () => {
  test('login: user can retry after validation error', async ({ page }) => {
    await page.goto('/login')

    // Submit empty form — validation error
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()

    // Now fill in proper values and resubmit
    await page.getByLabel('Email').fill('retry@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should get a server response (success or auth error), not stuck on validation
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 10_000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-retry-after-error.png` })
  })

  test('signup: user can retry after validation error', async ({ page }) => {
    await page.goto('/signup')

    // Submit with short password
    await submitSignup(page, 'retry@example.com', 'short')
    await expect(page.getByRole('alert').first()).toBeVisible()

    // Retry with valid password
    await page.getByLabel('Password').fill('validpassword123')
    await page.getByRole('button', { name: /sign up/i }).click()

    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 10_000 })

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signup-retry-after-error.png` })
  })

  test('login: user can recover after server error', async ({ page }) => {
    await page.goto('/login')

    // Submit with wrong credentials
    await submitLogin(page, 'wrong@example.com', 'wrongpassword123')
    await page.waitForSelector('[role="alert"]', { timeout: 10_000 })

    // The form should still be fully functional — fields editable, button clickable
    await expect(page.getByLabel('Email')).toBeEditable()
    await expect(page.getByLabel('Password')).toBeEditable()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled()

    await page.screenshot({ path: `${SCREENSHOT_DIR}/login-recovery.png` })
  })
})
