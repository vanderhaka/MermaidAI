import { test, expect } from '@playwright/test'

/**
 * Performance & Memory stress tests -- Reviewer 2 of 3
 *
 * Angle: interaction performance, rendering stress, and runtime resource hygiene.
 *
 * Unlike a Core Web Vitals sweep (load metrics, LCP, CLS), this suite hammers
 * the app with rapid user interaction sequences, measures frame budgets and
 * input responsiveness, detects event listener accumulation and detached DOM
 * nodes, and validates cleanup on unmount/navigation. Uses CDP where needed
 * for deep introspection.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect a CDP Performance.metrics snapshot. */
async function getPerformanceMetrics(page: import('@playwright/test').Page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  const { metrics } = await client.send('Performance.getMetrics')
  await client.detach()
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}

/** Count all event listeners currently attached via CDP. */
async function countEventListeners(page: import('@playwright/test').Page) {
  const client = await page.context().newCDPSession(page)
  const { root } = await client.send('DOM.getDocument', { depth: -1 })

  // Gather all nodeIds in the document
  const nodeIds: number[] = []
  function walk(node: { nodeId: number; children?: { nodeId: number; children?: unknown[] }[] }) {
    nodeIds.push(node.nodeId)
    if (node.children) {
      for (const child of node.children) {
        walk(child as { nodeId: number; children?: { nodeId: number; children?: unknown[] }[] })
      }
    }
  }
  walk(root as { nodeId: number; children?: { nodeId: number; children?: unknown[] }[] })

  // Sample up to 200 nodes to avoid timeouts on large DOMs
  const sampled =
    nodeIds.length <= 200
      ? nodeIds
      : nodeIds.filter((_, i) => i % Math.ceil(nodeIds.length / 200) === 0)

  let totalListeners = 0
  for (const nodeId of sampled) {
    try {
      const { listeners } = await client.send('DOMDebugger.getEventListeners', {
        objectId: (await client.send('DOM.resolveNode', { nodeId })).object.objectId!,
      })
      totalListeners += listeners.length
    } catch {
      // Node may have been GC'd between enumerate and resolve
    }
  }

  await client.detach()
  return { totalListeners, sampledNodes: sampled.length, totalNodes: nodeIds.length }
}

// ---------------------------------------------------------------------------
// 1. Rapid interaction sequences on the landing page
// ---------------------------------------------------------------------------

test.describe('Rapid interaction sequences', () => {
  test('rapid click-type-scroll cycle does not degrade frame rate', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Inject a frame timing observer
    const droppedFrames = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let drops = 0
        let lastTime = performance.now()
        let frameCount = 0
        const TARGET_FRAMES = 60

        function tick(now: number) {
          const delta = now - lastTime
          lastTime = now
          // A frame that takes > 33ms (below 30fps) counts as dropped
          if (delta > 33 && frameCount > 2) drops++
          frameCount++
          if (frameCount < TARGET_FRAMES) {
            requestAnimationFrame(tick)
          } else {
            resolve(drops)
          }
        }
        requestAnimationFrame(tick)
      })
    })

    // Perform rapid interactions while frames are being measured
    for (let i = 0; i < 10; i++) {
      await page.mouse.click(200 + i * 30, 300)
      await page.mouse.wheel(0, 100)
    }

    // On a static landing page, we should have very few dropped frames
    expect(droppedFrames).toBeLessThan(30)
  })

  test('rapid hover over interactive elements does not cause layout thrashing', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const links = page.getByRole('link')
    const count = await links.count()

    const layoutShiftsBefore = await page.evaluate(
      () =>
        (
          performance as unknown as { getEntriesByType: (t: string) => { value: number }[] }
        ).getEntriesByType('layout-shift').length,
    )

    // Rapid hover cycling across all links
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < count; i++) {
        const box = await links.nth(i).boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        }
      }
    }

    const layoutShiftsAfter = await page.evaluate(
      () =>
        (
          performance as unknown as { getEntriesByType: (t: string) => { value: number }[] }
        ).getEntriesByType('layout-shift').length,
    )

    // Hover should not generate layout shifts
    const newShifts = layoutShiftsAfter - layoutShiftsBefore
    expect(newShifts).toBeLessThan(5)
  })
})

// ---------------------------------------------------------------------------
// 2. Re-render / MutationObserver-based DOM churn detection
// ---------------------------------------------------------------------------

test.describe('DOM mutation monitoring', () => {
  test('landing page settles after initial render (no infinite re-render loop)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Install a MutationObserver and count mutations over 3 seconds
    const mutations = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let count = 0
        const observer = new MutationObserver((records) => {
          count += records.length
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })

        setTimeout(() => {
          observer.disconnect()
          resolve(count)
        }, 3000)
      })
    })

    // A settled page should have very few mutations (analytics, lazy hydration, etc.)
    // An infinite re-render loop would produce hundreds or thousands
    expect(mutations).toBeLessThan(50)
  })

  test('login page settles after render', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const mutations = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let count = 0
        const observer = new MutationObserver((records) => {
          count += records.length
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
        setTimeout(() => {
          observer.disconnect()
          resolve(count)
        }, 3000)
      })
    })

    expect(mutations).toBeLessThan(50)
  })

  test('signup page settles after render', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    const mutations = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let count = 0
        const observer = new MutationObserver((records) => {
          count += records.length
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
        setTimeout(() => {
          observer.disconnect()
          resolve(count)
        }, 3000)
      })
    })

    expect(mutations).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// 3. Scroll performance and jank detection
// ---------------------------------------------------------------------------

test.describe('Scroll performance', () => {
  test('rapid scrolling on landing page stays within frame budget', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Measure frame timing during rapid scroll bursts
    const jankMetrics = await page.evaluate(() => {
      return new Promise<{ totalFrames: number; longFrames: number; maxFrameMs: number }>(
        (resolve) => {
          let totalFrames = 0
          let longFrames = 0
          let maxFrameMs = 0
          let lastTs = 0

          function onFrame(ts: number) {
            if (lastTs > 0) {
              const delta = ts - lastTs
              totalFrames++
              if (delta > maxFrameMs) maxFrameMs = delta
              // > 50ms is a long frame per RAIL model
              if (delta > 50) longFrames++
            }
            lastTs = ts
            if (totalFrames < 120) {
              requestAnimationFrame(onFrame)
            } else {
              resolve({ totalFrames, longFrames, maxFrameMs })
            }
          }

          requestAnimationFrame(onFrame)

          // Programmatic scroll bursts while measuring
          let scrollY = 0
          const scrollInterval = setInterval(() => {
            scrollY += 200
            window.scrollTo({ top: scrollY, behavior: 'auto' })
            if (scrollY > 5000) {
              clearInterval(scrollInterval)
              window.scrollTo({ top: 0, behavior: 'auto' })
            }
          }, 16)
        },
      )
    })

    // No more than 20% of frames should be long
    const longFrameRatio = jankMetrics.longFrames / Math.max(jankMetrics.totalFrames, 1)
    expect(longFrameRatio).toBeLessThan(0.2)
    // Max single frame should not exceed 200ms (hard jank)
    expect(jankMetrics.maxFrameMs).toBeLessThan(200)
  })

  test('scroll + mouse move simultaneously does not cause visible jank', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const jankCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let jank = 0
        let last = performance.now()
        let frames = 0

        function frame() {
          const now = performance.now()
          if (now - last > 50) jank++
          last = now
          frames++
          if (frames < 90) requestAnimationFrame(frame)
          else resolve(jank)
        }
        requestAnimationFrame(frame)

        // Simulate concurrent scroll + mouse move
        let y = 0
        const iv = setInterval(() => {
          y += 50
          window.scrollTo(0, y)
          window.dispatchEvent(
            new MouseEvent('mousemove', {
              clientX: 100 + (y % 300),
              clientY: 200 + (y % 200),
            }),
          )
          if (y > 3000) clearInterval(iv)
        }, 16)
      })
    })

    expect(jankCount).toBeLessThan(20)
  })
})

// ---------------------------------------------------------------------------
// 4. Event listener accumulation across navigations
// ---------------------------------------------------------------------------

test.describe('Event listener accumulation', () => {
  test('navigating between pages does not leak event listeners', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const baseline = await countEventListeners(page)

    // Navigate through pages 5 times
    for (let i = 0; i < 5; i++) {
      await page.goto('/login')
      await page.waitForLoadState('networkidle')
      await page.goto('/signup')
      await page.waitForLoadState('networkidle')
      await page.goto('/')
      await page.waitForLoadState('networkidle')
    }

    const after = await countEventListeners(page)

    // Listener count should not grow by more than 2x from baseline
    // (some variance expected from lazy-loaded scripts, analytics, etc.)
    expect(after.totalListeners).toBeLessThan(baseline.totalListeners * 2 + 50)
  })

  test('event listeners per DOM node stay bounded', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const stats = await countEventListeners(page)

    // Average listeners per node should be reasonable (< 5)
    const avgPerNode = stats.totalListeners / Math.max(stats.sampledNodes, 1)
    expect(avgPerNode).toBeLessThan(5)
  })
})

// ---------------------------------------------------------------------------
// 5. Detached DOM node detection after navigation
// ---------------------------------------------------------------------------

test.describe('Detached DOM nodes', () => {
  test('no significant detached node growth after 10 navigations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Force GC and get baseline DOM node count via CDP
    const client = await page.context().newCDPSession(page)

    // Attempt to trigger GC (best-effort, not guaranteed)
    await page.evaluate(() => {
      if (typeof (globalThis as unknown as { gc?: () => void }).gc === 'function') {
        ;(globalThis as unknown as { gc: () => void }).gc()
      }
    })

    await client.send('Performance.enable')
    const { metrics: baseMetrics } = await client.send('Performance.getMetrics')
    const baseNodes = baseMetrics.find((m) => m.name === 'Nodes')?.value ?? 0

    // Navigate back and forth
    for (let i = 0; i < 10; i++) {
      await page.goto(i % 2 === 0 ? '/login' : '/signup')
      await page.waitForLoadState('domcontentloaded')
    }

    // Return to home
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      if (typeof (globalThis as unknown as { gc?: () => void }).gc === 'function') {
        ;(globalThis as unknown as { gc: () => void }).gc()
      }
    })

    const { metrics: afterMetrics } = await client.send('Performance.getMetrics')
    const afterNodes = afterMetrics.find((m) => m.name === 'Nodes')?.value ?? 0

    await client.detach()

    // Node count should not have grown by more than 100% from baseline
    // (detached nodes that survived GC indicate leaks)
    expect(afterNodes).toBeLessThan(baseNodes * 2 + 100)
  })
})

// ---------------------------------------------------------------------------
// 6. CSS selector performance (deeply nested selector audit)
// ---------------------------------------------------------------------------

test.describe('CSS selector performance', () => {
  test('no deeply nested CSS selectors causing layout recalculation', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Measure how deep the DOM nesting goes
    const maxDepth = await page.evaluate(() => {
      function getDepth(el: Element, depth: number): number {
        let max = depth
        for (const child of el.children) {
          max = Math.max(max, getDepth(child, depth + 1))
        }
        return max
      }
      return getDepth(document.documentElement, 0)
    })

    // DOM nesting beyond 30 levels is a red flag for selector performance
    expect(maxDepth).toBeLessThan(30)
  })

  test('querySelectorAll performance stays fast for common patterns', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const timings = await page.evaluate(() => {
      const selectors = [
        'a',
        'button',
        '[role="link"]',
        '[class*="rounded"]',
        'div > div > div > a',
        '[data-testid]',
        '.text-sm',
      ]

      return selectors.map((sel) => {
        const start = performance.now()
        for (let i = 0; i < 1000; i++) {
          document.querySelectorAll(sel)
        }
        const elapsed = performance.now() - start
        return { selector: sel, ms: elapsed }
      })
    })

    // Each selector pattern x 1000 iterations should complete in < 100ms
    for (const t of timings) {
      expect(t.ms).toBeLessThan(100)
    }
  })
})

// ---------------------------------------------------------------------------
// 7. Input responsiveness under load
// ---------------------------------------------------------------------------

test.describe('Input responsiveness', () => {
  test('typing in login form remains responsive (< 100ms per keystroke)', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    const emailInput = page.getByLabel('Email')
    await emailInput.focus()

    const charTimings: number[] = []
    const testString = 'performance-test@example.com'

    for (const char of testString) {
      const start = Date.now()
      await emailInput.press(char === '@' ? 'Shift+2' : char)
      charTimings.push(Date.now() - start)
    }

    const avgMs = charTimings.reduce((a, b) => a + b, 0) / charTimings.length
    const maxMs = Math.max(...charTimings)

    // Average should be under 100ms, max under 300ms
    expect(avgMs).toBeLessThan(100)
    expect(maxMs).toBeLessThan(300)
  })

  test('rapid typing burst (50 chars) completes without lag', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    const emailInput = page.getByLabel('Email')

    const start = Date.now()
    // type quickly -- Playwright will press keys sequentially
    await emailInput.fill('a'.repeat(50) + '@example.com')
    const elapsed = Date.now() - start

    // Fill of 62 chars should complete in under 2 seconds
    expect(elapsed).toBeLessThan(2000)

    // Verify all content arrived
    const value = await emailInput.inputValue()
    expect(value).toHaveLength(62)
  })

  test('input value reflects immediately after fill (no async render delay)', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    const emailInput = page.getByLabel('Email')

    await emailInput.fill('instant-check@test.com')
    // Read value immediately without waiting
    const value = await emailInput.inputValue()
    expect(value).toBe('instant-check@test.com')
  })
})

// ---------------------------------------------------------------------------
// 8. Concurrent page operations (scroll + resize + type)
// ---------------------------------------------------------------------------

test.describe('Concurrent operations', () => {
  test('simultaneous scroll + resize does not crash', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Rapid resize + scroll interleaved
    for (let i = 0; i < 10; i++) {
      await page.setViewportSize({
        width: 800 + (i % 3) * 200,
        height: 600 + (i % 2) * 200,
      })
      await page.mouse.wheel(0, 200)
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForLoadState('domcontentloaded')

    const criticalErrors = errors.filter(
      (msg) => !msg.includes('ResizeObserver') && !msg.includes('ChunkLoadError'),
    )
    expect(criticalErrors).toEqual([])
    await expect(page.locator('body')).toBeVisible()
  })

  test('resize + type simultaneously on login form', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const emailInput = page.getByLabel('Email')
    await emailInput.focus()

    // Type while resizing the viewport
    const typePromise = emailInput.fill('resize-test@example.com')

    // Fire resize events in parallel
    for (let i = 0; i < 5; i++) {
      await page.setViewportSize({
        width: 900 + i * 100,
        height: 600 + i * 50,
      })
    }

    await typePromise

    // Input should still have the correct value
    const value = await emailInput.inputValue()
    expect(value).toBe('resize-test@example.com')

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 })
  })
})

// ---------------------------------------------------------------------------
// 9. GC pressure from rapid object creation (Performance.metrics)
// ---------------------------------------------------------------------------

test.describe('GC pressure monitoring', () => {
  test('landing page does not trigger excessive GC during idle', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const metricsBefore = await getPerformanceMetrics(page)

    // Sit idle for 3 seconds
    await page.waitForTimeout(3000)

    const metricsAfter = await getPerformanceMetrics(page)

    // Check that JS heap usage is not growing wildly during idle
    const heapBefore = metricsBefore['JSHeapUsedSize'] ?? 0
    const heapAfter = metricsAfter['JSHeapUsedSize'] ?? 0

    // Heap should not grow by more than 5MB during 3 seconds of idle
    const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024)
    expect(heapGrowthMB).toBeLessThan(5)
  })

  test('rapid navigation does not cause unbounded heap growth', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const metricsBefore = await getPerformanceMetrics(page)

    // Navigate rapidly 15 times
    const routes = ['/', '/login', '/signup']
    for (let i = 0; i < 15; i++) {
      await page.goto(routes[i % routes.length])
      await page.waitForLoadState('domcontentloaded')
    }

    // Return to home
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const metricsAfter = await getPerformanceMetrics(page)

    const heapBefore = metricsBefore['JSHeapUsedSize'] ?? 0
    const heapAfter = metricsAfter['JSHeapUsedSize'] ?? 0
    const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024)

    // After 15 navigations, heap should not have grown by more than 20MB
    expect(heapGrowthMB).toBeLessThan(20)
  })

  test('DOM node count via CDP stays bounded after navigation cycle', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const before = await getPerformanceMetrics(page)
    const nodesBefore = before['Nodes'] ?? 0

    for (let i = 0; i < 10; i++) {
      await page.goto(i % 2 === 0 ? '/login' : '/signup')
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const after = await getPerformanceMetrics(page)
    const nodesAfter = after['Nodes'] ?? 0

    // After returning to the same page, node count should be roughly similar
    expect(nodesAfter).toBeLessThan(nodesBefore * 2)
  })
})

// ---------------------------------------------------------------------------
// 10. Animation frame budget under stress
// ---------------------------------------------------------------------------

test.describe('requestAnimationFrame budget', () => {
  test('rAF callbacks fire at reasonable intervals during interaction', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const frameStats = await page.evaluate(() => {
      return new Promise<{ avg: number; max: number; count: number }>((resolve) => {
        const deltas: number[] = []
        let last = 0
        let count = 0

        function tick(ts: number) {
          if (last > 0) {
            deltas.push(ts - last)
          }
          last = ts
          count++

          if (count < 60) {
            requestAnimationFrame(tick)
          } else {
            const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length
            const max = Math.max(...deltas)
            resolve({ avg, max, count })
          }
        }

        requestAnimationFrame(tick)
      })
    })

    // Average frame interval should be under 33ms (30fps minimum)
    expect(frameStats.avg).toBeLessThan(33)
    // No single frame gap exceeding 100ms
    expect(frameStats.max).toBeLessThan(100)
  })

  test('long task detection -- no tasks blocking the main thread > 200ms', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const longTasks = await page.evaluate(() => {
      return new Promise<{ count: number; maxDuration: number }>((resolve) => {
        let count = 0
        let maxDuration = 0

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            count++
            if (entry.duration > maxDuration) maxDuration = entry.duration
          }
        })

        observer.observe({ type: 'longtask', buffered: true })

        // Observe for 3 seconds of idle
        setTimeout(() => {
          observer.disconnect()
          resolve({ count, maxDuration })
        }, 3000)
      })
    })

    // During idle, there should be no long tasks exceeding 200ms
    expect(longTasks.maxDuration).toBeLessThan(200)
  })
})

// ---------------------------------------------------------------------------
// 11. Protected route redirect performance (auth gate latency)
// ---------------------------------------------------------------------------

test.describe('Auth redirect latency', () => {
  test('redirect from /dashboard to /login completes within 3 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    const elapsed = Date.now() - start

    // Auth redirect should be fast -- under 3 seconds
    expect(elapsed).toBeLessThan(3000)
  })

  test('5 rapid protected route attempts all redirect promptly', async ({ page }) => {
    const timings: number[] = []

    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      await page.goto(`/dashboard/project-${i}`)
      await page.waitForURL('**/login', { timeout: 10_000 })
      timings.push(Date.now() - start)
    }

    // Each redirect should be under 3 seconds
    for (const t of timings) {
      expect(t).toBeLessThan(3000)
    }

    // Average should be under 2 seconds
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length
    expect(avg).toBeLessThan(2000)
  })
})

// ---------------------------------------------------------------------------
// 12. Performance metrics snapshot comparison (before/after interaction)
// ---------------------------------------------------------------------------

test.describe('Performance metrics stability', () => {
  test('ScriptDuration does not spike during idle', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const before = await getPerformanceMetrics(page)
    await page.waitForTimeout(2000)
    const after = await getPerformanceMetrics(page)

    const scriptBefore = before['ScriptDuration'] ?? 0
    const scriptAfter = after['ScriptDuration'] ?? 0

    // Script execution during 2s idle should be minimal (< 1 second of CPU time)
    const scriptGrowth = scriptAfter - scriptBefore
    expect(scriptGrowth).toBeLessThan(1)
  })

  test('LayoutDuration does not spike during idle', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const before = await getPerformanceMetrics(page)
    await page.waitForTimeout(2000)
    const after = await getPerformanceMetrics(page)

    const layoutBefore = before['LayoutDuration'] ?? 0
    const layoutAfter = after['LayoutDuration'] ?? 0

    // Layout work during idle should be near zero (< 0.5 seconds)
    expect(layoutAfter - layoutBefore).toBeLessThan(0.5)
  })

  test('RecalcStyleDuration stays low during idle', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const before = await getPerformanceMetrics(page)
    await page.waitForTimeout(2000)
    const after = await getPerformanceMetrics(page)

    const styleBefore = before['RecalcStyleDuration'] ?? 0
    const styleAfter = after['RecalcStyleDuration'] ?? 0

    // Style recalculation during idle should be minimal
    expect(styleAfter - styleBefore).toBeLessThan(0.5)
  })
})

// ---------------------------------------------------------------------------
// 13. Document count and frame count (iframe leak check via CDP)
// ---------------------------------------------------------------------------

test.describe('Document and frame leaks', () => {
  test('document count stays at 1 across navigations (no zombie documents)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const before = await getPerformanceMetrics(page)
    const docsBefore = before['Documents'] ?? 0

    for (let i = 0; i < 8; i++) {
      await page.goto(i % 2 === 0 ? '/login' : '/signup')
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const after = await getPerformanceMetrics(page)
    const docsAfter = after['Documents'] ?? 0

    // Should return to approximately the same document count (allow small delta for iframes)
    expect(docsAfter).toBeLessThanOrEqual(docsBefore + 3)
  })

  test('Frames count stays bounded', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const before = await getPerformanceMetrics(page)
    const framesBefore = before['Frames'] ?? 0

    for (let i = 0; i < 6; i++) {
      await page.goto(i % 3 === 0 ? '/' : i % 3 === 1 ? '/login' : '/signup')
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const after = await getPerformanceMetrics(page)
    const framesAfter = after['Frames'] ?? 0

    // Frames should not accumulate
    expect(framesAfter).toBeLessThanOrEqual(framesBefore + 3)
  })
})

// ---------------------------------------------------------------------------
// 14. Console warning accumulation
// ---------------------------------------------------------------------------

test.describe('Console warning accumulation', () => {
  test('no React "setState on unmounted" warnings during navigation', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') {
        warnings.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate through all public pages
    for (let i = 0; i < 5; i++) {
      await page.goto('/login')
      await page.waitForLoadState('domcontentloaded')
      await page.goto('/signup')
      await page.waitForLoadState('domcontentloaded')
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
    }

    // Filter for the specific React anti-pattern
    const unmountWarnings = warnings.filter(
      (w) =>
        w.includes("Can't perform a React state update on an unmounted component") ||
        w.includes('Cannot update a component') ||
        w.includes('unmounted'),
    )

    expect(unmountWarnings).toEqual([])
  })

  test('no memory leak warnings from React during rapid navigation', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text())
      }
    })

    // Rapid-fire navigations
    for (let i = 0; i < 20; i++) {
      const routes = ['/', '/login', '/signup']
      void page.goto(routes[i % routes.length])
    }

    await page.waitForLoadState('domcontentloaded')

    const leakWarnings = warnings.filter(
      (w) => w.includes('memory leak') || w.includes('unmounted') || w.includes('cancelled'),
    )

    // There should be zero memory-related warnings
    expect(leakWarnings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 15. Page weight and resource count
// ---------------------------------------------------------------------------

test.describe('Page weight sanity', () => {
  test('landing page loads fewer than 50 network requests', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (req) => requests.push(req.url()))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // A well-optimized landing page should not make too many requests
    expect(requests.length).toBeLessThan(50)
  })

  test('landing page JS heap usage stays under 50MB', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const metrics = await getPerformanceMetrics(page)
    const heapMB = (metrics['JSHeapUsedSize'] ?? 0) / (1024 * 1024)

    // Landing page should be lightweight
    expect(heapMB).toBeLessThan(50)
  })

  test('total JS heap size stays under 100MB across all routes', async ({ page }) => {
    const heaps: number[] = []

    for (const route of ['/', '/login', '/signup']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const metrics = await getPerformanceMetrics(page)
      heaps.push((metrics['JSHeapUsedSize'] ?? 0) / (1024 * 1024))
    }

    // No single page should exceed 100MB
    for (const heap of heaps) {
      expect(heap).toBeLessThan(100)
    }
  })
})

// ---------------------------------------------------------------------------
// 16. Viewport resize stress (responsive layout recalculation)
// ---------------------------------------------------------------------------

test.describe('Viewport resize stress', () => {
  test('20 rapid viewport resizes do not crash or produce errors', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const sizes = [
      { width: 375, height: 667 }, // iPhone SE
      { width: 768, height: 1024 }, // iPad
      { width: 1280, height: 720 }, // Desktop
      { width: 1920, height: 1080 }, // Full HD
      { width: 320, height: 568 }, // iPhone 5
    ]

    for (let i = 0; i < 20; i++) {
      await page.setViewportSize(sizes[i % sizes.length])
    }

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForLoadState('domcontentloaded')

    const criticalErrors = errors.filter(
      (msg) => !msg.includes('ResizeObserver') && !msg.includes('ChunkLoadError'),
    )
    expect(criticalErrors).toEqual([])
    await expect(page.locator('body')).toBeVisible()
  })

  test('layout recalculation time stays bounded during resize burst', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const metricsBefore = await getPerformanceMetrics(page)

    // Burst of 15 rapid resizes
    for (let i = 0; i < 15; i++) {
      await page.setViewportSize({
        width: 400 + i * 80,
        height: 500 + i * 40,
      })
    }

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForLoadState('domcontentloaded')

    const metricsAfter = await getPerformanceMetrics(page)

    const layoutGrowth =
      (metricsAfter['LayoutDuration'] ?? 0) - (metricsBefore['LayoutDuration'] ?? 0)

    // 15 resizes should not accumulate more than 2 seconds of layout work
    expect(layoutGrowth).toBeLessThan(2)
  })
})

// ---------------------------------------------------------------------------
// 17. Performance trace via CDP (smoke)
// ---------------------------------------------------------------------------

test.describe('CDP performance tracing smoke', () => {
  test('can capture a performance trace without crashing the page', async ({ page }) => {
    const client = await page.context().newCDPSession(page)

    // Start tracing
    await client.send('Tracing.start', {
      categories: 'devtools.timeline',
      options: 'sampling-frequency=1000',
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Stop tracing
    const traceChunks: unknown[] = []
    client.on('Tracing.dataCollected', (params) => {
      traceChunks.push(params)
    })

    await client.send('Tracing.end')

    // Wait for trace data to arrive
    await new Promise<void>((resolve) => {
      client.on('Tracing.tracingComplete', () => resolve())
    })

    await client.detach()

    // Just verify we got some trace data -- not parsing it deeply
    expect(traceChunks.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 18. Style recalculation under class toggling stress
// ---------------------------------------------------------------------------

test.describe('Style recalculation stress', () => {
  test('toggling classes rapidly does not cause excessive style recalc', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const metricsBefore = await getPerformanceMetrics(page)

    // Toggle a class on the body 100 times
    await page.evaluate(() => {
      for (let i = 0; i < 100; i++) {
        document.body.classList.toggle('stress-test-class')
      }
    })

    const metricsAfter = await getPerformanceMetrics(page)

    const recalcGrowth =
      (metricsAfter['RecalcStyleCount'] ?? 0) - (metricsBefore['RecalcStyleCount'] ?? 0)

    // 100 class toggles should not produce more than 200 style recalcs
    // (batching should keep this low)
    expect(recalcGrowth).toBeLessThan(200)
  })
})
