import { create } from 'zustand'
import type { Module, FlowNode, FlowEdge } from '@/types/graph'

type GraphState = {
  modules: Module[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  activeModuleId: string | null
}

type GraphActions = {
  setModules: (modules: Module[]) => void
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: FlowEdge[]) => void
  addModule: (module: Module) => void
  addNode: (node: FlowNode) => void
  addEdge: (edge: FlowEdge) => void
  updateModule: (id: string, partial: Partial<Module>) => void
  updateNode: (id: string, partial: Partial<FlowNode>) => void
  removeModule: (id: string) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  setActiveModuleId: (id: string | null) => void
  reset: () => void
}

const initialState: GraphState = {
  modules: [],
  nodes: [],
  edges: [],
  activeModuleId: null,
}

export const useGraphStore = create<GraphState & GraphActions>()((set) => ({
  ...initialState,

  setModules: (modules) => set({ modules }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addModule: (module) => set((state) => ({ modules: [...state.modules, module] })),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),

  updateModule: (id, partial) =>
    set((state) => ({
      modules: state.modules.map((m) => (m.id === id ? { ...m, ...partial } : m)),
    })),

  updateNode: (id, partial) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...partial } : n)),
    })),

  removeModule: (id) => set((state) => ({ modules: state.modules.filter((m) => m.id !== id) })),

  removeNode: (id) => set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),

  removeEdge: (id) => set((state) => ({ edges: state.edges.filter((e) => e.id !== id) })),

  setActiveModuleId: (id) => set({ activeModuleId: id }),

  reset: () => set(initialState),
}))
