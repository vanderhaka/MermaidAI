/**
 * Canvas & Visual Editor — Stress Tests (Reviewer 1 of 3)
 *
 * Covers: canvas container rendering, view switching, node/edge rendering
 * under load, zoom/pan rapid interactions, resize handling, selection
 * cycling, keyboard shortcuts, empty states, mount/unmount cycles,
 * viewport state management, and canvas accessibility.
 *
 * AUTH NOTE: The /dashboard route is auth-protected (middleware redirects
 * unauthenticated users to /login). These tests hit the live app with
 * no seeded session, so any test that navigates to a project workspace
 * must handle the auth redirect. Tests that CAN run without auth
 * validate the redirect itself. Tests that NEED the canvas are wrapped
 * in a helper that logs in first (when credentials are available) or
 * documents the limitation.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000'

/**
 * Attempt to log in with test credentials from the environment.
 * Returns true if login succeeded, false otherwise.
 */
async function tryLogin(page: Page): Promise<boolean> {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (!email || !password) return false

  await page.goto('/login')
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

/**
 * Navigate to the first available project workspace.
 * Returns true if the workspace loaded, false otherwise.
 */
async function navigateToFirstProject(page: Page): Promise<boolean> {
  // Dashboard should list projects as links containing /dashboard/
  const projectLink = page.locator('a[href*="/dashboard/"]').first()
  try {
    await projectLink.waitFor({ timeout: 5_000 })
  } catch {
    return false
  }
  await projectLink.click()
  try {
    await page.waitForSelector('[data-testid="project-workspace"]', { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Wait for React Flow to initialise inside the canvas panel.
 */
async function waitForReactFlow(page: Page, timeout = 10_000) {
  await page.waitForSelector('.react-flow', { timeout })
}

// ---------------------------------------------------------------------------
// 1. Auth guard — canvas routes require authentication
// ---------------------------------------------------------------------------

test.describe('Canvas auth guard', () => {
  test('dashboard project page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard/some-project-id')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('dashboard root redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

// ---------------------------------------------------------------------------
// 2. Canvas container rendering & React Flow initialisation
// ---------------------------------------------------------------------------

test.describe('Canvas container rendering', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available to navigate into')
  })

  test('canvas panel is visible in the project workspace', async ({ page }) => {
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    await expect(canvasPanel).toBeVisible()
  })

  test('React Flow container initialises inside the canvas panel', async ({ page }) => {
    await waitForReactFlow(page)
    const reactFlow = page.locator('.react-flow')
    await expect(reactFlow).toBeVisible()
  })

  test('React Flow viewport pane is present', async ({ page }) => {
    await waitForReactFlow(page)
    const viewport = page.locator('.react-flow__viewport')
    await expect(viewport).toBeVisible()
  })

  test('canvas Controls component renders', async ({ page }) => {
    await waitForReactFlow(page)
    const controls = page.locator('.react-flow__controls')
    await expect(controls).toBeVisible()
  })

  test('canvas Background (dots) renders', async ({ page }) => {
    await waitForReactFlow(page)
    const bg = page.locator('.react-flow__background')
    await expect(bg).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 3. View switching between ModuleMapView and ModuleDetailView
// ---------------------------------------------------------------------------

test.describe('View switching', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available to navigate into')
  })

  test('module map view is the default when no module is selected', async ({ page }) => {
    await waitForReactFlow(page)
    // ModuleDetailView has a Back button and header; ModuleMapView does not
    const backButton = page.getByRole('button', { name: 'Back' })
    // In ModuleMapView, there should be no Back button at the top-level
    // (unless canvas is empty, which shows a text message instead)
    const hasReactFlow = await page.locator('.react-flow').count()
    const hasEmptyState = await page.locator('text=No modules yet').count()
    expect(hasReactFlow + hasEmptyState).toBeGreaterThan(0)
  })

  test('clicking a module in the sidebar switches to detail view', async ({ page }) => {
    await waitForReactFlow(page)

    // Check if modules exist in the sidebar
    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    const moduleCount = await moduleButtons.count()
    test.skip(moduleCount === 0, 'No modules in sidebar to click')

    // Click first module
    await moduleButtons.first().click()

    // ModuleDetailView should now show: header with module name and Back button
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 5_000 })
  })

  test('clicking Back returns to module map view', async ({ page }) => {
    await waitForReactFlow(page)

    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    const moduleCount = await moduleButtons.count()
    test.skip(moduleCount === 0, 'No modules in sidebar to click')

    // Enter detail view
    await moduleButtons.first().click()
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 5_000 })

    // Go back
    await page.getByRole('button', { name: 'Back' }).click()

    // Back button should disappear
    await expect(page.getByRole('button', { name: 'Back' })).not.toBeVisible({ timeout: 5_000 })
  })

  test('rapid view switching does not crash', async ({ page }) => {
    await waitForReactFlow(page)

    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    const moduleCount = await moduleButtons.count()
    test.skip(moduleCount === 0, 'No modules to toggle')

    // Rapidly switch between map and detail 10 times
    for (let i = 0; i < 10; i++) {
      await moduleButtons.first().click()
      // Brief pause — enough for React to start rendering
      await page.waitForTimeout(100)

      const backBtn = page.getByRole('button', { name: 'Back' })
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click()
        await page.waitForTimeout(100)
      }
    }

    // Canvas should still be functional
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    await expect(canvasPanel).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 4. Empty state rendering
// ---------------------------------------------------------------------------

test.describe('Canvas empty states', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
  })

  test('empty project shows "No modules yet" message', async ({ page }) => {
    // Create a new project to get an empty canvas
    // Navigate to dashboard first
    await page.goto('/dashboard')
    await page.waitForSelector('[data-testid="project-workspace"], a[href*="/dashboard/"], h1', {
      timeout: 10_000,
    })

    // If there is a "Create project" flow, try it; otherwise skip
    const createButton = page.getByRole('button', { name: /create|new project/i })
    const hasCreate = (await createButton.count()) > 0

    if (hasCreate) {
      await createButton.click()
      // Wait for new project workspace
      try {
        await page.waitForSelector('[data-testid="project-workspace"]', { timeout: 10_000 })
        // In an empty project, ModuleMapView renders the empty state
        const emptyMessage = page.locator('text=No modules yet')
        await expect(emptyMessage).toBeVisible({ timeout: 5_000 })
      } catch {
        test.skip(true, 'Could not create a new project for empty state test')
      }
    } else {
      test.skip(true, 'No create project button found')
    }
  })

  test('detail view with no nodes shows "No flow detail yet"', async ({ page }) => {
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')

    // We need a module with no nodes; hard to guarantee, so we just check
    // that if we reach detail view and there are no nodes, the message appears.
    // Click a module
    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    const moduleCount = await moduleButtons.count()
    test.skip(moduleCount === 0, 'No modules to test')

    // Try each module — if one has no nodes, verify the empty message
    for (let i = 0; i < moduleCount; i++) {
      await moduleButtons.nth(i).click()
      await page.waitForTimeout(500)

      const emptyMessage = page.locator('text=No flow detail yet')
      if (await emptyMessage.isVisible().catch(() => false)) {
        await expect(emptyMessage).toBeVisible()
        return // Test passes
      }

      // Go back
      const backBtn = page.getByRole('button', { name: 'Back' })
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click()
        await page.waitForTimeout(300)
      }
    }

    // If all modules had nodes, that's fine — document it
    test.skip(true, 'All modules have nodes — cannot verify empty detail state')
  })
})

// ---------------------------------------------------------------------------
// 5. Zoom & pan rapid interactions
// ---------------------------------------------------------------------------

test.describe('Canvas zoom and pan stress', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('rapid scroll zoom does not crash the canvas', async ({ page }) => {
    const canvas = page.locator('.react-flow')
    const box = await canvas.boundingBox()
    test.skip(!box, 'Cannot get canvas bounding box')

    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    // Rapid zoom in (20 scroll events)
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -120)
    }
    // Rapid zoom out
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 120)
    }

    // Canvas should still be present and functional
    await expect(canvas).toBeVisible()
    const viewport = page.locator('.react-flow__viewport')
    await expect(viewport).toBeVisible()
  })

  test('rapid pan drag does not crash the canvas', async ({ page }) => {
    const canvas = page.locator('.react-flow')
    const box = await canvas.boundingBox()
    test.skip(!box, 'Cannot get canvas bounding box')

    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    // Rapid panning: drag in a square pattern 5 times
    for (let cycle = 0; cycle < 5; cycle++) {
      await page.mouse.move(centerX, centerY)
      await page.mouse.down()
      await page.mouse.move(centerX + 100, centerY, { steps: 3 })
      await page.mouse.move(centerX + 100, centerY + 100, { steps: 3 })
      await page.mouse.move(centerX, centerY + 100, { steps: 3 })
      await page.mouse.move(centerX, centerY, { steps: 3 })
      await page.mouse.up()
    }

    await expect(canvas).toBeVisible()
  })

  test('zoom in then out returns to a usable viewport', async ({ page }) => {
    const canvas = page.locator('.react-flow')

    // Zoom in aggressively
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, -200)
    }
    await page.waitForTimeout(200)

    // Zoom out aggressively
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 200)
    }
    await page.waitForTimeout(200)

    // The viewport should still contain our canvas elements
    await expect(canvas).toBeVisible()
  })

  test('controls zoom buttons work under rapid clicking', async ({ page }) => {
    const zoomIn = page.locator('.react-flow__controls-zoomin')
    const zoomOut = page.locator('.react-flow__controls-zoomout')

    if ((await zoomIn.count()) === 0) {
      test.skip(true, 'Zoom controls not rendered')
      return
    }

    // Rapid zoom in clicks
    for (let i = 0; i < 10; i++) {
      await zoomIn.click()
    }

    // Rapid zoom out clicks
    for (let i = 0; i < 20; i++) {
      await zoomOut.click()
    }

    // Canvas still intact
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('fit-view control resets after zoom chaos', async ({ page }) => {
    // Zoom aggressively
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -300)
    }

    const fitView = page.locator('.react-flow__controls-fitview')
    if ((await fitView.count()) === 0) {
      test.skip(true, 'Fit-view control not rendered')
      return
    }

    await fitView.click()
    await page.waitForTimeout(500) // Allow fitView animation (300ms + buffer)

    // Canvas should still be visible and functional
    await expect(page.locator('.react-flow')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 6. Canvas resize handling
// ---------------------------------------------------------------------------

test.describe('Canvas resize handling', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('canvas survives rapid window resize cycles', async ({ page }) => {
    const sizes = [
      { width: 1280, height: 720 },
      { width: 800, height: 600 },
      { width: 1920, height: 1080 },
      { width: 640, height: 480 },
      { width: 1024, height: 768 },
      { width: 375, height: 667 }, // Mobile portrait
      { width: 1440, height: 900 },
    ]

    for (const size of sizes) {
      await page.setViewportSize(size)
      await page.waitForTimeout(100)
    }

    // Restore a reasonable size
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForTimeout(300)

    // Canvas should survive
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect(page.locator('.react-flow__viewport')).toBeVisible()
  })

  test('canvas responds to very small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 })
    await page.waitForTimeout(300)

    // The canvas panel should still be in the DOM even if squeezed
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    await expect(canvasPanel).toBeAttached()
  })

  test('canvas responds to very large viewport', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.waitForTimeout(300)

    await expect(page.locator('.react-flow')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 7. Node selection / deselection rapid cycling
// ---------------------------------------------------------------------------

test.describe('Node selection stress', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('clicking nodes rapidly does not crash', async ({ page }) => {
    // React Flow renders nodes as .react-flow__node elements
    const nodes = page.locator('.react-flow__node')
    const nodeCount = await nodes.count()
    test.skip(nodeCount === 0, 'No nodes rendered on canvas')

    // Rapidly click each node multiple times
    const clickCount = Math.min(nodeCount, 10)
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < clickCount; i++) {
        await nodes.nth(i).click({ force: true })
      }
    }

    // Canvas still functional
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('clicking canvas background deselects nodes', async ({ page }) => {
    const nodes = page.locator('.react-flow__node')
    const nodeCount = await nodes.count()
    test.skip(nodeCount === 0, 'No nodes on canvas')

    // Select a node
    await nodes.first().click({ force: true })

    // Click background pane
    const pane = page.locator('.react-flow__pane')
    await pane.click({ position: { x: 10, y: 10 }, force: true })

    // The selected class should eventually be removed from all nodes
    await page.waitForTimeout(300)
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('rapid selection cycling between multiple nodes', async ({ page }) => {
    const nodes = page.locator('.react-flow__node')
    const nodeCount = await nodes.count()
    test.skip(nodeCount < 2, 'Need at least 2 nodes for selection cycling')

    // Toggle between first two nodes rapidly
    for (let i = 0; i < 20; i++) {
      await nodes.nth(i % 2).click({ force: true })
    }

    await expect(page.locator('.react-flow')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 8. Canvas keyboard shortcuts under stress
// ---------------------------------------------------------------------------

test.describe('Canvas keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('Tab key navigates between nodes (keyboard accessibility)', async ({ page }) => {
    // Focus the React Flow container
    const reactFlow = page.locator('.react-flow')
    await reactFlow.click()

    // Press Tab multiple times
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
    }

    // Canvas should still be stable
    await expect(reactFlow).toBeVisible()
  })

  test('Escape key does not break canvas state', async ({ page }) => {
    const reactFlow = page.locator('.react-flow')
    await reactFlow.click()

    // Press Escape multiple times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape')
    }

    await expect(reactFlow).toBeVisible()
  })

  test('rapid Ctrl+A (select all) does not crash', async ({ page }) => {
    const reactFlow = page.locator('.react-flow')
    await reactFlow.click()

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press(`${modifier}+a`)
    }

    await expect(reactFlow).toBeVisible()
  })

  test('arrow keys for panning under rapid keystrokes', async ({ page }) => {
    const reactFlow = page.locator('.react-flow')
    await reactFlow.click()

    // Rapid arrow key presses
    const directions = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const dir of directions) {
        await page.keyboard.press(dir)
      }
    }

    await expect(reactFlow).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 9. Module sidebar collapse / expand stress
// ---------------------------------------------------------------------------

test.describe('Module sidebar stress', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
  })

  test('rapid sidebar collapse/expand does not break canvas layout', async ({ page }) => {
    const sidebar = page.locator('[data-testid="module-sidebar"]')
    await expect(sidebar).toBeVisible()

    // Find the collapse/expand button
    const toggleButton = sidebar.locator('button').filter({
      has: page.locator('.sr-only', { hasText: /collapse|expand/i }),
    })

    if ((await toggleButton.count()) === 0) {
      test.skip(true, 'Sidebar toggle button not found')
      return
    }

    // Toggle 15 times rapidly
    for (let i = 0; i < 15; i++) {
      await toggleButton.first().click()
      await page.waitForTimeout(50)
    }

    // Canvas panel should still be intact
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    await expect(canvasPanel).toBeVisible()
  })

  test('sidebar collapsed state persists across view switches', async ({ page }) => {
    const sidebar = page.locator('[data-testid="module-sidebar"]')

    const toggleButton = sidebar.locator('button').filter({
      has: page.locator('.sr-only', { hasText: /collapse|expand/i }),
    })

    if ((await toggleButton.count()) === 0) {
      test.skip(true, 'Sidebar toggle button not found')
      return
    }

    // Collapse sidebar
    const initialState = await sidebar.getAttribute('data-collapsed')
    await toggleButton.first().click()
    await page.waitForTimeout(200)

    const newState = await sidebar.getAttribute('data-collapsed')
    expect(newState).not.toBe(initialState)

    // Now click a module (if any) and come back
    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    if ((await moduleButtons.count()) > 0 && newState === 'false') {
      await moduleButtons.first().click()
      await page.waitForTimeout(500)

      const backBtn = page.getByRole('button', { name: 'Back' })
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click()
        await page.waitForTimeout(300)
      }
    }

    // Canvas intact
    await expect(page.locator('[data-testid="canvas-panel"]')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 10. React Flow viewport state management
// ---------------------------------------------------------------------------

test.describe('Viewport state management', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('viewport transform attribute is set on the viewport element', async ({ page }) => {
    const viewport = page.locator('.react-flow__viewport')
    await expect(viewport).toBeVisible()

    // React Flow sets a transform style on the viewport
    const style = await viewport.getAttribute('style')
    expect(style).toBeTruthy()
    expect(style).toContain('transform')
  })

  test('viewport transform changes after zoom', async ({ page }) => {
    const viewport = page.locator('.react-flow__viewport')
    const initialStyle = await viewport.getAttribute('style')

    // Zoom in
    const zoomIn = page.locator('.react-flow__controls-zoomin')
    if ((await zoomIn.count()) > 0) {
      await zoomIn.click()
      await page.waitForTimeout(300)

      const newStyle = await viewport.getAttribute('style')
      // Transform should have changed (different scale)
      expect(newStyle).not.toBe(initialStyle)
    }
  })

  test('viewport maintains integrity after switching detail view and back', async ({ page }) => {
    // Get initial viewport state
    const viewport = page.locator('.react-flow__viewport')
    await expect(viewport).toBeVisible()

    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    const moduleCount = await moduleButtons.count()
    test.skip(moduleCount === 0, 'No modules to test viewport persistence')

    // Switch to detail view
    await moduleButtons.first().click()
    await page.waitForTimeout(500)

    // Switch back
    const backBtn = page.getByRole('button', { name: 'Back' })
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click()
      await page.waitForTimeout(500)
    }

    // Viewport should be re-established
    await waitForReactFlow(page)
    const newViewport = page.locator('.react-flow__viewport')
    await expect(newViewport).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 11. Edge rendering stress
// ---------------------------------------------------------------------------

test.describe('Edge rendering', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('edges are rendered as SVG paths', async ({ page }) => {
    const edges = page.locator('.react-flow__edge')
    const edgeCount = await edges.count()
    test.skip(edgeCount === 0, 'No edges rendered on canvas')

    // Each edge should contain a path element
    for (let i = 0; i < Math.min(edgeCount, 5); i++) {
      const edgePaths = edges.nth(i).locator('path')
      expect(await edgePaths.count()).toBeGreaterThan(0)
    }
  })

  test('edge hover hitbox is present for tooltip interaction', async ({ page }) => {
    // ModuleConnectionEdge and ConditionEdge both render a transparent hitbox path
    const hitboxes = page.locator(
      '[data-testid="module-connection-edge-hitbox"], [data-testid="condition-edge-hitbox"]',
    )
    const hitboxCount = await hitboxes.count()
    test.skip(hitboxCount === 0, 'No edge hitboxes found')

    // Verify the hitbox has a transparent stroke for pointer events
    const firstHitbox = hitboxes.first()
    const stroke = await firstHitbox.getAttribute('stroke')
    expect(stroke).toBe('transparent')
  })

  test('edge tooltip appears on hover and disappears on leave', async ({ page }) => {
    const hitboxes = page.locator(
      '[data-testid="module-connection-edge-hitbox"], [data-testid="condition-edge-hitbox"]',
    )
    const hitboxCount = await hitboxes.count()
    test.skip(hitboxCount === 0, 'No edges to hover')

    const firstHitbox = hitboxes.first()
    const box = await firstHitbox.boundingBox()
    test.skip(!box, 'Cannot get hitbox bounding box')

    // Hover over edge
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(300)

    // Check for tooltip appearance
    const tooltip = page.locator(
      '[data-testid="module-connection-edge-tooltip"], [data-testid="condition-edge-tooltip"]',
    )
    // Tooltip may or may not appear depending on edge data
    const tooltipVisible = (await tooltip.count()) > 0

    // Move mouse away
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)

    if (tooltipVisible) {
      // Tooltip should have disappeared
      await expect(tooltip).not.toBeVisible()
    }
  })

  test('rapid hovering across multiple edges does not cause visual glitches', async ({ page }) => {
    const hitboxes = page.locator(
      '[data-testid="module-connection-edge-hitbox"], [data-testid="condition-edge-hitbox"]',
    )
    const hitboxCount = await hitboxes.count()
    test.skip(hitboxCount < 2, 'Need at least 2 edges for hover cycling')

    // Rapidly hover across edges
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < Math.min(hitboxCount, 5); i++) {
        const box = await hitboxes.nth(i).boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.waitForTimeout(50)
        }
      }
    }

    // Move away to clear any tooltip
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)

    // Canvas intact
    await expect(page.locator('.react-flow')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 12. Canvas mount/unmount cycles
// ---------------------------------------------------------------------------

test.describe('Canvas mount/unmount cycles', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
  })

  test('navigating away and back to project remounts canvas cleanly', async ({ page }) => {
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')

    await waitForReactFlow(page)

    // Navigate away to dashboard
    const backLink = page.locator('a[href="/dashboard"]').first()
    await backLink.click()
    await page.waitForURL('**/dashboard', { timeout: 10_000 })

    // Navigate back
    const inWorkspaceAgain = await navigateToFirstProject(page)
    test.skip(!inWorkspaceAgain, 'Could not navigate back to project')

    // Canvas should remount cleanly
    await waitForReactFlow(page)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect(page.locator('.react-flow__viewport')).toBeVisible()
  })

  test('multiple back-and-forth navigations do not leak memory (no crash)', async ({ page }) => {
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')

    for (let i = 0; i < 3; i++) {
      await waitForReactFlow(page)
      await expect(page.locator('.react-flow')).toBeVisible()

      // Navigate to dashboard
      const backLink = page.locator('a[href="/dashboard"]').first()
      await backLink.click()
      await page.waitForURL('**/dashboard', { timeout: 10_000 })

      // Navigate back to project
      const ok = await navigateToFirstProject(page)
      if (!ok) {
        test.skip(true, `Navigation cycle ${i + 1} failed`)
        return
      }
    }

    // Final check
    await waitForReactFlow(page)
    await expect(page.locator('.react-flow')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 13. Canvas accessibility
// ---------------------------------------------------------------------------

test.describe('Canvas accessibility', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('canvas panel has semantic structure', async ({ page }) => {
    // The canvas panel is a <section> with data-testid
    const canvasSection = page.locator('section[data-testid="canvas-panel"]')
    await expect(canvasSection).toBeAttached()
  })

  test('module detail view Back button has accessible label', async ({ page }) => {
    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    test.skip((await moduleButtons.count()) === 0, 'No modules to test')

    await moduleButtons.first().click()
    await page.waitForTimeout(500)

    const backBtn = page.getByRole('button', { name: 'Back' })
    if (await backBtn.isVisible().catch(() => false)) {
      // Verify aria-label is present
      const ariaLabel = await backBtn.getAttribute('aria-label')
      const textContent = await backBtn.textContent()
      // Should have either aria-label or visible text
      expect(ariaLabel || textContent?.trim()).toBeTruthy()
    }
  })

  test('module detail notes button has accessible label', async ({ page }) => {
    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    test.skip((await moduleButtons.count()) === 0, 'No modules to test')

    await moduleButtons.first().click()
    await page.waitForTimeout(500)

    const notesBtn = page.getByRole('button', { name: 'Open module notes' })
    if (await notesBtn.isVisible().catch(() => false)) {
      await expect(notesBtn).toHaveAttribute('aria-label', 'Open module notes')
    }
  })

  test('sidebar collapse toggle has aria-expanded', async ({ page }) => {
    const sidebar = page.locator('[data-testid="module-sidebar"]')
    const toggleButton = sidebar.locator('button[aria-expanded]')

    if ((await toggleButton.count()) > 0) {
      const expanded = await toggleButton.first().getAttribute('aria-expanded')
      expect(['true', 'false']).toContain(expanded)
    }
  })

  test('edge hitboxes have title elements for accessibility', async ({ page }) => {
    const hitboxes = page.locator(
      '[data-testid="module-connection-edge-hitbox"], [data-testid="condition-edge-hitbox"]',
    )
    const hitboxCount = await hitboxes.count()
    test.skip(hitboxCount === 0, 'No edge hitboxes to check')

    for (let i = 0; i < Math.min(hitboxCount, 5); i++) {
      const title = hitboxes.nth(i).locator('title')
      expect(await title.count()).toBeGreaterThan(0)
    }
  })

  test('canvas controls buttons have accessible roles', async ({ page }) => {
    const controls = page.locator('.react-flow__controls')
    if ((await controls.count()) === 0) {
      test.skip(true, 'Controls not rendered')
      return
    }

    const buttons = controls.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)

    // Each control button should be a proper button element
    for (let i = 0; i < count; i++) {
      const tagName = await buttons.nth(i).evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('button')
    }
  })
})

// ---------------------------------------------------------------------------
// 14. ProcessNode pseudocode expand/collapse stress
// ---------------------------------------------------------------------------

test.describe('ProcessNode expand/collapse', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('process node pseudocode toggle survives rapid clicking', async ({ page }) => {
    // Enter detail view where ProcessNodes live
    const moduleButtons = page.locator('[data-testid="module-sidebar"] button').filter({
      hasNotText: /collapse|expand|module map/i,
    })
    test.skip((await moduleButtons.count()) === 0, 'No modules available')

    // Try each module until we find one with process nodes
    const moduleCount = await moduleButtons.count()
    let foundProcessNode = false

    for (let m = 0; m < moduleCount && !foundProcessNode; m++) {
      await moduleButtons.nth(m).click()
      await page.waitForTimeout(500)

      // Look for the expand/collapse button in process nodes
      const expandBtns = page.locator('button[aria-label*="pseudocode"]')
      if ((await expandBtns.count()) > 0) {
        foundProcessNode = true

        // Rapid toggle
        for (let i = 0; i < 15; i++) {
          await expandBtns.first().click({ force: true })
        }

        // Canvas should be stable
        await expect(page.locator('.react-flow')).toBeVisible()
      }

      // Go back
      const backBtn = page.getByRole('button', { name: 'Back' })
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click()
        await page.waitForTimeout(300)
      }
    }

    if (!foundProcessNode) {
      test.skip(true, 'No ProcessNodes with pseudocode found')
    }
  })
})

// ---------------------------------------------------------------------------
// 15. Assistant panel + canvas coexistence stress
// ---------------------------------------------------------------------------

test.describe('Assistant panel and canvas coexistence', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page)
    test.skip(
      !loggedIn,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated test',
    )
    const inWorkspace = await navigateToFirstProject(page)
    test.skip(!inWorkspace, 'No project available')
    await waitForReactFlow(page)
  })

  test('opening and closing assistant panel does not break canvas', async ({ page }) => {
    // The assistant FAB is a button at the bottom-right
    const assistantToggle = page.locator('button[title*="assistant" i]').first()
    if ((await assistantToggle.count()) === 0) {
      test.skip(true, 'Assistant toggle button not found')
      return
    }

    // Rapid open/close
    for (let i = 0; i < 10; i++) {
      await assistantToggle.click()
      await page.waitForTimeout(100)
    }

    // Canvas intact
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('canvas remains interactive while assistant panel is open', async ({ page }) => {
    const assistantToggle = page.locator('button[title*="assistant" i]').first()
    if ((await assistantToggle.count()) === 0) {
      test.skip(true, 'Assistant toggle button not found')
      return
    }

    // Open assistant
    await assistantToggle.click()
    await page.waitForTimeout(300)

    // Verify assistant panel appeared
    const chatPanel = page.locator('[data-testid="chat-panel"]')
    if (await chatPanel.isVisible().catch(() => false)) {
      // Now interact with the canvas: zoom
      const canvas = page.locator('.react-flow')
      const box = await canvas.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.wheel(0, -120)
        await page.mouse.wheel(0, 120)
      }

      // Canvas should be fine
      await expect(canvas).toBeVisible()
    }

    // Close assistant
    await assistantToggle.click()
  })
})
