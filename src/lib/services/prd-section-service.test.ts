// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModulePrdSection } from '@/types/graph'

const { mockUpsert, mockOrder } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockOrder: vi.fn(),
}))

const mockEq = vi.fn(() => ({ order: mockOrder }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect, upsert: mockUpsert }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))
vi.mock('server-only', () => ({}))

import {
  composePrdContent,
  listPrdSections,
  writePrdSection,
} from '@/lib/services/prd-section-service'

const timestamp = '2026-07-25T00:00:00Z'

function makeSection(overrides: Partial<ModulePrdSection> = {}): ModulePrdSection {
  return {
    id: 'sec-1',
    module_id: 'module-1',
    section: 'Refunds',
    content: 'Refunds allowed within 14 days.',
    position: 0,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

describe('writePrdSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('replaces a section by default, so a revision supersedes the old text', async () => {
    mockOrder.mockResolvedValueOnce({ data: [makeSection()], error: null })
    mockOrder.mockResolvedValueOnce({
      data: [makeSection({ content: 'Refunds allowed within 30 days.' })],
      error: null,
    })

    const result = await writePrdSection({
      moduleId: 'module-1',
      section: 'Refunds',
      markdown: 'Refunds allowed within 30 days.',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        module_id: 'module-1',
        section: 'Refunds',
        content: 'Refunds allowed within 30 days.',
      }),
      { onConflict: 'module_id,section' },
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].content).toBe('Refunds allowed within 30 days.')
      expect(result.data[0].content).not.toContain('14 days')
    }
  })

  it('appends only when explicitly asked', async () => {
    mockOrder.mockResolvedValueOnce({ data: [makeSection()], error: null })
    mockOrder.mockResolvedValueOnce({ data: [makeSection()], error: null })

    await writePrdSection({
      moduleId: 'module-1',
      section: 'Refunds',
      markdown: 'Sale items excluded.',
      mode: 'append',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Refunds allowed within 14 days.\n\nSale items excluded.',
      }),
      { onConflict: 'module_id,section' },
    )
  })

  it('keeps a section at its original position when rewritten', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [makeSection({ section: 'Intro', position: 0 }), makeSection({ position: 1 })],
      error: null,
    })
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    await writePrdSection({
      moduleId: 'module-1',
      section: 'Refunds',
      markdown: 'Refunds allowed within 30 days.',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1 }),
      expect.anything(),
    )
  })

  it('appends a new section at the end', async () => {
    mockOrder.mockResolvedValueOnce({ data: [makeSection({ position: 0 })], error: null })
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    await writePrdSection({
      moduleId: 'module-1',
      section: 'Integrations',
      markdown: 'Stripe Checkout.',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'Integrations', position: 1 }),
      expect.anything(),
    )
  })

  it('rejects a blank section name', async () => {
    const result = await writePrdSection({
      moduleId: 'module-1',
      section: '   ',
      markdown: 'anything',
    })

    expect(result.success).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('composePrdContent', () => {
  it('renders sections in position order under their headings', async () => {
    const markdown = await composePrdContent([
      makeSection({ section: 'Refunds', content: 'Within 30 days.', position: 1 }),
      makeSection({ id: 'sec-0', section: 'Purpose', content: 'Sell things.', position: 0 }),
    ])

    expect(markdown).toBe('## Purpose\n\nSell things.\n\n## Refunds\n\nWithin 30 days.')
  })

  it('skips empty sections', async () => {
    const markdown = await composePrdContent([
      makeSection({ section: 'Purpose', content: 'Sell things.', position: 0 }),
      makeSection({ id: 'sec-2', section: 'Empty', content: '   ', position: 1 }),
    ])

    expect(markdown).toBe('## Purpose\n\nSell things.')
  })

  it('never contains the same heading twice', async () => {
    const markdown = await composePrdContent([
      makeSection({ section: 'Refunds', content: 'Within 30 days.', position: 0 }),
    ])

    expect(markdown.match(/## Refunds/g)).toHaveLength(1)
  })
})

describe('listPrdSections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('surfaces query errors', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })

    const result = await listPrdSections('module-1')

    expect(result).toEqual({ success: false, error: 'boom' })
  })
})
