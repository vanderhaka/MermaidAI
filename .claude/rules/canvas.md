---
paths:
  - 'src/components/canvas/**/*.tsx'
  - 'src/lib/canvas/**/*.ts'
---

# Canvas & React Flow Conventions

## Architecture

- Two-view system: ModuleMapView (module cards) and ModuleDetailView (flow nodes/edges)
- `CanvasContainer` switches views based on `activeModuleId` from graph store
- `Canvas` is a thin wrapper around `<ReactFlow>` — no state, pure presentation

## Data Flow

- Domain types (`FlowNode`, `FlowEdge`) mapped to React Flow types via `toReactFlowNodes()` / `toReactFlowEdges()` in view components
- Node type string (`node_type`) maps directly to React Flow `type` prop
- Module position stored as `{ x: number; y: number }` — same as React Flow position

## Node Types (6)

`process`, `decision`, `start`, `end`, `entry`, `exit` — each has a component in `nodes/`
Plus `ModuleCardNode` for the module map view

## Auto-Layout

- `computeLayout()` in `lib/canvas/layout.ts` uses dagre with `rankdir: 'TB'`
- Takes `FlowNode[]` + `FlowEdge[]`, returns nodes with computed positions
- Used when AI creates new nodes to avoid overlapping

## Colors

- Module colors defined in `lib/canvas/colors.ts`
- Assigned to modules for visual distinction in the map view
