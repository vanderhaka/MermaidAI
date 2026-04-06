---
paths:
  - 'src/**/*.test.ts'
  - 'src/**/*.test.tsx'
  - 'vitest.config.ts'
  - 'vitest.setup.ts'
---

# Testing Conventions

## Setup

- Vitest with jsdom environment (default), happy-dom via `// @vitest-environment happy-dom` comment
- Setup file: `vitest.setup.ts` (extends matchers)
- Tests co-located with source: `ComponentName.test.tsx` next to `ComponentName.tsx`
- Also `src/__tests__/` for shared test utilities

## Mocking

- Mock external libraries at module level: `vi.mock('@xyflow/react', () => ({...}))`
- React Flow mocked with stub div components returning `data-testid` attributes
- Mock Supabase client in service tests — never hit real database in unit tests

## Assertion Style

- React Testing Library: `render()`, `screen.getByTestId()`, `screen.getByText()`
- Matchers: `expect(...).toBeInTheDocument()`, `expect(...).toHaveTextContent()`
- Describe/it blocks: `describe('ComponentName', () => { it('behavior description', ...) })`

## What to Test

- Components: renders correctly, user interactions, conditional rendering
- Services: success path, validation errors, auth errors, Supabase errors
- Store: state mutations, action side effects
- Hooks: derived state computation
