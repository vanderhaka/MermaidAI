import { create } from 'zustand'
import type { Module, FlowNode, FlowEdge, ModuleConnection, OpenQuestion } from '@/types/graph'

type GraphState = {
  modules: Module[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  connections: ModuleConnection[]
  openQuestions: OpenQuestion[]
  activeModuleId: string | null
}

type GraphActions = {
  setModules: (modules: Module[]) => void
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: FlowEdge[]) => void
  setConnections: (connections: ModuleConnection[]) => void
  setOpenQuestions: (questions: OpenQuestion[]) => void
  addModule: (module: Module) => void
  addNode: (node: FlowNode) => void
  addEdge: (edge: FlowEdge) => void
  addConnection: (connection: ModuleConnection) => void
  addOpenQuestion: (question: OpenQuestion) => void
  updateModule: (id: string, partial: Partial<Module>) => void
  updateNode: (id: string, partial: Partial<FlowNode>) => void
  resolveOpenQuestion: (id: string, resolution: string) => void
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
  connections: [],
  openQuestions: [],
  activeModuleId: null,
}

export const useGraphStore = create<GraphState & GraphActions>()((set) => ({
  ...initialState,

  setModules: (modules) => set({ modules }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setConnections: (connections) => set({ connections }),
  setOpenQuestions: (questions) => set({ openQuestions: questions }),

  addModule: (module) => set((state) => ({ modules: [...state.modules, module] })),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),
  addConnection: (connection) =>
    set((state) => ({ connections: [...state.connections, connection] })),
  addOpenQuestion: (question) =>
    set((state) => ({ openQuestions: [...state.openQuestions, question] })),

  updateModule: (id, partial) =>
    set((state) => ({
      modules: state.modules.map((m) => (m.id === id ? { ...m, ...partial } : m)),
    })),

  updateNode: (id, partial) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...partial } : n)),
    })),

  resolveOpenQuestion: (id, resolution) =>
    set((state) => ({
      openQuestions: state.openQuestions.map((q) =>
        q.id === id
          ? { ...q, status: 'resolved' as const, resolution, resolved_at: new Date().toISOString() }
          : q,
      ),
    })),

  removeModule: (id) => set((state) => ({ modules: state.modules.filter((m) => m.id !== id) })),

  removeNode: (id) => set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),

  removeEdge: (id) => set((state) => ({ edges: state.edges.filter((e) => e.id !== id) })),

  setActiveModuleId: (id) => set({ activeModuleId: id }),

  reset: () => set(initialState),
}))
