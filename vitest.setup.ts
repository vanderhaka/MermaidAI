import '@testing-library/jest-dom/vitest'

// Node 22+ defines experimental localStorage/sessionStorage accessors on
// globalThis that yield `undefined` unless --localstorage-file is set, and the
// vitest DOM environments merge window into globalThis WITHOUT overriding
// existing keys — so the dead Node stubs shadow any real Storage. Install a
// spec-adequate in-memory Storage, but only when the environment's own one is
// unusable, so a fixed Node/vitest combination wins automatically.
class MemoryStorage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(String(key)) ?? null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value))
  }
}

function storageUsable(key: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const storage = (globalThis as Record<string, unknown>)[key] as Storage | undefined
    if (!storage) return false
    storage.setItem('__vitest_probe__', '1')
    storage.removeItem('__vitest_probe__')
    return true
  } catch {
    return false
  }
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (!storageUsable(key)) {
    Object.defineProperty(globalThis, key, {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    })
  }
}
