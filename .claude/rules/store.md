---
paths:
  - 'src/store/**/*.ts'
---

# Zustand Store Conventions

## Store Pattern

- Separate `State` and `Actions` types, combined in `create<State & Actions>()`
- Initial state defined as const, spread into store
- All mutations use `set()` with functional updater for array operations

## Graph Store (`graph-store.ts`)

- **State:** `modules`, `nodes`, `edges`, `activeModuleId`
- **Actions:** CRUD for each entity + `setActiveModuleId`, `reset()`
- Array mutations: `set((s) => ({ modules: [...s.modules, module] }))`
- Removal: `set((s) => ({ modules: s.modules.filter(m => m.id !== id) }))`

## Chat Store (`chat-store.ts`)

- **State:** `messages`, `isLoading`, `error`
- Simpler store — message array + UI state flags

## Usage in Components

- Always use selectors: `useGraphStore((s) => s.modules)` — never destructure the whole store
- Derived data via hooks (e.g., `useFileTree` computes from `nodes`)
