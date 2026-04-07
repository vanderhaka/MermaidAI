/**
 * File name under `public/module-notes/` for a module title, e.g. "Shopping Cart" → `shopping-cart.md`.
 */
export function moduleNotesFileSlug(moduleName: string): string {
  const raw = moduleName
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return raw.length > 0 ? raw : 'module'
}
