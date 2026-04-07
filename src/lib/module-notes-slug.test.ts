// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { moduleNotesFileSlug } from './module-notes-slug'

describe('moduleNotesFileSlug', () => {
  it('slugifies titles', () => {
    expect(moduleNotesFileSlug('Inventory')).toBe('inventory')
    expect(moduleNotesFileSlug('Shopping Cart')).toBe('shopping-cart')
    expect(moduleNotesFileSlug('Discounts & Coupons')).toBe('discounts-coupons')
  })

  it('handles empty-ish input', () => {
    expect(moduleNotesFileSlug('   ')).toBe('module')
  })
})
