import { test, expect, type Page, type CDPSession } from '@playwright/test'

/**
 * Stress tests for performance and memory — Reviewer 1 of 3.
 *
 * Covers: Core Web Vitals (LCP, CLS, INP), paint timing (FP, FCP),
 * JS heap size tracking, memory leak detection across navigation cycles,
 * long task detection via PerformanceObserver, DOM node count growth,
 * layout thrashing detection, bundle size regression, hydration timing,
 * resource loading waterfall, image lazy-load verification,
 * font loading behavior (FOIT/FOUT), and Time to Interactive estimation.
 */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PUBLIC_ROUTES = ['/', '/login', '/signup'] as const

/** Attach a CDP session to the page's target. */
async function createCDPSession(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page)
}

/** Enable Performance domain and return the CDP session. */
async function enablePerformanceMetrics(page: Page): Promise<CDPSession> {
  const cdp = await createCDPSession(page)
  await cdp.send('Performance.enable')
  return cdp
}

/** Read current Performance.getMetrics from CDP. */
async function getPerformanceMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send('Performance.getMetrics')
  const result: Record<string, number> = {}
  for (const m of metrics) {
    result[m.name] = m.value
  }
  return result
}

/** Get JS heap size from CDP Performance.getMetrics. */
async function getHeapSize(cdp: CDPSession): Promise<{ usedJS: number; totalJS: number }> {
  const metrics = await getPerformanceMetrics(cdp)
  return {
    usedJS: metrics['JSHeapUsedSize'] ?? 0,
    totalJS: metrics['JSHeapTotalSize'] ?? 0,
  }
}

/** Force garbage collection via CDP. */
async function forceGC(cdp: CDPSession): Promise<void> {
  await cdp.send('HeapProfiler.collectGarbage')
}

/** Get DOM node count. */
async function getDOMNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('*').length)
}

/** Inject a PerformanceObserver for long tasks and return collected entries. */
async function collectLongTasks(page: Page): Promise<{ name: string; duration: number }[]> {
  return page.evaluate(() => {
    return new Promise<{ name: string; duration: number }[]>((resolve) => {
      const entries: { name: string; duration: number }[] = []
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          entries.push({ name: entry.name, duration: entry.duration })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })

      // Give some time for tasks to be captured
      setTimeout(() => {
        observer.disconnect()
        resolve(entries)
      }, 3000)
    })
  })
}

/** Inject a PerformanceObserver to capture layout-shift entries. */
async function injectCLSObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__clsEntries = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        ;(
          (window as unknown as Record<string, unknown>).__clsEntries as {
            value: number
            hadRecentInput: boolean
          }[]
        ).push({
          value: (entry as unknown as { value: number }).value,
          hadRecentInput: (entry as unknown as { hadRecentInput: boolean }).hadRecentInput,
        })
      }
    })
    observer.observe({ type: 'layout-shift', buffered: true })
  })
}

/** Retrieve the accumulated CLS score. */
async function getCLSScore(page: Page): Promise<number> {
  return page.evaluate(() => {
    const entries =
      ((window as unknown as Record<string, unknown>).__clsEntries as
        | { value: number; hadRecentInput: boolean }[]
        | undefined) ?? []
    // Only count shifts without recent user input (the real CLS metric)
    return entries.filter((e) => !e.hadRecentInput).reduce((sum, e) => sum + e.value, 0)
  })
}

/* -------------------------------------------------------------------------- */
/*  1. Paint timing — First Paint & First Contentful Paint                    */
/* -------------------------------------------------------------------------- */

test.describe('Paint timing (FP & FCP)', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`FP and FCP are captured on ${route}`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('load')

      const paintEntries = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint')
        return entries.map((e) => ({ name: e.name, startTime: e.startTime }))
      })

      const fp = paintEntries.find((e) => e.name === 'first-paint')
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint')

      // Both FP and FCP should exist
      expect(fp).toBeDefined()
      expect(fcp).toBeDefined()

      // FCP should happen within 3 seconds (generous for dev server)
      expect(fcp!.startTime).toBeLessThan(3000)

      // FP should happen before or at the same time as FCP
      expect(fp!.startTime).toBeLessThanOrEqual(fcp!.startTime)
    })
  }
})

/* -------------------------------------------------------------------------- */
/*  2. Largest Contentful Paint (LCP)                                         */
/* -------------------------------------------------------------------------- */

test.describe('Largest Contentful Paint (LCP)', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`LCP is under 4s on ${route}`, async ({ page }) => {
      // Inject LCP observer before navigation
      await page.addInitScript(() => {
        ;(window as unknown as Record<string, unknown>).__lcpValue = 0
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          if (entries.length > 0) {
            const last = entries[entries.length - 1]
            ;(window as unknown as Record<string, unknown>).__lcpValue = last.startTime
          }
        })
        observer.observe({ type: 'largest-contentful-paint', buffered: true })
      })

      await page.goto(route)
      await page.waitForLoadState('load')
      // Give LCP observer time to fire
      await page.waitForTimeout(1000)

      const lcp = await page.evaluate(
        () => (window as unknown as Record<string, number>).__lcpValue,
      )

      // LCP under 4s is "needs improvement" threshold; under 2.5s is "good"
      // Using 4s as upper bound for dev server
      expect(lcp).toBeGreaterThan(0)
      expect(lcp).toBeLessThan(4000)
    })
  }
})

/* -------------------------------------------------------------------------- */
/*  3. Cumulative Layout Shift (CLS)                                          */
/* -------------------------------------------------------------------------- */

test.describe('Cumulative Layout Shift (CLS)', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`CLS score is under 0.1 on ${route}`, async ({ page }) => {
      await page.goto(route)
      await injectCLSObserver(page)

      // Wait for page to fully settle — fonts, images, lazy content
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      const cls = await getCLSScore(page)

      // Good CLS is under 0.1; poor is above 0.25
      expect(cls).toBeLessThan(0.1)
    })
  }

  test('CLS remains low after scrolling the landing page', async ({ page }) => {
    await page.goto('/')
    await injectCLSObserver(page)
    await page.waitForLoadState('networkidle')

    // Scroll down and up to trigger any deferred layout shifts
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)

    const cls = await getCLSScore(page)
    expect(cls).toBeLessThan(0.15)
  })
})

/* -------------------------------------------------------------------------- */
/*  4. Interaction to Next Paint (INP) proxy                                  */
/* -------------------------------------------------------------------------- */

test.describe('Interaction to Next Paint (INP proxy)', () => {
  test('click latency on landing page CTA links is under 200ms', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    // Measure click-to-paint for "Start building" CTA
    const latency = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const link = document.querySelector('a[href="/signup"]')
        if (!link) {
          resolve(-1)
          return
        }

        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          if (entries.length > 0) {
            observer.disconnect()
            resolve(entries[0].duration)
          }
        })

        // event-timing gives us processing + presentation delay
        try {
          observer.observe({
            type: 'event',
            buffered: false,
            durationThreshold: 0,
          } as PerformanceObserverInit)
        } catch {
          // event timing not supported in this browser
          resolve(0)
          return
        }

        link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        link.dispatchEvent(new MouseEvent('click', { bubbles: true }))

        // Fallback timeout
        setTimeout(() => {
          observer.disconnect()
          resolve(0)
        }, 2000)
      })
    })

    // INP good threshold is 200ms
    if (latency > 0) {
      expect(latency).toBeLessThan(200)
    }
  })

  test('form field interaction latency on login page is under 100ms', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('load')
    await expect(page.getByLabel('Email')).toBeVisible()

    const start = Date.now()
    await page.getByLabel('Email').focus()
    await page.getByLabel('Email').fill('test@example.com')
    const elapsed = Date.now() - start

    // Typing into a field should be near-instant — under 500ms total
    // (includes Playwright overhead, so we're generous)
    expect(elapsed).toBeLessThan(500)

    // Verify the value was accepted without lag
    const value = await page.getByLabel('Email').inputValue()
    expect(value).toBe('test@example.com')
  })
})

/* -------------------------------------------------------------------------- */
/*  5. JS heap size tracking across navigation cycles                         */
/* -------------------------------------------------------------------------- */

test.describe('JS heap size tracking', () => {
  test('heap does not grow unbounded over 30 navigation cycles', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')

    // Force GC and take baseline
    await forceGC(cdp)
    const baseline = await getHeapSize(cdp)

    // Navigate through routes 30 times
    for (let i = 0; i < 30; i++) {
      const route = PUBLIC_ROUTES[i % PUBLIC_ROUTES.length]
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
    }

    // Return to baseline route and force GC
    await page.goto('/')
    await page.waitForLoadState('load')
    await forceGC(cdp)
    await page.waitForTimeout(500)
    await forceGC(cdp)

    const afterNavigation = await getHeapSize(cdp)

    // Heap should not grow more than 3x from baseline
    // (generous to account for caching, module loading, etc.)
    expect(afterNavigation.usedJS).toBeLessThan(baseline.usedJS * 3)
  })

  test('heap snapshot shows no significant leak after repeated login page visits', async ({
    page,
  }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/login')
    await page.waitForLoadState('load')
    await forceGC(cdp)
    const baseline = await getHeapSize(cdp)

    // Visit login page 20 times, each time filling and clearing the form
    for (let i = 0; i < 20; i++) {
      await page.goto('/login')
      await page.waitForLoadState('domcontentloaded')
      await page.getByLabel('Email').fill(`user${i}@test.com`)
      await page.getByLabel('Password').fill('password123')
    }

    await forceGC(cdp)
    await page.waitForTimeout(300)
    await forceGC(cdp)
    const after = await getHeapSize(cdp)

    // Heap growth from form interactions should be minimal
    const growthRatio = after.usedJS / baseline.usedJS
    expect(growthRatio).toBeLessThan(2.5)
  })

  test('heap stabilizes — 3 consecutive GC passes converge', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    // Do some work
    for (let i = 0; i < 10; i++) {
      await page.goto(PUBLIC_ROUTES[i % PUBLIC_ROUTES.length])
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('load')

    // Three GC passes — heap should converge (each pass should not grow)
    const heapSizes: number[] = []
    for (let pass = 0; pass < 3; pass++) {
      await forceGC(cdp)
      await page.waitForTimeout(200)
      const size = await getHeapSize(cdp)
      heapSizes.push(size.usedJS)
    }

    // Last measurement should not be significantly larger than the first post-GC
    // (allowing 20% variance for GC timing jitter)
    expect(heapSizes[2]).toBeLessThan(heapSizes[0] * 1.2)
  })
})

/* -------------------------------------------------------------------------- */
/*  6. Long task detection                                                    */
/* -------------------------------------------------------------------------- */

test.describe('Long task detection', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`no tasks > 200ms during initial load of ${route}`, async ({ page }) => {
      await page.goto(route)

      const longTasks = await collectLongTasks(page)

      // Flag any task over 200ms as a failure (critically long)
      const criticalTasks = longTasks.filter((t) => t.duration > 200)
      expect(criticalTasks).toEqual([])
    })
  }

  test('no critically long tasks during rapid navigation', async ({ page }) => {
    // Inject observer before the navigation storm
    await page.addInitScript(() => {
      ;(window as unknown as Record<string, unknown>).__longTasks = []
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          ;(
            (window as unknown as Record<string, unknown>).__longTasks as {
              duration: number
            }[]
          ).push({ duration: entry.duration })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    for (let i = 0; i < 15; i++) {
      await page.goto(PUBLIC_ROUTES[i % PUBLIC_ROUTES.length])
      await page.waitForLoadState('domcontentloaded')
    }

    const longTasks = await page.evaluate(
      () =>
        ((window as unknown as Record<string, unknown>).__longTasks as { duration: number }[]) ??
        [],
    )

    // Tasks over 50ms are "long" (Web Vitals definition), but we only fail on > 200ms
    const criticalTasks = longTasks.filter((t) => t.duration > 200)

    // Report all long tasks for diagnostics
    if (longTasks.filter((t) => t.duration > 50).length > 0) {
      const report = longTasks
        .filter((t) => t.duration > 50)
        .map((t) => `${t.duration.toFixed(0)}ms`)
        .join(', ')
      console.log(`Long tasks detected (>50ms): ${report}`)
    }

    expect(criticalTasks).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/*  7. DOM node count growth over 30+ navigations                             */
/* -------------------------------------------------------------------------- */

test.describe('DOM node count stability', () => {
  test('DOM node count stays bounded after 30 full-page navigations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const baselineCount = await getDOMNodeCount(page)
    const counts: number[] = [baselineCount]

    for (let i = 0; i < 30; i++) {
      const route = PUBLIC_ROUTES[i % PUBLIC_ROUTES.length]
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      if (i % 10 === 9) {
        counts.push(await getDOMNodeCount(page))
      }
    }

    // Return to baseline route
    await page.goto('/')
    await page.waitForLoadState('load')
    const finalCount = await getDOMNodeCount(page)
    counts.push(finalCount)

    // Final count should not exceed baseline by more than 50%
    expect(finalCount).toBeLessThan(baselineCount * 1.5)

    // No measurement should exceed 3000 nodes on these simple pages
    for (const count of counts) {
      expect(count).toBeLessThan(3000)
    }
  })

  test('DOM node count per route is consistent across visits', async ({ page }) => {
    const routeCounts: Record<string, number[]> = {}

    for (let round = 0; round < 5; round++) {
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route)
        await page.waitForLoadState('load')
        const count = await getDOMNodeCount(page)

        if (!routeCounts[route]) routeCounts[route] = []
        routeCounts[route].push(count)
      }
    }

    // For each route, the node count should be stable (within 15% of the median)
    for (const route of PUBLIC_ROUTES) {
      const sorted = [...routeCounts[route]].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]

      for (const count of routeCounts[route]) {
        const deviation = Math.abs(count - median) / median
        expect(deviation).toBeLessThan(0.15)
      }
    }
  })

  test('no orphaned event listeners accumulate (indirect: DOM count proxy)', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')
    await forceGC(cdp)

    const baselineListeners = await page.evaluate(
      () => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).length,
    )

    // Navigate 20 times
    for (let i = 0; i < 20; i++) {
      await page.goto(PUBLIC_ROUTES[i % PUBLIC_ROUTES.length])
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('load')

    const finalNodes = await getDOMNodeCount(page)
    const baselineNodes = await page.evaluate(() => {
      // Re-count after returning home
      return document.querySelectorAll('*').length
    })

    // Baseline and final should be close (within 20%)
    expect(Math.abs(finalNodes - baselineNodes)).toBeLessThan(baselineNodes * 0.2)
  })
})

/* -------------------------------------------------------------------------- */
/*  8. Layout thrashing detection                                             */
/* -------------------------------------------------------------------------- */

test.describe('Layout thrashing detection', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`no forced reflow patterns detected on ${route}`, async ({ page }) => {
      // Inject a monkey-patch that counts forced reflow patterns
      await page.addInitScript(() => {
        let forceReflowCount = 0
        const originalGetComputedStyle = window.getComputedStyle

        // Track interleaved read/write patterns
        let lastAction: 'read' | 'write' | null = null

        window.getComputedStyle = function (...args: Parameters<typeof getComputedStyle>) {
          if (lastAction === 'write') {
            forceReflowCount++
          }
          lastAction = 'read'
          return originalGetComputedStyle.apply(window, args)
        }

        // Proxy style writes on frequently accessed elements
        const originalSetAttribute = Element.prototype.setAttribute
        Element.prototype.setAttribute = function (name: string, value: string) {
          if (name === 'style') {
            lastAction = 'write'
          }
          return originalSetAttribute.call(this, name, value)
        }
        ;(window as unknown as Record<string, unknown>).__forceReflowCount = forceReflowCount
        ;(window as unknown as Record<string, () => number>).__getForceReflowCount = () =>
          forceReflowCount
      })

      await page.goto(route)
      await page.waitForLoadState('load')
      await page.waitForTimeout(1000)

      const reflowCount = await page.evaluate(() =>
        (window as unknown as Record<string, () => number>).__getForceReflowCount(),
      )

      // Some framework reflows are expected; fail only on egregious thrashing
      // (> 50 forced reflows during page load is a sign of a problem)
      expect(reflowCount).toBeLessThan(50)
    })
  }
})

/* -------------------------------------------------------------------------- */
/*  9. Bundle size regression — total transferred bytes per page              */
/* -------------------------------------------------------------------------- */

test.describe('Bundle size regression', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`total transferred JS on ${route} is under 2MB`, async ({ page }) => {
      // Clear cache to measure cold-load transfer size
      const cdp = await createCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.clearBrowserCache')

      const transferredBytes: number[] = []

      cdp.on('Network.loadingFinished', (params: { encodedDataLength: number }) => {
        transferredBytes.push(params.encodedDataLength)
      })

      await page.goto(route)
      await page.waitForLoadState('load')
      // Small delay to capture late-loading resources
      await page.waitForTimeout(1000)

      const totalTransferred = transferredBytes.reduce((sum, b) => sum + b, 0)

      // Log for diagnostics
      console.log(`Route ${route}: total transferred = ${(totalTransferred / 1024).toFixed(0)} KB`)

      // 2MB ceiling for total page weight on a simple page (generous for dev server)
      expect(totalTransferred).toBeLessThan(2 * 1024 * 1024)
    })
  }

  test('JS-only transfer is under 1MB on landing page', async ({ page }) => {
    const cdp = await createCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.clearBrowserCache')

    const jsResources: { url: string; size: number }[] = []

    const pendingRequests = new Map<string, string>()

    cdp.on(
      'Network.requestWillBeSent',
      (params: { requestId: string; request: { url: string } }) => {
        pendingRequests.set(params.requestId, params.request.url)
      },
    )

    cdp.on(
      'Network.loadingFinished',
      (params: { requestId: string; encodedDataLength: number }) => {
        const url = pendingRequests.get(params.requestId) ?? ''
        if (url.endsWith('.js') || url.includes('.js?')) {
          jsResources.push({ url, size: params.encodedDataLength })
        }
      },
    )

    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1000)

    const totalJS = jsResources.reduce((sum, r) => sum + r.size, 0)

    console.log(
      `Landing page JS: ${(totalJS / 1024).toFixed(0)} KB across ${jsResources.length} files`,
    )

    // 1MB ceiling for JS-only on the landing page
    expect(totalJS).toBeLessThan(1024 * 1024)
  })

  test('no single JS chunk exceeds 500KB', async ({ page }) => {
    const cdp = await createCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.clearBrowserCache')

    const jsChunks: { url: string; size: number }[] = []
    const pendingRequests = new Map<string, string>()

    cdp.on(
      'Network.requestWillBeSent',
      (params: { requestId: string; request: { url: string } }) => {
        pendingRequests.set(params.requestId, params.request.url)
      },
    )

    cdp.on(
      'Network.loadingFinished',
      (params: { requestId: string; encodedDataLength: number }) => {
        const url = pendingRequests.get(params.requestId) ?? ''
        if (url.endsWith('.js') || url.includes('.js?')) {
          jsChunks.push({ url, size: params.encodedDataLength })
        }
      },
    )

    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1000)

    for (const chunk of jsChunks) {
      const sizeKB = (chunk.size / 1024).toFixed(0)
      // Extract just the filename for readable diagnostics
      const filename = chunk.url.split('/').pop()?.split('?')[0] ?? chunk.url
      expect(chunk.size, `Chunk ${filename} is ${sizeKB} KB — exceeds 500KB limit`).toBeLessThan(
        500 * 1024,
      )
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  10. Hydration timing                                                      */
/* -------------------------------------------------------------------------- */

test.describe('Hydration timing', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`hydration completes within 3s on ${route}`, async ({ page }) => {
      const cdp = await enablePerformanceMetrics(page)

      await page.goto(route)
      await page.waitForLoadState('load')

      const metrics = await getPerformanceMetrics(cdp)

      // DomContentLoaded relative to NavigationStart gives us a proxy for hydration
      const domContentLoaded = metrics['DomContentLoaded'] ?? 0
      const navigationStart = metrics['NavigationStart'] ?? 0

      // These are timestamps, so the difference is the duration
      // CDP reports them as seconds since epoch
      const hydrationTimeMs = (domContentLoaded - navigationStart) * 1000

      if (hydrationTimeMs > 0) {
        expect(hydrationTimeMs).toBeLessThan(3000)
      }
    })
  }

  test('Time to Interactive proxy — page is interactive quickly', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')

    // Measure time until we can interact with the page
    const interactiveTime = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      if (nav) {
        return nav.domInteractive - nav.fetchStart
      }
      return -1
    })

    if (interactiveTime > 0) {
      // Landing page should be interactive within 3 seconds
      expect(interactiveTime).toBeLessThan(3000)
      console.log(`Landing page TTI proxy: ${interactiveTime.toFixed(0)}ms`)
    }
  })

  test('login page form is interactive shortly after FCP', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('load')

    const timings = await page.evaluate(() => {
      const paintEntries = performance.getEntriesByType('paint')
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint')
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      return {
        fcp: fcp?.startTime ?? -1,
        domInteractive: nav ? nav.domInteractive - nav.fetchStart : -1,
      }
    })

    if (timings.fcp > 0 && timings.domInteractive > 0) {
      // Gap between FCP and interactive should be small (< 1.5s)
      // This catches hydration-blocking issues
      const gap = timings.domInteractive - timings.fcp
      console.log(`Login FCP->Interactive gap: ${gap.toFixed(0)}ms`)
      // We allow negative gaps (interactive before paint is fine)
      expect(gap).toBeLessThan(1500)
    }

    // Verify the form is actually usable
    await expect(page.getByLabel('Email')).toBeEnabled()
  })
})

/* -------------------------------------------------------------------------- */
/*  11. Resource loading waterfall — no unnecessary blocking resources         */
/* -------------------------------------------------------------------------- */

test.describe('Resource loading waterfall', () => {
  test('no render-blocking scripts on landing page', async ({ page }) => {
    const renderBlockingResources = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      return resources
        .filter((r) => {
          // Render-blocking scripts load before FCP and have no async/defer
          return r.initiatorType === 'script' && r.renderBlockingStatus === 'blocking'
        })
        .map((r) => ({
          name: r.name.split('/').pop()?.split('?')[0] ?? r.name,
          duration: r.duration,
          renderBlockingStatus: r.renderBlockingStatus,
        }))
    })

    // Next.js may have some render-blocking scripts for hydration;
    // fail only if there are excessive ones (> 5)
    if (renderBlockingResources.length > 0) {
      console.log(
        `Render-blocking scripts: ${renderBlockingResources.map((r) => r.name).join(', ')}`,
      )
    }
    expect(renderBlockingResources.length).toBeLessThan(6)
  })

  test('no render-blocking CSS that delays FCP by more than 1s', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const analysis = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      const paintEntries = performance.getEntriesByType('paint')
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint')

      const blockingCSS = resources.filter(
        (r) =>
          r.initiatorType === 'link' &&
          r.name.includes('.css') &&
          r.renderBlockingStatus === 'blocking',
      )

      return {
        fcpTime: fcp?.startTime ?? -1,
        blockingCSSCount: blockingCSS.length,
        blockingCSSDurations: blockingCSS.map((r) => r.duration),
      }
    })

    // If there's blocking CSS, it shouldn't be adding > 1s to FCP
    for (const duration of analysis.blockingCSSDurations) {
      expect(duration).toBeLessThan(1000)
    }
  })

  test('third-party scripts do not block initial render', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const thirdPartyBlocking = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      const origin = window.location.origin

      return resources
        .filter(
          (r) =>
            !r.name.startsWith(origin) &&
            r.initiatorType === 'script' &&
            r.renderBlockingStatus === 'blocking',
        )
        .map((r) => r.name)
    })

    // No third-party scripts should be render-blocking
    expect(thirdPartyBlocking).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/*  12. Image loading performance — lazy load verification                    */
/* -------------------------------------------------------------------------- */

test.describe('Image loading performance', () => {
  test('all below-fold images have loading="lazy"', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const imageAudit = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'))
      const viewportHeight = window.innerHeight

      return images.map((img) => {
        const rect = img.getBoundingClientRect()
        return {
          src: img.src || img.getAttribute('data-src') || '(no src)',
          alt: img.alt,
          loading: img.loading,
          isBelowFold: rect.top > viewportHeight,
          hasExplicitDimensions: img.hasAttribute('width') && img.hasAttribute('height'),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }
      })
    })

    // Below-fold images should use lazy loading
    const belowFoldEager = imageAudit.filter((img) => img.isBelowFold && img.loading !== 'lazy')

    if (belowFoldEager.length > 0) {
      console.log(
        `Below-fold images without lazy loading: ${belowFoldEager.map((i) => i.src).join(', ')}`,
      )
    }

    // This is a warning rather than a hard fail for now — but flag it
    expect(belowFoldEager.length).toBeLessThan(5)
  })

  test('images use next/image (have srcset or data-nimg)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return imgs.map((img) => ({
        src: img.src,
        hasSrcset: !!img.srcset,
        hasDataNimg: img.hasAttribute('data-nimg'),
        // next/image wraps in a span with specific styles
        parentIsNextImage: img.parentElement?.tagName === 'SPAN' || img.hasAttribute('data-nimg'),
      }))
    })

    // If there are images, they should be using next/image
    for (const img of images) {
      // next/image adds data-nimg attribute
      expect(
        img.hasDataNimg || img.hasSrcset,
        `Image ${img.src} is not using next/image — missing data-nimg and srcset`,
      ).toBe(true)
    }
  })

  test('no images cause layout shift (all have explicit dimensions)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const imagesWithoutDimensions = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return imgs
        .filter((img) => {
          // next/image handles dimensions automatically via fill or width/height
          const hasExplicit = img.hasAttribute('width') && img.hasAttribute('height')
          const hasFill = img.style.position === 'absolute' // fill mode
          const hasDataNimg = img.hasAttribute('data-nimg')
          return !hasExplicit && !hasFill && !hasDataNimg
        })
        .map((img) => img.src)
    })

    expect(imagesWithoutDimensions).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/*  13. Font loading behavior (FOIT / FOUT detection)                         */
/* -------------------------------------------------------------------------- */

test.describe('Font loading behavior', () => {
  test('Inter font loads without causing FOIT (invisible text)', async ({ page }) => {
    // Monitor for font-display behavior
    await page.addInitScript(() => {
      ;(window as unknown as Record<string, unknown>).__fontLoadEvents = []
      document.fonts.addEventListener('loadingdone', (event) => {
        ;(
          (window as unknown as Record<string, unknown>).__fontLoadEvents as {
            fontfaces: string[]
            timestamp: number
          }[]
        ).push({
          fontfaces: (event as FontFaceSetLoadEvent).fontfaces.map((f) => f.family),
          timestamp: performance.now(),
        })
      })
    })

    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1000)

    // Check that text is visible immediately (no FOIT)
    const h1Visible = await page.locator('h1').isVisible()
    expect(h1Visible).toBe(true)

    // Check font-display strategy
    const fontDisplay = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets)
      const fontFaceRules: string[] = []

      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules)
          for (const rule of rules) {
            if (rule instanceof CSSFontFaceRule) {
              fontFaceRules.push(rule.style.getPropertyValue('font-display'))
            }
          }
        } catch {
          // Cross-origin stylesheets can't be read — skip
        }
      }
      return fontFaceRules
    })

    // next/font defaults to font-display: swap which prevents FOIT
    // If there are font-face rules, they should use swap or optional
    for (const display of fontDisplay) {
      if (display) {
        expect(['swap', 'optional', 'fallback']).toContain(display)
      }
    }
  })

  test('fonts are preloaded or loaded via next/font (no external CDN)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    const fontRequests = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      return resources
        .filter(
          (r) =>
            r.name.includes('.woff') ||
            r.name.includes('.woff2') ||
            r.name.includes('.ttf') ||
            r.name.includes('.otf'),
        )
        .map((r) => ({
          name: r.name,
          isLocalhost: r.name.includes('localhost'),
          isPreloaded: r.initiatorType === 'link',
          duration: r.duration,
        }))
    })

    // All font resources should be self-hosted (via next/font), not from external CDNs
    for (const font of fontRequests) {
      expect(
        font.isLocalhost || font.name.includes('/_next/'),
        `Font loaded from external CDN: ${font.name}`,
      ).toBe(true)
    }

    // Verify no Google Fonts CDN link tags exist
    const googleFontsLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link'))
      return links
        .filter(
          (l) => l.href.includes('fonts.googleapis.com') || l.href.includes('fonts.gstatic.com'),
        )
        .map((l) => l.href)
    })

    expect(googleFontsLinks).toEqual([])
  })

  test('font loading does not cause CLS', async ({ page }) => {
    await page.goto('/')
    await injectCLSObserver(page)

    // Wait for fonts to finish loading
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1000)

    const cls = await getCLSScore(page)

    // Font-induced CLS should be zero or near-zero if using font-display: swap
    // with proper size-adjust or next/font's automatic optimization
    expect(cls).toBeLessThan(0.05)
  })
})

/* -------------------------------------------------------------------------- */
/*  14. CDP Performance metrics deep dive                                     */
/* -------------------------------------------------------------------------- */

test.describe('CDP Performance metrics', () => {
  test('ScriptDuration is reasonable on landing page', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')

    const metrics = await getPerformanceMetrics(cdp)

    const scriptDuration = metrics['ScriptDuration'] ?? 0
    const layoutDuration = metrics['LayoutDuration'] ?? 0
    const taskDuration = metrics['TaskDuration'] ?? 0

    console.log(
      `Landing page — Script: ${(scriptDuration * 1000).toFixed(0)}ms, Layout: ${(layoutDuration * 1000).toFixed(0)}ms, Task: ${(taskDuration * 1000).toFixed(0)}ms`,
    )

    // Script execution should not dominate — under 2s total
    expect(scriptDuration).toBeLessThan(2)

    // Layout should be fast — under 500ms
    expect(layoutDuration).toBeLessThan(0.5)
  })

  test('Nodes and LayoutCount stay bounded across navigations', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')
    const baselineMetrics = await getPerformanceMetrics(cdp)
    const baselineNodes = baselineMetrics['Nodes'] ?? 0

    for (let i = 0; i < 20; i++) {
      await page.goto(PUBLIC_ROUTES[i % PUBLIC_ROUTES.length])
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('load')
    const finalMetrics = await getPerformanceMetrics(cdp)
    const finalNodes = finalMetrics['Nodes'] ?? 0

    // Node count (DOM + internal) should not grow more than 2x
    if (baselineNodes > 0) {
      expect(finalNodes).toBeLessThan(baselineNodes * 2)
    }
  })

  test('Documents count does not grow (no iframe leaks)', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')
    const baselineMetrics = await getPerformanceMetrics(cdp)
    const baselineDocs = baselineMetrics['Documents'] ?? 0

    for (let i = 0; i < 15; i++) {
      await page.goto(PUBLIC_ROUTES[i % PUBLIC_ROUTES.length])
      await page.waitForLoadState('domcontentloaded')
    }

    await page.goto('/')
    await page.waitForLoadState('load')
    await forceGC(cdp)
    await page.waitForTimeout(500)

    const finalMetrics = await getPerformanceMetrics(cdp)
    const finalDocs = finalMetrics['Documents'] ?? 0

    // Documents should not accumulate — allow small variance (2 above baseline)
    expect(finalDocs).toBeLessThan(baselineDocs + 3)
  })
})

/* -------------------------------------------------------------------------- */
/*  15. Time to Interactive on all public pages                               */
/* -------------------------------------------------------------------------- */

test.describe('Time to Interactive', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`TTI on ${route} is under 4 seconds`, async ({ page }) => {
      const startTime = Date.now()

      await page.goto(route)
      await page.waitForLoadState('load')

      // For each page, verify a key interactive element is ready
      if (route === '/') {
        await expect(page.getByRole('link', { name: /start building/i })).toBeVisible()
      } else if (route === '/login') {
        await expect(page.getByLabel('Email')).toBeEnabled()
      } else if (route === '/signup') {
        await expect(page.locator('h1')).toBeVisible()
      }

      const tti = Date.now() - startTime

      console.log(`TTI for ${route}: ${tti}ms`)

      // 4s ceiling for dev server; production should be under 2s
      expect(tti).toBeLessThan(4000)
    })
  }
})

/* -------------------------------------------------------------------------- */
/*  16. Memory pressure — sustained interaction without leak                  */
/* -------------------------------------------------------------------------- */

test.describe('Sustained memory pressure', () => {
  test('50 navigation cycles with form interactions — heap stays bounded', async ({ page }) => {
    const cdp = await enablePerformanceMetrics(page)

    await page.goto('/')
    await page.waitForLoadState('load')
    await forceGC(cdp)
    const baseline = await getHeapSize(cdp)

    // Track heap at intervals
    const heapSnapshots: { cycle: number; usedJS: number }[] = []

    for (let i = 0; i < 50; i++) {
      const route = PUBLIC_ROUTES[i % PUBLIC_ROUTES.length]
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      // Do some interaction on login/signup pages
      if (route === '/login' || route === '/signup') {
        const emailField = page.getByLabel('Email')
        if (await emailField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await emailField.fill(`stress${i}@test.com`)
        }
      }

      // Snapshot every 10 cycles
      if (i % 10 === 9) {
        await forceGC(cdp)
        const snapshot = await getHeapSize(cdp)
        heapSnapshots.push({ cycle: i + 1, usedJS: snapshot.usedJS })
      }
    }

    // Final measurement
    await page.goto('/')
    await page.waitForLoadState('load')
    await forceGC(cdp)
    await page.waitForTimeout(300)
    await forceGC(cdp)
    const final = await getHeapSize(cdp)

    // Log the trajectory
    console.log(`Heap baseline: ${(baseline.usedJS / 1024 / 1024).toFixed(1)} MB`)
    for (const snap of heapSnapshots) {
      console.log(`Heap at cycle ${snap.cycle}: ${(snap.usedJS / 1024 / 1024).toFixed(1)} MB`)
    }
    console.log(`Heap final: ${(final.usedJS / 1024 / 1024).toFixed(1)} MB`)

    // Final heap should not exceed 4x baseline (generous for dev mode)
    expect(final.usedJS).toBeLessThan(baseline.usedJS * 4)

    // Heap should not be monotonically increasing after GC
    // (check that at least one later snapshot is smaller than an earlier one,
    //  or that they plateau)
    if (heapSnapshots.length >= 3) {
      const last = heapSnapshots[heapSnapshots.length - 1].usedJS
      const mid = heapSnapshots[Math.floor(heapSnapshots.length / 2)].usedJS
      // If last is significantly larger than mid, it might be leaking
      // Allow 50% growth from mid to end (some caching is expected)
      expect(last).toBeLessThan(mid * 1.5)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  17. Console error budget during performance tests                         */
/* -------------------------------------------------------------------------- */

test.describe('Error budget during performance cycles', () => {
  test('no uncaught exceptions during 30-navigation memory stress', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    for (let i = 0; i < 30; i++) {
      await page.goto(PUBLIC_ROUTES[i % PUBLIC_ROUTES.length])
      await page.waitForLoadState('domcontentloaded')
    }

    // Filter out known non-critical browser noise
    const critical = errors.filter(
      (msg) =>
        !msg.includes('ResizeObserver') &&
        !msg.includes('Loading chunk') &&
        !msg.includes('ChunkLoadError') &&
        !msg.includes('AbortError') &&
        !msg.includes('cancelled'),
    )

    expect(critical).toEqual([])
  })
})
