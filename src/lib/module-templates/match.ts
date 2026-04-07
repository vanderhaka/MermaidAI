/**
 * Normalize module titles for template matching (case/spacing only).
 */
export function normalizeModuleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Exact names and two-word combos that qualify. */
const CART_EXACT = new Set(['cart', 'shopping cart', 'cart module'])

/** Second word must pair with "cart" to qualify (e.g. "cart management"). */
const CART_QUALIFIERS = new Set([
  'management',
  'module',
  'service',
  'system',
  'flow',
  'checkout',
  'page',
  'view',
])

/**
 * True when the module represents the shopping cart.
 * Avoids false positives like "Go-Kart Racing" or "Descartes API".
 */
export function isCartModuleName(name: string): boolean {
  const n = normalizeModuleName(name)
  if (CART_EXACT.has(n)) return true

  const words = n.split(/\s+/)

  if (words.length === 1) return n === 'cart'

  for (let i = 0; i < words.length; i++) {
    if (words[i] !== 'cart') continue
    const prev = words[i - 1]
    const next = words[i + 1]
    if (prev === 'shopping' || prev === 'my' || prev === 'the') return true
    if (next && CART_QUALIFIERS.has(next)) return true
    if (i === 0 && words.length <= 3) return true
  }

  return false
}
