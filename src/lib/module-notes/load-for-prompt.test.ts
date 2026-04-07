// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Map([['host', 'localhost:3000']]))),
}))

const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

import { loadModuleNotesForChat } from './load-for-prompt'

function okResponse(body: string) {
  return Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
}
function notFound() {
  return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
}

beforeEach(() => {
  fetchSpy.mockReset()
})

describe('loadModuleNotesForChat', () => {
  it('returns module source when slug file exists', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/inventory.md')) return okResponse('# Inventory notes')
      return notFound()
    })

    const r = await loadModuleNotesForChat('Inventory')
    expect(r.source).toBe('module')
    if (r.source === 'module') {
      expect(r.markdown).toContain('Inventory notes')
    }
  })

  it('falls back to default.md when no module file exists', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/default.md')) return okResponse('# Default')
      return notFound()
    })

    const r = await loadModuleNotesForChat('Totally Unknown Module XYZ')
    expect(r.source).toBe('default')
    if (r.source === 'default') {
      expect(r.markdown).toContain('Default')
    }
  })

  it('returns none when neither file exists', async () => {
    fetchSpy.mockImplementation(() => notFound())
    const r = await loadModuleNotesForChat('Nothing Here')
    expect(r).toEqual({ source: 'none', markdown: null })
  })

  it('truncates long markdown', async () => {
    const long = 'x'.repeat(20_000)
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/cart.md')) return okResponse(long)
      return notFound()
    })

    const r = await loadModuleNotesForChat('Cart')
    expect(r.source).toBe('module')
    if (r.source === 'module') {
      expect(r.markdown!.length).toBeLessThan(long.length)
      expect(r.markdown).toContain('truncated')
    }
  })
})
