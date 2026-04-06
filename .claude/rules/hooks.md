---
paths:
  - 'src/hooks/**/*.ts'
---

# Hook Conventions

## Pattern

- Named exports: `export function useCamelCase()`
- Derive computed data from Zustand store state via selectors
- Memoize expensive computations with `useMemo`

## Existing Hooks

- `useFileTree()` — derives `FileTreeNode` from `useGraphStore((s) => s.nodes)`
  Uses `useMemo(() => deriveFileTree(nodes), [nodes])`

## When to Create a Hook

- When a component needs derived/computed data from store state
- When multiple components share the same state subscription pattern
- Keep hooks thin — delegate complex logic to service functions
