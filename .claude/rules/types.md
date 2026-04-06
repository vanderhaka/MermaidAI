---
paths:
  - 'src/types/**/*.ts'
---

# Type Conventions

## Location

- All shared types in `src/types/` — never inline complex types in components
- `database.ts` — auto-generated from Supabase (`supabase gen types typescript`)
- `graph.ts` — domain types: Project, Module, FlowNode, FlowEdge, Position
- `chat.ts` — ChatMessage, ChatMode, GraphOperation (discriminated union)
- `auth.ts` — Zod schemas + inferred types for auth
- `file-tree.ts` — FileTreeNode structure

## Naming

- Domain types: `PascalCase` (Project, Module, FlowNode)
- Input types: `Create*Input`, `Update*Input` — use `Omit<Entity, 'id' | 'created_at' | ...>`
- Enums as unions: `type FlowNodeType = 'decision' | 'process' | 'entry' | 'exit' | 'start' | 'end'`
- Discriminated unions: `type GraphOperation = CreateModuleOp | UpdateModuleOp | ...` with `type` field

## Patterns

- Position: `{ x: number; y: number }` — shared between modules and nodes
- ChatMode: `'discovery' | 'module_map' | 'module_detail'` — drives prompt building and UI
- Operations have `type` discriminator + `payload` object
