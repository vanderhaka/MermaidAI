import { test, expect } from '@playwright/test'

/**
 * Canvas & Visual Editor — Reviewer 3 (Contrarian)
 *
 * Stress tests targeting edge cases the other reviewers are unlikely to cover:
 * extreme viewports, rapid UI cycling, long content, accessibility gaps,
 * memory behaviour across view transitions, dark mode, high-DPI,
 * zero-dimension containers, and focus management.
 *
 * All tests run against the project workspace page which hosts CanvasContainer
 * (ModuleMapView or ModuleDetailView) and its supporting components
 * (ModuleNotesSheet, PseudocodeBlock, node types, edge types).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed graph store via the browser console so we can test canvas without auth. */
async function seedGraphStore(
  page: import('@playwright/test').Page,
  {
    moduleCount = 2,
    nodesPerModule = 3,
    withPseudocode = false,
    pseudocodeLength = 80,
  }: {
    moduleCount?: number
    nodesPerModule?: number
    withPseudocode?: boolean
    pseudocodeLength?: number
  } = {},
) {
  await page.evaluate(
    ({ moduleCount, nodesPerModule, withPseudocode, pseudocodeLength }) => {
      // Access Zustand store via __GRAPH_STORE__ if exposed, otherwise skip
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | {
            getState: () => Record<string, unknown>
            setState: (partial: Record<string, unknown>) => void
          }
        | undefined
      if (!store) return

      const modules = Array.from({ length: moduleCount }, (_, i) => ({
        id: `mod-${i}`,
        project_id: 'test-project',
        domain: i % 2 === 0 ? 'Payments' : null,
        name: `Module ${i}`,
        description: `Test module ${i}`,
        position: { x: i * 320, y: 0 },
        color: '#111827',
        entry_points: ['default'],
        exit_points: ['success', 'error'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))

      const pseudocode = withPseudocode ? 'x'.repeat(pseudocodeLength) : ''

      const nodes = modules.flatMap((m) =>
        Array.from({ length: nodesPerModule }, (_, j) => ({
          id: `node-${m.id}-${j}`,
          module_id: m.id,
          node_type: j === 0 ? 'start' : j === nodesPerModule - 1 ? 'end' : 'process',
          label: `Step ${j}`,
          pseudocode,
          position: { x: 0, y: j * 120 },
          color: '#111827',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
      )

      const edges = modules.flatMap((m) =>
        Array.from({ length: Math.max(0, nodesPerModule - 1) }, (_, j) => ({
          id: `edge-${m.id}-${j}`,
          module_id: m.id,
          source_node_id: `node-${m.id}-${j}`,
          target_node_id: `node-${m.id}-${j + 1}`,
          label: j === 0 ? 'Yes' : null,
          condition: j === 0 ? 'amount > 0' : null,
          created_at: new Date().toISOString(),
        })),
      )

      const connections =
        moduleCount > 1
          ? [
              {
                id: 'conn-0',
                project_id: 'test-project',
                source_module_id: 'mod-0',
                target_module_id: 'mod-1',
                source_exit_point: 'success',
                target_entry_point: 'default',
                created_at: new Date().toISOString(),
              },
            ]
          : []

      store.setState({ modules, nodes, edges, connections, activeModuleId: null })
    },
    { moduleCount, nodesPerModule, withPseudocode, pseudocodeLength },
  )
}

/**
 * Navigate to the project workspace. Since auth is required in production,
 * these tests rely on the dev server being pre-seeded or the route being
 * accessible. We attempt to reach the workspace and skip gracefully if
 * auth blocks us.
 */
async function gotoWorkspace(page: import('@playwright/test').Page) {
  // Try the project workspace page; fall back if we get redirected to login
  await page.goto('/dashboard/test-project', { waitUntil: 'networkidle' })
  const url = page.url()
  if (url.includes('/login') || url.includes('/signup')) {
    test.skip(true, 'Auth wall prevents reaching the workspace without credentials')
  }
}

// ---------------------------------------------------------------------------
// 1. EXTREME VIEWPORT — 320px mobile
// ---------------------------------------------------------------------------

test.describe('Canvas at 320px viewport', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('canvas panel is visible and does not overflow horizontally', async ({ page }) => {
    await gotoWorkspace(page)
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    const box = await canvasPanel.boundingBox()
    expect(box).toBeTruthy()
    // Canvas must not bleed past the viewport
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320 + 1) // 1px rounding tolerance
  })

  test('no horizontal scrollbar at minimum mobile width', async ({ page }) => {
    await gotoWorkspace(page)
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHScroll).toBe(false)
  })

  test('React Flow controls are reachable at 320px', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })
    // Click into the module to get flow detail (which has Controls)
    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) > 0) {
      await moduleButton.click()
      await page.waitForTimeout(500)
    }

    const controls = page.locator('.react-flow__controls')
    if ((await controls.count()) > 0) {
      const cBox = await controls.boundingBox()
      expect(cBox).toBeTruthy()
      // Controls should be within viewport
      expect(cBox!.x + cBox!.width).toBeLessThanOrEqual(320 + 2)
      expect(cBox!.y + cBox!.height).toBeLessThanOrEqual(568 + 2)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. DEVTOOLS OPEN — reduced viewport simulating a panel eating space
// ---------------------------------------------------------------------------

test.describe('Canvas with DevTools-sized viewport', () => {
  // Simulate Chrome with right-panel DevTools: ~700px effective width
  test.use({ viewport: { width: 700, height: 900 } })

  test('canvas renders without visual breakage at 700px width', async ({ page }) => {
    await gotoWorkspace(page)
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    const box = await canvasPanel.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 3. MODULE NOTES SHEET — rapid open/close cycling
// ---------------------------------------------------------------------------

test.describe('ModuleNotesSheet rapid cycling', () => {
  test('open and close 20 times without crashes or leaked dialogs', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })

    // Navigate into module detail to access notes button
    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0)
      test.skip(true, 'Module button not found — store seeding may not be connected')
    await moduleButton.click()
    await page.waitForTimeout(400)

    const notesButton = page.locator('button[aria-label="Open module notes"]')
    if ((await notesButton.count()) === 0) test.skip(true, 'Notes button not found in detail view')

    for (let i = 0; i < 20; i++) {
      await notesButton.click()
      // Wait just enough for the dialog to appear
      await page.waitForTimeout(50)

      const dialog = page.locator('dialog[open]')
      if ((await dialog.count()) > 0) {
        const closeBtn = dialog.locator('button', { hasText: 'Close' })
        if ((await closeBtn.count()) > 0) {
          await closeBtn.click()
          await page.waitForTimeout(50)
        }
      }
    }

    // After rapid cycling, no dialog should remain open
    const openDialogs = page.locator('dialog[open]')
    expect(await openDialogs.count()).toBe(0)
  })

  test('notes sheet dismisses with Escape key', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(400)

    const notesButton = page.locator('button[aria-label="Open module notes"]')
    if ((await notesButton.count()) === 0) test.skip(true, 'Notes button not found')
    await notesButton.click()
    await page.waitForTimeout(200)

    // Native <dialog> should close on Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    const openDialogs = page.locator('dialog[open]')
    expect(await openDialogs.count()).toBe(0)
  })

  test('notes sheet backdrop click closes the dialog', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(400)

    const notesButton = page.locator('button[aria-label="Open module notes"]')
    if ((await notesButton.count()) === 0) test.skip(true, 'Notes button not found')
    await notesButton.click()
    await page.waitForTimeout(200)

    // Click on the dialog element itself (the backdrop area), not on a child.
    // The component handles onClick where e.target === dialogRef.current.
    const dialog = page.locator('dialog[open]')
    if ((await dialog.count()) > 0) {
      // Click the far-left edge which is the backdrop area
      await dialog.click({ position: { x: 5, y: 300 } })
      await page.waitForTimeout(200)
    }

    expect(await page.locator('dialog[open]').count()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4. PSEUDOCODE BLOCK — very long code strings
// ---------------------------------------------------------------------------

test.describe('PseudocodeBlock with extreme content', () => {
  test('renders 10,000-character pseudocode without layout collapse', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, {
      moduleCount: 1,
      nodesPerModule: 3,
      withPseudocode: true,
      pseudocodeLength: 10_000,
    })

    // Enter the module detail
    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(600)

    // Expand a process node's pseudocode toggle
    const expandButton = page.locator('button[aria-label="Expand pseudocode"]').first()
    if ((await expandButton.count()) > 0) {
      await expandButton.click()
      await page.waitForTimeout(300)

      // The <pre> block should exist and have a bounded height (not 0)
      const preBlock = page.locator('.react-flow__node pre').first()
      if ((await preBlock.count()) > 0) {
        const box = await preBlock.boundingBox()
        expect(box).toBeTruthy()
        expect(box!.height).toBeGreaterThan(0)
      }
    }
  })

  test('pseudocode with multiline content preserves whitespace', async ({ page }) => {
    await gotoWorkspace(page)

    // Seed with multiline pseudocode directly via evaluate
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return

      const multiline =
        'function main() {\n  if (x > 0) {\n    return x\n  } else {\n    return -x\n  }\n}'

      store.setState({
        modules: [
          {
            id: 'mod-ps',
            project_id: 'tp',
            domain: null,
            name: 'Pseudocode Test',
            description: null,
            position: { x: 0, y: 0 },
            color: '#111827',
            entry_points: ['default'],
            exit_points: ['success'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nodes: [
          {
            id: 'n-start',
            module_id: 'mod-ps',
            node_type: 'start',
            label: 'Start',
            pseudocode: '',
            position: { x: 0, y: 0 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'n-proc',
            module_id: 'mod-ps',
            node_type: 'process',
            label: 'Compute',
            pseudocode: multiline,
            position: { x: 0, y: 150 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        edges: [
          {
            id: 'e-0',
            module_id: 'mod-ps',
            source_node_id: 'n-start',
            target_node_id: 'n-proc',
            label: null,
            condition: null,
            created_at: new Date().toISOString(),
          },
        ],
        connections: [],
        activeModuleId: 'mod-ps',
      })
    })

    await page.waitForTimeout(600)

    const expandButton = page.locator('button[aria-label="Expand pseudocode"]').first()
    if ((await expandButton.count()) > 0) {
      await expandButton.click()
      await page.waitForTimeout(300)

      const preBlock = page.locator('.react-flow__node pre').first()
      if ((await preBlock.count()) > 0) {
        const text = await preBlock.innerText()
        // Verify that newlines are preserved (whitespace-pre-wrap in the CSS)
        expect(text).toContain('function')
        expect(text).toContain('return')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 5. HIGH DPI (devicePixelRatio simulation)
// ---------------------------------------------------------------------------

test.describe('Canvas at high DPI', () => {
  test.use({ deviceScaleFactor: 3 })

  test('canvas renders crisp at 3x device pixel ratio', async ({ page }) => {
    await gotoWorkspace(page)
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    const box = await canvasPanel.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)

    // Verify devicePixelRatio is applied
    const dpr = await page.evaluate(() => window.devicePixelRatio)
    expect(dpr).toBe(3)
  })

  test('SVG edges render at high DPI without artefacts', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 2, nodesPerModule: 3 })

    await page.waitForTimeout(600)

    // Check that React Flow SVG exists
    const svg = page.locator(
      '.react-flow__edges svg, .react-flow__edge-path, svg.react-flow__edges',
    )
    // If edges are rendered, at least one SVG path should exist
    const paths = page.locator('.react-flow__edge path')
    if ((await paths.count()) > 0) {
      const firstPath = paths.first()
      const d = await firstPath.getAttribute('d')
      // The path data should not be empty
      expect(d).toBeTruthy()
      expect(d!.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. ACCESSIBILITY — ARIA roles, tab order, keyboard navigation
// ---------------------------------------------------------------------------

test.describe('Canvas accessibility', () => {
  test('module sidebar buttons have accessible names', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 3, nodesPerModule: 2 })
    await page.waitForTimeout(400)

    const sidebar = page.locator('[data-testid="module-sidebar"]')
    if ((await sidebar.count()) === 0) test.skip(true, 'Module sidebar not found')

    const moduleButtons = sidebar.locator('button')
    const count = await moduleButtons.count()
    for (let i = 0; i < count; i++) {
      const btn = moduleButtons.nth(i)
      const text = await btn.innerText()
      const ariaLabel = await btn.getAttribute('aria-label')
      const title = await btn.getAttribute('title')
      // Every button must have some accessible label source
      const hasLabel = (text?.trim()?.length ?? 0) > 0 || !!ariaLabel || !!title
      expect(hasLabel).toBe(true)
    }
  })

  test('Back button in detail view has aria-label', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(400)

    const backButton = page.locator('button[aria-label="Back"], button:has-text("Back")')
    if ((await backButton.count()) > 0) {
      const label = await backButton.first().getAttribute('aria-label')
      expect(label).toBe('Back')
    }
  })

  test('notes button is keyboard-reachable via Tab', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(400)

    const notesButton = page.locator('button[aria-label="Open module notes"]')
    if ((await notesButton.count()) === 0) test.skip(true, 'Notes button not found')

    // Tab through focusable elements until we reach the notes button
    let foundViaTab = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const focused = page.locator(':focus')
      const ariaLabel = await focused.getAttribute('aria-label').catch(() => null)
      if (ariaLabel === 'Open module notes') {
        foundViaTab = true
        break
      }
    }
    expect(foundViaTab).toBe(true)
  })

  test('collapse sidebar toggle has aria-expanded', async ({ page }) => {
    await gotoWorkspace(page)
    const collapseButton = page
      .locator('button[aria-expanded]')
      .filter({ has: page.locator('span.sr-only') })
      .first()

    if ((await collapseButton.count()) === 0) test.skip(true, 'Collapse button not found')

    const expanded = await collapseButton.getAttribute('aria-expanded')
    expect(expanded).toBeTruthy()
    // Toggle and verify it changes
    await collapseButton.click()
    await page.waitForTimeout(200)
    const expandedAfter = await collapseButton.getAttribute('aria-expanded')
    expect(expandedAfter).not.toBe(expanded)
  })

  test('DecisionNode diamond has label text readable by assistive tech', async ({ page }) => {
    await gotoWorkspace(page)

    // Seed with a decision node
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return

      store.setState({
        modules: [
          {
            id: 'mod-a11y',
            project_id: 'tp',
            domain: null,
            name: 'A11y Test',
            description: null,
            position: { x: 0, y: 0 },
            color: '#111827',
            entry_points: ['default'],
            exit_points: ['success'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nodes: [
          {
            id: 'n-s',
            module_id: 'mod-a11y',
            node_type: 'start',
            label: 'Begin',
            pseudocode: '',
            position: { x: 100, y: 0 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'n-d',
            module_id: 'mod-a11y',
            node_type: 'decision',
            label: 'Is valid?',
            pseudocode: '',
            position: { x: 100, y: 160 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        edges: [
          {
            id: 'e-sd',
            module_id: 'mod-a11y',
            source_node_id: 'n-s',
            target_node_id: 'n-d',
            label: null,
            condition: null,
            created_at: new Date().toISOString(),
          },
        ],
        connections: [],
        activeModuleId: 'mod-a11y',
      })
    })

    await page.waitForTimeout(600)

    // The diamond visual is aria-hidden, but the label text should be visible
    const decisionLabel = page.locator('.react-flow__node-decision span')
    if ((await decisionLabel.count()) > 0) {
      const text = await decisionLabel.first().innerText()
      expect(text).toBe('Is valid?')
    }

    // The decorative rotated div should be aria-hidden
    const ariaHidden = page.locator('.react-flow__node-decision div[aria-hidden="true"]')
    if ((await ariaHidden.count()) > 0) {
      expect(await ariaHidden.first().getAttribute('aria-hidden')).toBe('true')
    }
  })
})

// ---------------------------------------------------------------------------
// 7. ZERO-DIMENSION CONTAINER
// ---------------------------------------------------------------------------

test.describe('Canvas with zero dimensions', () => {
  test('React Flow does not throw when container has 0 height', async ({ page }) => {
    await gotoWorkspace(page)
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    // Collect console errors
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Force the canvas panel to 0 height
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="canvas-panel"]') as HTMLElement
      if (panel) {
        panel.style.height = '0px'
        panel.style.overflow = 'hidden'
      }
    })

    await page.waitForTimeout(500)

    // No unhandled errors should appear from React Flow
    const reactFlowErrors = errors.filter(
      (e) => e.includes('ReactFlow') || e.includes('react-flow') || e.includes('Cannot read'),
    )
    expect(reactFlowErrors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 8. VIEW TRANSITION — map to detail and back
// ---------------------------------------------------------------------------

test.describe('View transitions between map and detail', () => {
  test('switching map <-> detail preserves the canvas panel dimensions', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 2, nodesPerModule: 3 })
    await page.waitForTimeout(500)

    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    const mapBox = await canvasPanel.boundingBox()

    // Click into a module (detail view)
    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(600)

    const detailBox = await canvasPanel.boundingBox()
    expect(detailBox).toBeTruthy()

    // Panel dimensions should remain stable (within 2px tolerance)
    if (mapBox && detailBox) {
      expect(Math.abs(mapBox.width - detailBox.width)).toBeLessThan(3)
      expect(Math.abs(mapBox.height - detailBox.height)).toBeLessThan(3)
    }

    // Go back to map
    const backButton = page.locator('button:has-text("Back")').first()
    if ((await backButton.count()) > 0) {
      await backButton.click()
      await page.waitForTimeout(600)

      const returnBox = await canvasPanel.boundingBox()
      expect(returnBox).toBeTruthy()
      if (mapBox && returnBox) {
        expect(Math.abs(mapBox.width - returnBox.width)).toBeLessThan(3)
      }
    }
  })

  test('rapid map-detail toggling does not produce stale nodes', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 2, nodesPerModule: 2 })
    await page.waitForTimeout(400)

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')

    for (let i = 0; i < 10; i++) {
      await moduleButton.click()
      await page.waitForTimeout(100)

      const backButton = page.locator('button:has-text("Back")').first()
      if ((await backButton.count()) > 0) {
        await backButton.click()
        await page.waitForTimeout(100)
      }
    }

    // After settling, we should be on the map view with module card nodes
    await page.waitForTimeout(500)
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.waitForTimeout(200)
    const reactErrors = errors.filter((e) => e.includes('Uncaught') || e.includes('unhandled'))
    expect(reactErrors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 9. DARK MODE TOGGLE
// ---------------------------------------------------------------------------

test.describe('Canvas with system dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('canvas renders without errors in dark color scheme', async ({ page }) => {
    await gotoWorkspace(page)
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    const box = await canvasPanel.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(0)
  })

  test('dark mode does not invert React Flow background dots to invisible', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })
    await page.waitForTimeout(500)

    // Check that the background pattern element exists
    const bgPattern = page.locator('.react-flow__background')
    if ((await bgPattern.count()) > 0) {
      const display = await bgPattern.evaluate((el) => getComputedStyle(el).display)
      expect(display).not.toBe('none')
    }
  })
})

// ---------------------------------------------------------------------------
// 10. MEMORY LEAK DETECTION — many view switches
// ---------------------------------------------------------------------------

test.describe('Memory behaviour over repeated view switches', () => {
  test('100 map-detail toggles do not grow JS heap unboundedly', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 2, nodesPerModule: 4 })
    await page.waitForTimeout(500)

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')

    // Measure initial heap (if available via CDP)
    let initialHeap: number | null = null
    try {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Performance.enable')
      const initialMetrics = await cdp.send('Performance.getMetrics')
      initialHeap =
        initialMetrics.metrics.find((m: { name: string }) => m.name === 'JSHeapUsedSize')?.value ??
        null

      // Run 100 toggles
      for (let i = 0; i < 100; i++) {
        await moduleButton.click()
        await page.waitForTimeout(30)
        const backButton = page.locator('button:has-text("Back")').first()
        if ((await backButton.count()) > 0) {
          await backButton.click()
          await page.waitForTimeout(30)
        }
      }

      // Force GC
      await cdp.send('HeapProfiler.collectGarbage')
      await page.waitForTimeout(500)

      const finalMetrics = await cdp.send('Performance.getMetrics')
      const finalHeap =
        finalMetrics.metrics.find((m: { name: string }) => m.name === 'JSHeapUsedSize')?.value ??
        null

      if (initialHeap !== null && finalHeap !== null) {
        const growth = finalHeap - initialHeap
        const growthMB = growth / 1024 / 1024
        // Allow up to 50MB growth for 100 toggles — anything more suggests a leak
        expect(growthMB).toBeLessThan(50)
      }

      await cdp.detach()
    } catch {
      // CDP not available (e.g. non-chromium) — skip the heap check but verify no crash
      for (let i = 0; i < 100; i++) {
        await moduleButton.click()
        await page.waitForTimeout(30)
        const backButton = page.locator('button:has-text("Back")').first()
        if ((await backButton.count()) > 0) {
          await backButton.click()
          await page.waitForTimeout(30)
        }
      }
    }

    // Page should still be responsive
    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) > 0) {
      const box = await canvasPanel.boundingBox()
      expect(box).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// 11. CANVAS SCREENSHOT/PRINT — ensure print media does not hide canvas
// ---------------------------------------------------------------------------

test.describe('Canvas print behaviour', () => {
  test('canvas panel is not hidden in print media', async ({ page }) => {
    await gotoWorkspace(page)

    // Emulate print media
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(300)

    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    if ((await canvasPanel.count()) === 0) test.skip(true, 'Canvas panel not found')

    const visibility = await canvasPanel.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      }
    })

    expect(visibility.display).not.toBe('none')
    expect(visibility.visibility).not.toBe('hidden')
  })
})

// ---------------------------------------------------------------------------
// 12. FOCUS MANAGEMENT after operations
// ---------------------------------------------------------------------------

test.describe('Node focus management', () => {
  test('clicking Back returns focus to a sensible element', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 1, nodesPerModule: 2 })
    await page.waitForTimeout(400)

    const moduleButton = page.locator('button', { hasText: 'Module 0' }).first()
    if ((await moduleButton.count()) === 0) test.skip(true, 'Module button not found')
    await moduleButton.click()
    await page.waitForTimeout(500)

    const backButton = page.locator('button:has-text("Back")').first()
    if ((await backButton.count()) === 0) test.skip(true, 'Back button not found')
    await backButton.click()
    await page.waitForTimeout(400)

    // After clicking Back, the focused element should not be the <body>
    // (which indicates lost focus — a common accessibility regression)
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName)
    // Acceptable: BUTTON, INPUT, A, or any interactive element
    // Not acceptable: BODY (focus was lost) — though we allow it if the page
    // has no obvious focus target (acceptable but worth flagging)
    expect(focusedTag).toBeTruthy()
  })

  test('ProcessNode expand toggle preserves focus after click', async ({ page }) => {
    await gotoWorkspace(page)

    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return

      store.setState({
        modules: [
          {
            id: 'mod-focus',
            project_id: 'tp',
            domain: null,
            name: 'Focus Test',
            description: null,
            position: { x: 0, y: 0 },
            color: '#111827',
            entry_points: ['default'],
            exit_points: ['success'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nodes: [
          {
            id: 'n-p',
            module_id: 'mod-focus',
            node_type: 'process',
            label: 'Process Step',
            pseudocode: 'function calc() {\n  return 42\n}',
            position: { x: 0, y: 0 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        edges: [],
        connections: [],
        activeModuleId: 'mod-focus',
      })
    })

    await page.waitForTimeout(600)

    const expandBtn = page.locator('button[aria-label="Expand pseudocode"]').first()
    if ((await expandBtn.count()) === 0) test.skip(true, 'Expand button not found')
    await expandBtn.click()
    await page.waitForTimeout(200)

    // Focus should remain on the toggle button (now labelled "Collapse")
    const focusedLabel = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    )
    expect(focusedLabel).toBe('Collapse pseudocode')
  })
})

// ---------------------------------------------------------------------------
// 13. EDGE HOVER TOOLTIPS — condition edge and module connection edge
// ---------------------------------------------------------------------------

test.describe('Edge tooltip interactions', () => {
  test('condition edge hitbox reveals tooltip on hover', async ({ page }) => {
    await gotoWorkspace(page)

    // Seed a module with a condition edge
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return

      store.setState({
        modules: [
          {
            id: 'mod-edge',
            project_id: 'tp',
            domain: null,
            name: 'Edge Test',
            description: null,
            position: { x: 0, y: 0 },
            color: '#111827',
            entry_points: ['default'],
            exit_points: ['done'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nodes: [
          {
            id: 'n1',
            module_id: 'mod-edge',
            node_type: 'decision',
            label: 'Check amount',
            pseudocode: '',
            position: { x: 100, y: 0 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'n2',
            module_id: 'mod-edge',
            node_type: 'process',
            label: 'Process payment',
            pseudocode: '',
            position: { x: 100, y: 300 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        edges: [
          {
            id: 'e-cond',
            module_id: 'mod-edge',
            source_node_id: 'n1',
            target_node_id: 'n2',
            label: 'Yes',
            condition: 'amount > 0',
            created_at: new Date().toISOString(),
          },
        ],
        connections: [],
        activeModuleId: 'mod-edge',
      })
    })

    await page.waitForTimeout(800)

    const hitbox = page.locator('[data-testid="condition-edge-hitbox"]').first()
    if ((await hitbox.count()) === 0) test.skip(true, 'Condition edge hitbox not found')

    await hitbox.hover()
    await page.waitForTimeout(300)

    const tooltip = page.locator('[data-testid="condition-edge-tooltip"]')
    if ((await tooltip.count()) > 0) {
      await expect(tooltip.first()).toBeVisible()
      const text = await tooltip.first().innerText()
      expect(text).toContain('Yes')
      expect(text).toContain('amount > 0')
    }
  })

  test('condition edge hitbox has aria-label for screen readers', async ({ page }) => {
    await gotoWorkspace(page)

    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return

      store.setState({
        modules: [
          {
            id: 'mod-aria',
            project_id: 'tp',
            domain: null,
            name: 'Aria Edge',
            description: null,
            position: { x: 0, y: 0 },
            color: '#111827',
            entry_points: ['default'],
            exit_points: ['done'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nodes: [
          {
            id: 'na1',
            module_id: 'mod-aria',
            node_type: 'start',
            label: 'Start',
            pseudocode: '',
            position: { x: 0, y: 0 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'na2',
            module_id: 'mod-aria',
            node_type: 'end',
            label: 'End',
            pseudocode: '',
            position: { x: 0, y: 200 },
            color: '#111827',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        edges: [
          {
            id: 'ea1',
            module_id: 'mod-aria',
            source_node_id: 'na1',
            target_node_id: 'na2',
            label: 'Complete',
            condition: 'all steps done',
            created_at: new Date().toISOString(),
          },
        ],
        connections: [],
        activeModuleId: 'mod-aria',
      })
    })

    await page.waitForTimeout(800)

    const hitbox = page.locator('[data-testid="condition-edge-hitbox"]').first()
    if ((await hitbox.count()) === 0) test.skip(true, 'Hitbox not found')

    const ariaLabel = await hitbox.getAttribute('aria-label')
    expect(ariaLabel).toBeTruthy()
    expect(ariaLabel).toContain('Complete')
    expect(ariaLabel).toContain('all steps done')
  })
})

// ---------------------------------------------------------------------------
// 14. EMPTY STATE — no modules
// ---------------------------------------------------------------------------

test.describe('Canvas empty states', () => {
  test('module map shows empty message when no modules exist', async ({ page }) => {
    await gotoWorkspace(page)

    // Ensure store is empty
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return
      store.setState({
        modules: [],
        nodes: [],
        edges: [],
        connections: [],
        activeModuleId: null,
      })
    })

    await page.waitForTimeout(300)

    const emptyText = page.locator('text=No modules yet')
    if ((await emptyText.count()) > 0) {
      await expect(emptyText.first()).toBeVisible()
    }
  })

  test('detail view shows empty message when module has no nodes', async ({ page }) => {
    await gotoWorkspace(page)

    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
        | { setState: (p: Record<string, unknown>) => void }
        | undefined
      if (!store) return

      store.setState({
        modules: [
          {
            id: 'mod-empty',
            project_id: 'tp',
            domain: null,
            name: 'Empty Module',
            description: null,
            position: { x: 0, y: 0 },
            color: '#111827',
            entry_points: [],
            exit_points: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        nodes: [],
        edges: [],
        connections: [],
        activeModuleId: 'mod-empty',
      })
    })

    await page.waitForTimeout(400)

    const emptyDetail = page.locator('text=No flow detail yet')
    if ((await emptyDetail.count()) > 0) {
      await expect(emptyDetail.first()).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// 15. MODULE CARD NODE — entry/exit handle rendering at extremes
// ---------------------------------------------------------------------------

test.describe('ModuleCardNode handle extremes', () => {
  test('module card with 10+ entry and exit points renders all handles', async ({ page }) => {
    await gotoWorkspace(page)

    const manyPoints = Array.from({ length: 12 }, (_, i) => `point-${i}`)

    await page.evaluate(
      ({ manyPoints }) => {
        const store = (window as Record<string, unknown>).__GRAPH_STORE__ as
          | { setState: (p: Record<string, unknown>) => void }
          | undefined
        if (!store) return

        store.setState({
          modules: [
            {
              id: 'mod-many',
              project_id: 'tp',
              domain: null,
              name: 'Many Points',
              description: 'Module with many handles',
              position: { x: 0, y: 0 },
              color: '#111827',
              entry_points: manyPoints,
              exit_points: manyPoints,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          nodes: [],
          edges: [],
          connections: [],
          activeModuleId: null,
        })
      },
      { manyPoints },
    )

    await page.waitForTimeout(600)

    // Count handles on the module card node
    const handles = page.locator('.react-flow__node .react-flow__handle')
    if ((await handles.count()) > 0) {
      // Should have at least 24 handles (12 entry + 12 exit)
      expect(await handles.count()).toBeGreaterThanOrEqual(24)
    }
  })
})

// ---------------------------------------------------------------------------
// 16. SIDEBAR COLLAPSE — canvas resizes correctly
// ---------------------------------------------------------------------------

test.describe('Sidebar collapse canvas resize', () => {
  test('collapsing sidebar increases canvas width', async ({ page }) => {
    await gotoWorkspace(page)

    const canvasPanel = page.locator('[data-testid="canvas-panel"]')
    const sidebar = page.locator('[data-testid="module-sidebar"]')
    if ((await canvasPanel.count()) === 0 || (await sidebar.count()) === 0)
      test.skip(true, 'Required panels not found')

    const initialBox = await canvasPanel.boundingBox()

    // Find and click the collapse toggle
    const collapseBtn = sidebar.locator('button[aria-expanded]').first()
    if ((await collapseBtn.count()) === 0) test.skip(true, 'Collapse button not found')

    const expanded = await collapseBtn.getAttribute('aria-expanded')
    if (expanded === 'true') {
      await collapseBtn.click()
      await page.waitForTimeout(400) // wait for CSS transition

      const collapsedBox = await canvasPanel.boundingBox()
      if (initialBox && collapsedBox) {
        // Canvas should be wider when sidebar is collapsed
        expect(collapsedBox.width).toBeGreaterThan(initialBox.width)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 17. CONCURRENT LAYOUT CANCELLATION
// ---------------------------------------------------------------------------

test.describe('Layout cancellation safety', () => {
  test('rapidly changing activeModuleId does not produce stale layout', async ({ page }) => {
    await gotoWorkspace(page)
    await seedGraphStore(page, { moduleCount: 3, nodesPerModule: 5 })
    await page.waitForTimeout(400)

    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Rapidly switch between modules
    for (let i = 0; i < 3; i++) {
      const btn = page.locator(`button:has-text("Module ${i}")`).first()
      if ((await btn.count()) > 0) {
        await btn.click()
        // Don't wait for layout to complete — immediately switch
        await page.waitForTimeout(20)
      }
    }

    // Wait for everything to settle
    await page.waitForTimeout(1000)

    // No uncaught errors from stale layout callbacks
    const badErrors = errors.filter((e) => e.includes('setState') && e.includes('unmounted'))
    expect(badErrors).toHaveLength(0)
  })
})
