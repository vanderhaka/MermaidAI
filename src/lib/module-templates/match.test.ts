// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isCartModuleName, normalizeModuleName } from './match'

describe('normalizeModuleName', () => {
  it('trims and lowercases', () => {
    expect(normalizeModuleName('  Shopping Cart ')).toBe('shopping cart')
  })
})

describe('isCartModuleName', () => {
  it.each([
    'Cart',
    'cart',
    'Shopping Cart',
    'shopping cart',
    'Cart Module',
    'Cart Management',
    'My Cart',
    'Cart Flow',
  ])('matches "%s"', (name) => {
    expect(isCartModuleName(name)).toBe(true)
  })

  it.each(['Payments', '', 'Go-Kart Racing', 'Descartes API', 'Cartography', 'Cartel Management'])(
    'does not match "%s"',
    (name) => {
      expect(isCartModuleName(name)).toBe(false)
    },
  )
})
