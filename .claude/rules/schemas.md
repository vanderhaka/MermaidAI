---
paths:
  - 'src/lib/schemas/**/*.ts'
---

# Zod Schema Conventions

## Location

- All entity validation schemas live in `src/lib/schemas/`
- One file per entity: `project.ts`, `module.ts`, `flow-node.ts`, `flow-edge.ts`, `module-connection.ts`
- Auth schemas live in `src/types/auth.ts` (co-located with auth types)

## Pattern

- Export named schemas: `createProjectSchema`, `updateModuleSchema`
- Prefix with operation: `create*`, `update*`, `delete*`
- Services import schemas and call `.safeParse(input)`
- First error message returned: `parsed.error.issues[0].message`

## Shared With

- API route handlers validate request bodies with these schemas
- Auth form components use auth schemas for client-side validation
