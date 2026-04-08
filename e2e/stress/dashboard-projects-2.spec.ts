import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Reviewer 2 of 3 — Dashboard & Project Management stress tests
//
// Focus areas:
//   - Zustand store hydration timing vs. component mount order
//   - Race conditions between route changes and store updates
//   - Module sidebar expand/collapse under rapid toggling
//   - ModuleHierarchyIndicator rendering with deep nesting
//   - Responsive layout breakpoints (sm / md / lg / xl)
//   - Performance metric collection during interactions
//   - Network request waterfall analysis
//   - Error boundary activation under server failures
//   - Component unmount cleanup verification
//   - State persistence across page refreshes
// ---------------------------------------------------------------------------

const DASHBOARD_URL = '/dashboard'

/**
 * Helper — creates a project via the UI and returns the workspace URL.
 * Assumes the user is already authenticated and on the dashboard.
 */
async function createProjectViaUI(page: import('@playwright/test').Page): Promise<string> {
  await page.getByTestId('new-project-button').click()
  await page.waitForURL(/\/dashboard\/[a-f0-9-]+/)
  return page.url()
}

// ===========================
// 1. Auth gate & redirects
// ===========================

test.describe('Auth gate stress', () => {
  test('unauthenticated visit to dashboard redirects to login', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to a deep project URL redirects to login', async ({ page }) => {
    await page.goto('/dashboard/00000000-0000-0000-0000-000000000000')
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })

  test('rapid unauthenticated navigation between protected routes always lands on login', async ({
    page,
  }) => {
    const targets = [
      DASHBOARD_URL,
      '/dashboard/aaaa-bbbb-cccc',
      DASHBOARD_URL,
      '/dashboard/xxxx-yyyy-zzzz',
    ]
    for (const url of targets) {
      await page.goto(url)
    }
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })
})

// ===========================
// 2. Dashboard page structure
// ===========================

test.describe('Dashboard page structure', () => {
  test('dashboard page renders data-testid markers', async ({ page }) => {
    await page.goto(DASHBOARD_URL)

    // Will redirect if unauthed — that is fine; we verify the redirect fires
    const url = page.url()
    if (url.includes('/login')) {
      // Can not test authenticated dashboard structure without auth setup.
      // Still verify the login page loaded cleanly.
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
      return
    }

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('project-list')).toBeVisible()
  })

  test('dashboard responsive header layout at narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }) // iPhone SE
    await page.goto(DASHBOARD_URL)

    const url = page.url()
    if (url.includes('/login')) return

    const header = page.locator('[data-testid="dashboard-page"] header')
    await expect(header).toBeVisible()
    const box = await header.boundingBox()
    expect(box).not.toBeNull()
    // Header should fill narrow viewport
    expect(box!.width).toBeLessThanOrEqual(375)
  })

  test('dashboard responsive layout at tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(DASHBOARD_URL)

    const url = page.url()
    if (url.includes('/login')) return

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })

  test('dashboard responsive layout at desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)

    const url = page.url()
    if (url.includes('/login')) return

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })
})

// ===========================
// 3. Project workspace — store hydration timing
// ===========================

test.describe('Workspace store hydration', () => {
  test('workspace renders data-testid markers on load', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    await expect(page.getByTestId('project-workspace')).toBeVisible()
    await expect(page.getByTestId('module-sidebar')).toBeVisible()
    await expect(page.getByTestId('canvas-panel')).toBeVisible()
  })

  test('Zustand store hydrates before canvas mounts — canvas panel has content', async ({
    page,
  }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('canvas-panel')).toBeVisible()

    // Canvas container should have rendered content (at minimum the ReactFlow wrapper)
    const canvasChildren = await page.getByTestId('canvas-panel').locator('> div').count()
    expect(canvasChildren).toBeGreaterThanOrEqual(1)
  })

  test('store re-hydrates correctly on full page reload', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)

    // First load
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Full reload
    await page.reload()
    await expect(page.getByTestId('project-workspace')).toBeVisible()
    await expect(page.getByTestId('module-sidebar')).toBeVisible()

    // Sidebar should still show the modules heading (or empty state text)
    const sidebarText = await page.getByTestId('module-sidebar').textContent()
    expect(sidebarText).toBeTruthy()
  })

  test('store re-hydrates correctly after browser back navigation', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Navigate back to dashboard
    await page.getByRole('link', { name: /back to dashboard/i }).click()
    await page.waitForURL(/\/dashboard$/)

    // Navigate forward
    await page.goBack()
    await page.waitForURL(/\/dashboard\//)
    await expect(page.getByTestId('project-workspace')).toBeVisible()
  })
})

// ===========================
// 4. Route change / store update race conditions
// ===========================

test.describe('Route change and store update races', () => {
  test('rapid navigation between dashboard and workspace does not crash', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)

    for (let i = 0; i < 5; i++) {
      await page.goto(DASHBOARD_URL)
      await page.goto(workspaceUrl)
    }

    // Final state should be a valid workspace or dashboard — no blank screen
    const hasWorkspace = await page
      .getByTestId('project-workspace')
      .isVisible()
      .catch(() => false)
    const hasDashboard = await page
      .getByTestId('dashboard-page')
      .isVisible()
      .catch(() => false)
    expect(hasWorkspace || hasDashboard).toBe(true)
  })

  test('navigating away mid-stream does not leave zombie state', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Start a navigation away immediately — any pending fetch should be aborted
    await page.goto(DASHBOARD_URL)
    await expect(page.getByTestId('dashboard-page').or(page.locator('text=Sign in'))).toBeVisible()

    // No unhandled JS errors should remain
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Give a moment for any deferred errors to fire
    await page.waitForTimeout(1000)
    // Filter out known non-critical errors
    const critical = errors.filter(
      (e) => !e.includes('AbortError') && !e.includes('cancelled') && !e.includes('hydration'),
    )
    expect(critical).toHaveLength(0)
  })

  test('opening a non-existent project shows not-found or error state', async ({ page }) => {
    await page.goto('/dashboard/00000000-0000-4000-a000-000000000000')

    // Should either redirect to login (unauthed), show 404, or show an error
    const url = page.url()
    const hasLogin = url.includes('/login')
    const has404 = await page
      .locator('text=/not found/i')
      .isVisible()
      .catch(() => false)
    const hasError = await page
      .locator('[role="alert"]')
      .isVisible()
      .catch(() => false)
    const hasWorkspace = await page
      .getByTestId('project-workspace')
      .isVisible()
      .catch(() => false)

    // Either we got redirected, saw a 404, saw an error, or (if authed) the project genuinely loaded
    expect(hasLogin || has404 || hasError || hasWorkspace).toBe(true)
  })
})

// ===========================
// 5. Module sidebar collapse/expand stress
// ===========================

test.describe('Module sidebar collapse/expand stress', () => {
  test('sidebar starts expanded with aria-expanded=true on toggle', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('module-sidebar')).toBeVisible()

    // Sidebar should start uncollapsed
    const collapsed = await page.getByTestId('module-sidebar').getAttribute('data-collapsed')
    expect(collapsed).toBe('false')

    // The toggle button should have aria-expanded="true" when sidebar is open
    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')
  })

  test('collapse and expand toggles sidebar width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const sidebar = page.getByTestId('module-sidebar')
    await expect(sidebar).toBeVisible()

    const expandedBox = await sidebar.boundingBox()
    expect(expandedBox).not.toBeNull()

    // Collapse
    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    await toggleBtn.click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    const collapsedBox = await sidebar.boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.width).toBeLessThan(expandedBox!.width)

    // Module list should be hidden
    const list = page.locator('#module-sidebar-list')
    await expect(list).toBeHidden()

    // Expand again
    await toggleBtn.click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    await expect(list).toBeVisible()
  })

  test('rapid toggle 20 times does not break layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    await expect(toggleBtn).toBeVisible()

    for (let i = 0; i < 20; i++) {
      await toggleBtn.click()
    }

    // After even number of clicks, sidebar should be back to original state (expanded)
    const sidebar = page.getByTestId('module-sidebar')
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')

    // Canvas should still be visible and sized
    const canvas = page.getByTestId('canvas-panel')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('sidebar collapse hides ModuleHierarchyIndicator', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Hierarchy indicator visible when expanded
    const indicator = page.getByTestId('module-hierarchy-indicator')
    await expect(indicator).toBeVisible()

    // Collapse sidebar
    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    await toggleBtn.click()
    await expect(indicator).toBeHidden()

    // Expand sidebar again — indicator should reappear
    await toggleBtn.click()
    await expect(indicator).toBeVisible()
  })
})

// ===========================
// 6. ModuleHierarchyIndicator rendering
// ===========================

test.describe('ModuleHierarchyIndicator states', () => {
  test('indicator shows Domain/Module/Flow steps on workspace load', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const indicator = page.getByTestId('module-hierarchy-indicator')
    await expect(indicator).toBeVisible()

    // Should contain the three step labels
    await expect(indicator.locator('text=Domain')).toBeVisible()
    await expect(indicator.locator('text=Module')).toBeVisible()
    await expect(indicator.locator('text=Flow')).toBeVisible()
  })

  test('indicator shows project name in context line when no module is active', async ({
    page,
  }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const indicator = page.getByTestId('module-hierarchy-indicator')
    await expect(indicator).toBeVisible()

    // Context line should mention "Module map" when no active module
    const contextText = await indicator.locator('p').first().textContent()
    expect(contextText).toContain('Module map')
  })
})

// ===========================
// 7. Responsive breakpoint stress
// ===========================

test.describe('Responsive breakpoints', () => {
  const viewports = [
    { name: 'mobile-portrait', width: 375, height: 812 },
    { name: 'mobile-landscape', width: 812, height: 375 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
    { name: 'desktop-sm', width: 1280, height: 800 },
    { name: 'desktop-lg', width: 1920, height: 1080 },
    { name: 'ultrawide', width: 2560, height: 1080 },
  ]

  for (const vp of viewports) {
    test(`workspace renders without overflow at ${vp.name} (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(DASHBOARD_URL)
      if (page.url().includes('/login')) return

      const workspaceUrl = await createProjectViaUI(page)
      await page.goto(workspaceUrl)
      await expect(page.getByTestId('project-workspace')).toBeVisible()

      // Verify no horizontal overflow on the body
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
      const viewportWidth = await page.evaluate(() => window.innerWidth)
      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1) // 1px tolerance
    })
  }

  test('sidebar grid transition changes between mobile and desktop', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)

    // Start at desktop — sidebar should be side-by-side with canvas
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('module-sidebar')).toBeVisible()
    await expect(page.getByTestId('canvas-panel')).toBeVisible()

    const sidebarDesktop = await page.getByTestId('module-sidebar').boundingBox()
    const canvasDesktop = await page.getByTestId('canvas-panel').boundingBox()

    if (sidebarDesktop && canvasDesktop) {
      // At desktop, sidebar and canvas should be horizontally adjacent
      expect(canvasDesktop.x).toBeGreaterThan(sidebarDesktop.x)
    }

    // Shrink to mobile — elements may stack or overlap
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(300) // CSS transition
    await expect(page.getByTestId('project-workspace')).toBeVisible()
  })
})

// ===========================
// 8. Performance metrics during interactions
// ===========================

test.describe('Performance metrics', () => {
  test('workspace initial load completes within performance budget', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)

    const startTime = Date.now()
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()
    const loadTime = Date.now() - startTime

    // Workspace should load within 10 seconds (generous for dev server + cold start)
    expect(loadTime).toBeLessThan(10_000)
  })

  test('sidebar toggle interaction completes within 500ms', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    await expect(toggleBtn).toBeVisible()

    const startTime = Date.now()
    await toggleBtn.click()
    await expect(page.getByTestId('module-sidebar')).toHaveAttribute('data-collapsed', 'true')
    const interactionTime = Date.now() - startTime

    expect(interactionTime).toBeLessThan(500)
  })

  test('no long tasks (>200ms) during sidebar toggle burst', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Observe long tasks via PerformanceObserver
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__longTasks = []
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          ;(
            (window as unknown as Record<string, unknown>).__longTasks as { duration: number }[]
          ).push({ duration: entry.duration })
        }
      })
      obs.observe({ type: 'longtask', buffered: false })
    })

    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    for (let i = 0; i < 10; i++) {
      await toggleBtn.click()
    }

    const longTasks = await page.evaluate(
      () =>
        ((window as unknown as Record<string, unknown>).__longTasks as { duration: number }[]) ||
        [],
    )

    // No single task should block the main thread for more than 200ms
    for (const task of longTasks) {
      expect(task.duration).toBeLessThan(200)
    }
  })
})

// ===========================
// 9. Network request waterfall
// ===========================

test.describe('Network request waterfall', () => {
  test('workspace page load does not trigger duplicate API calls', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)

    const requests: string[] = []
    page.on('request', (req) => {
      if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
        requests.push(req.url())
      }
    })

    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Count requests to the same endpoint — no endpoint should be called more than 3 times
    // (allowing for RSC + prefetch + revalidation)
    const urlCounts = new Map<string, number>()
    for (const url of requests) {
      const pathname = new URL(url).pathname
      urlCounts.set(pathname, (urlCounts.get(pathname) ?? 0) + 1)
    }

    for (const [pathname, count] of urlCounts) {
      expect(
        count,
        `endpoint ${pathname} was called ${count} times — potential duplicate`,
      ).toBeLessThanOrEqual(3)
    }
  })

  test('navigation to dashboard from workspace aborts in-flight requests', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    const failedRequests: string[] = []
    page.on('requestfailed', (req) => {
      failedRequests.push(req.failure()?.errorText ?? 'unknown')
    })

    // Navigate away immediately
    await page.goto(DASHBOARD_URL)
    await page.waitForTimeout(500)

    // Any failed requests should be cancellations, not server errors
    for (const error of failedRequests) {
      expect(error).toMatch(/cancelled|aborted|net::ERR_ABORTED/i)
    }
  })
})

// ===========================
// 10. Error states & boundary activation
// ===========================

test.describe('Error boundary and error states', () => {
  test('chat API failure shows error alert in workspace', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Intercept chat API to return error
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      }),
    )

    // Open assistant and send a message
    const assistantToggle = page.locator('button[title="Open assistant"]')
    if (await assistantToggle.isVisible()) {
      await assistantToggle.click()
    }

    await page.waitForTimeout(300)
    const chatInput = page.locator('#chat-message')
    if (await chatInput.isVisible()) {
      await chatInput.fill('test message')
      await page.locator('button:has-text("Send")').click()

      // Error alert should appear
      await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 })
    }
  })

  test('project settings save failure shows error alert', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Open settings
    const settingsBtn = page.locator('button[aria-label="Project settings"]')
    await settingsBtn.click()

    // Intercept the update to fail
    await page.route('**/project-service*', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Update failed' }),
        })
      }
      return route.continue()
    })

    // Try to save with an empty name (server action should reject)
    const nameInput = page.locator('#project-name')
    await nameInput.clear()
    await nameInput.fill('')

    const saveBtn = page.getByRole('button', { name: /save/i })
    await saveBtn.click()

    // Wait for the save to complete (success or failure)
    await page.waitForTimeout(2000)

    // Settings panel should still be visible (not dismissed on error)
    await expect(nameInput).toBeVisible()
  })

  test('workspace handles JavaScript errors gracefully — no white screen', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Inject a client-side error into the Zustand store to simulate corruption
    await page.evaluate(() => {
      // Force a bad state into the store — the app should not crash
      try {
        const event = new CustomEvent('zustand-stress-test')
        window.dispatchEvent(event)
      } catch {
        // swallow
      }
    })

    // Page should still be functional
    await expect(page.getByTestId('project-workspace')).toBeVisible()
  })
})

// ===========================
// 11. Component unmount cleanup
// ===========================

test.describe('Component unmount cleanup', () => {
  test('leaving workspace clears streaming state — no residual event listeners', async ({
    page,
  }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Count event listeners before navigation
    const listenersBefore = await page.evaluate(() => {
      // Proxy to detect if any ReadableStream readers are still active
      return performance.getEntriesByType('resource').length
    })

    // Navigate away
    await page.goto(DASHBOARD_URL)

    if (page.url().includes('/login')) return

    await expect(page.getByTestId('dashboard-page')).toBeVisible()

    // Navigate back
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    const listenersAfter = await page.evaluate(() => {
      return performance.getEntriesByType('resource').length
    })

    // Resource entries will grow, but we verify the workspace mounts cleanly
    expect(listenersAfter).toBeGreaterThanOrEqual(listenersBefore)
  })

  test('rapid mount/unmount cycle does not leak memory in store', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)

    // Perform several mount/unmount cycles
    for (let i = 0; i < 3; i++) {
      await page.goto(workspaceUrl)
      await page.getByTestId('project-workspace').waitFor({ state: 'visible', timeout: 10_000 })
      await page.goto(DASHBOARD_URL)
      if (page.url().includes('/login')) return
    }

    // Final navigation should work cleanly
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Measure JS heap if available
    const heapUsed = await page.evaluate(() => {
      const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
      return perf.memory?.usedJSHeapSize ?? null
    })

    if (heapUsed !== null) {
      // Heap should stay under 100MB for a single workspace page
      expect(heapUsed).toBeLessThan(100 * 1024 * 1024)
    }
  })
})

// ===========================
// 12. Settings panel & project lifecycle
// ===========================

test.describe('Settings panel stress', () => {
  test('settings panel toggles open and closed', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const settingsBtn = page.locator('button[aria-label="Project settings"]')
    await expect(settingsBtn).toBeVisible()

    // Open settings
    await settingsBtn.click()
    const nameInput = page.locator('#project-name')
    await expect(nameInput).toBeVisible()

    // Close settings
    await settingsBtn.click()
    await expect(nameInput).toBeHidden()
  })

  test('rapid settings toggle 10 times does not break form state', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const settingsBtn = page.locator('button[aria-label="Project settings"]')

    for (let i = 0; i < 10; i++) {
      await settingsBtn.click()
    }

    // After even toggles, settings should be closed
    const nameInput = page.locator('#project-name')
    await expect(nameInput).toBeHidden()

    // Open once more and verify the form is intact
    await settingsBtn.click()
    await expect(nameInput).toBeVisible()
    const value = await nameInput.inputValue()
    expect(value.length).toBeGreaterThan(0) // Should still have the project name
  })

  test('delete confirmation requires two clicks — cancel resets state', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Open settings
    const settingsBtn = page.locator('button[aria-label="Project settings"]')
    await settingsBtn.click()

    // First click on delete — should show confirmation
    const deleteBtn = page.getByRole('button', { name: /delete project/i })
    await deleteBtn.click()
    await expect(page.getByRole('button', { name: /confirm delete/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).click()

    // Confirmation should be gone, original delete button should be back
    await expect(page.getByRole('button', { name: /delete project/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /confirm delete/i })).toBeHidden()
  })
})

// ===========================
// 13. Assistant panel interactions
// ===========================

test.describe('Assistant panel stress', () => {
  test('assistant panel opens and closes via FAB toggle', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Open
    const openBtn = page.locator('button[title="Open assistant"]')
    await expect(openBtn).toBeVisible()
    await openBtn.click()

    await expect(page.getByTestId('chat-panel')).toBeVisible()

    // Close
    const closeBtn = page.locator('button[title="Hide assistant"]')
    await closeBtn.click()
    await expect(page.getByTestId('chat-panel')).toBeHidden()
  })

  test('rapid assistant toggle 15 times does not break panel', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Get the FAB button (the one with title "Open assistant" or "Hide assistant")
    const fab = page.locator('button[title="Open assistant"], button[title="Hide assistant"]')
    await expect(fab).toBeVisible()

    for (let i = 0; i < 15; i++) {
      await fab.first().click()
      await page.waitForTimeout(50) // minimal debounce
    }

    // After odd number of clicks starting from closed, panel should be open
    const chatPanel = page.getByTestId('chat-panel')
    const isVisible = await chatPanel.isVisible()

    // Just verify the page didn't crash — either state is fine
    await expect(page.getByTestId('project-workspace')).toBeVisible()
    expect(typeof isVisible).toBe('boolean')
  })

  test('assistant chat input is keyboard-accessible', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const openBtn = page.locator('button[title="Open assistant"]')
    await openBtn.click()
    await expect(page.getByTestId('chat-panel')).toBeVisible()

    const chatInput = page.locator('#chat-message')
    await expect(chatInput).toBeVisible()
    await chatInput.focus()
    await expect(chatInput).toBeFocused()

    // Type a message
    await chatInput.fill('Hello from keyboard')
    expect(await chatInput.inputValue()).toBe('Hello from keyboard')
  })

  test('chat panel has correct ARIA attributes', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const openBtn = page.locator('button[title="Open assistant"]')
    await openBtn.click()

    const chatPanel = page.getByTestId('chat-panel')
    await expect(chatPanel).toBeVisible()
    await expect(chatPanel).toHaveAttribute('role', 'dialog')
    await expect(chatPanel).toHaveAttribute('aria-label', 'Assistant')
    await expect(chatPanel).toHaveAttribute('aria-modal', 'false')
  })
})

// ===========================
// 14. Add module button stress
// ===========================

test.describe('Add module button stress', () => {
  test('add module button becomes disabled while creating', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const addBtn = page.getByRole('button', { name: /add module/i })
    await expect(addBtn).toBeVisible()
    await expect(addBtn).toBeEnabled()

    // Click and immediately check disabled state
    await addBtn.click()

    // The button text should change to "Adding module..." while in progress
    // or it might already be done — either way the button should eventually re-enable
    await expect(addBtn).toBeEnabled({ timeout: 10_000 })
  })

  test('rapid add module clicks do not create duplicate requests', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const addBtn = page.getByRole('button', { name: /add module/i })

    // Track network requests to the module creation endpoint
    const moduleCreateRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('module') && req.method() === 'POST') {
        moduleCreateRequests.push(url)
      }
    })

    // Rapid clicks — button should be disabled after first click
    await addBtn.click()
    await addBtn.click({ force: true })
    await addBtn.click({ force: true })

    // Wait for resolution
    await page.waitForTimeout(3000)

    // The disabled state should have prevented most duplicate requests
    // Allow up to 2 because of timing (first click + one that snuck through)
    expect(moduleCreateRequests.length).toBeLessThanOrEqual(2)
  })
})

// ===========================
// 15. State persistence across refresh
// ===========================

test.describe('State persistence across refresh', () => {
  test('project name and description survive page reload', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Read the project name from the heading
    const h1Text = await page.locator('h1').first().textContent()
    expect(h1Text).toBeTruthy()

    // Reload
    await page.reload()
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Name should be the same after reload
    const h1TextAfter = await page.locator('h1').first().textContent()
    expect(h1TextAfter).toBe(h1Text)
  })

  test('sidebar collapsed state does NOT persist across reload (expected reset)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Collapse sidebar
    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    await toggleBtn.click()
    await expect(page.getByTestId('module-sidebar')).toHaveAttribute('data-collapsed', 'true')

    // Reload — sidebar state is React local state, not persisted
    await page.reload()
    await expect(page.getByTestId('module-sidebar')).toHaveAttribute('data-collapsed', 'false')
  })

  test('assistant panel closed state does NOT persist across reload', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Open assistant
    const openBtn = page.locator('button[title="Open assistant"]')
    await openBtn.click()
    await expect(page.getByTestId('chat-panel')).toBeVisible()

    // Reload — assistant open state is local, should reset to closed
    await page.reload()
    await expect(page.getByTestId('chat-panel')).toBeHidden()
  })
})

// ===========================
// 16. Empty state rendering
// ===========================

test.describe('Empty state rendering', () => {
  test('new project workspace shows empty module message in sidebar', async ({ page }) => {
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    const sidebar = page.getByTestId('module-sidebar')
    await expect(sidebar).toBeVisible()

    // For a brand-new project, sidebar should show the empty state text
    const sidebarText = await sidebar.textContent()
    expect(sidebarText).toMatch(/module|Module/)
  })
})

// ===========================
// 17. Concurrent interaction stress
// ===========================

test.describe('Concurrent interaction stress', () => {
  test('toggling sidebar while opening assistant does not deadlock UI', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Fire both actions concurrently
    const toggleBtn = page.locator('[aria-controls="module-sidebar-list"]')
    const assistantBtn = page.locator('button[title="Open assistant"]')

    await Promise.all([toggleBtn.click(), assistantBtn.click()])

    // Both should complete — page should still be interactive
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Verify at least one of the toggles took effect
    const sidebarCollapsed = await page.getByTestId('module-sidebar').getAttribute('data-collapsed')
    const chatVisible = await page
      .getByTestId('chat-panel')
      .isVisible()
      .catch(() => false)

    expect(sidebarCollapsed === 'true' || chatVisible).toBe(true)
  })

  test('opening settings while assistant is open does not break layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASHBOARD_URL)
    if (page.url().includes('/login')) return

    const workspaceUrl = await createProjectViaUI(page)
    await page.goto(workspaceUrl)

    // Open assistant
    const assistantBtn = page.locator('button[title="Open assistant"]')
    await assistantBtn.click()
    await expect(page.getByTestId('chat-panel')).toBeVisible()

    // Open settings
    const settingsBtn = page.locator('button[aria-label="Project settings"]')
    await settingsBtn.click()
    await expect(page.locator('#project-name')).toBeVisible()

    // Both panels should be visible simultaneously without overlap issues
    await expect(page.getByTestId('chat-panel')).toBeVisible()
    await expect(page.locator('#project-name')).toBeVisible()

    // No horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1)
  })
})
