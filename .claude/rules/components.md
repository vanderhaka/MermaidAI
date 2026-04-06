---
paths:
  - 'src/components/**/*.tsx'
---

# Component Conventions

## Structure

- Components grouped by feature: `auth/`, `canvas/`, `chat/`, `dashboard/`, `file-tree/`
- `"use client"` only on interactive components (forms, nodes, chat input)
- Default exports for all components: `export default function ComponentName()`

## Props & Typing

- Props typed with `type` at top of file (not interface), destructured in params
- Canvas nodes use `NodeProps` from `@xyflow/react` with custom data types
- Example: `type ProcessNodeData = { label: string; pseudocode?: string }`

## Canvas Nodes (`components/canvas/nodes/`)

- Each node type has its own file: ProcessNode, DecisionNode, StartNode, EndNode, EntryNode, ExitNode, ModuleCardNode
- Nodes use `<Handle type="target/source" position={Position.Top/Bottom} />` from @xyflow/react
- Custom edges in `edges/` use `EdgeLabelRenderer` and `getSmoothStepPath`

## Canvas Views (`components/canvas/views/`)

- Two-view architecture: ModuleMapView (high-level) and ModuleDetailView (flow within module)
- `CanvasContainer` routes between views based on `activeModuleId` from graph store

## Styling

- Tailwind CSS classes inline. No CSS modules or styled-components.

## Shared Patterns

- Auth forms: client-side Zod validation before calling server action
- Chat: auto-scroll on new messages, thinking indicator during streaming
- Canvas: `toReactFlowNodes()` / `toReactFlowEdges()` mappers in view components
