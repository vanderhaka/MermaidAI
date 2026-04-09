// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '@/store/graph-store'
import type { Module, FlowNode, FlowEdge, OpenQuestion } from '@/types/graph'

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'm1',
    project_id: 'proj-1',
    domain: null,
    name: 'Auth',
    description: null,
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#4F46E5',
    entry_points: ['start'],
    exit_points: ['end'],
    created_at: '2026-04-06T00:00:00Z',
    updated_at: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'n1',
    module_id: 'm1',
    node_type: 'process',
    label: 'Process Data',
    pseudocode: '',
    position: { x: 100, y: 100 },
    color: '#10B981',
    created_at: '2026-04-06T00:00:00Z',
    updated_at: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'e1',
    module_id: 'm1',
    source_node_id: 'n1',
    target_node_id: 'n2',
    label: null,
    condition: null,
    created_at: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

describe('useGraphStore', () => {
  beforeEach(() => {
    useGraphStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with empty modules', () => {
      expect(useGraphStore.getState().modules).toEqual([])
    })

    it('starts with empty nodes', () => {
      expect(useGraphStore.getState().nodes).toEqual([])
    })

    it('starts with empty edges', () => {
      expect(useGraphStore.getState().edges).toEqual([])
    })

    it('starts with activeModuleId null', () => {
      expect(useGraphStore.getState().activeModuleId).toBeNull()
    })
  })

  describe('setModules', () => {
    it('replaces current modules with new array', () => {
      const modules = [makeModule({ id: 'm1' }), makeModule({ id: 'm2', name: 'Dashboard' })]
      useGraphStore.getState().setModules(modules)
      expect(useGraphStore.getState().modules).toEqual(modules)
    })

    it('overwrites previously set modules', () => {
      useGraphStore.getState().setModules([makeModule({ id: 'm1' })])
      const newModules = [makeModule({ id: 'm3', name: 'Settings' })]
      useGraphStore.getState().setModules(newModules)
      expect(useGraphStore.getState().modules).toEqual(newModules)
      expect(useGraphStore.getState().modules).toHaveLength(1)
    })
  })

  describe('setNodes', () => {
    it('replaces current nodes with new array', () => {
      const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2', label: 'Validate' })]
      useGraphStore.getState().setNodes(nodes)
      expect(useGraphStore.getState().nodes).toEqual(nodes)
    })

    it('overwrites previously set nodes', () => {
      useGraphStore.getState().setNodes([makeNode({ id: 'n1' })])
      const newNodes = [makeNode({ id: 'n3', label: 'Transform' })]
      useGraphStore.getState().setNodes(newNodes)
      expect(useGraphStore.getState().nodes).toEqual(newNodes)
    })
  })

  describe('setEdges', () => {
    it('replaces current edges with new array', () => {
      const edges = [makeEdge({ id: 'e1' }), makeEdge({ id: 'e2' })]
      useGraphStore.getState().setEdges(edges)
      expect(useGraphStore.getState().edges).toEqual(edges)
    })

    it('overwrites previously set edges', () => {
      useGraphStore.getState().setEdges([makeEdge({ id: 'e1' })])
      const newEdges = [makeEdge({ id: 'e3' })]
      useGraphStore.getState().setEdges(newEdges)
      expect(useGraphStore.getState().edges).toEqual(newEdges)
    })
  })

  describe('addModule', () => {
    it('appends a module to empty array', () => {
      const mod = makeModule()
      useGraphStore.getState().addModule(mod)
      expect(useGraphStore.getState().modules).toEqual([mod])
    })

    it('appends to existing modules', () => {
      const m1 = makeModule({ id: 'm1' })
      const m2 = makeModule({ id: 'm2', name: 'Dashboard' })
      useGraphStore.getState().addModule(m1)
      useGraphStore.getState().addModule(m2)
      expect(useGraphStore.getState().modules).toHaveLength(2)
      expect(useGraphStore.getState().modules[1]).toEqual(m2)
    })

    it('preserves existing modules when adding', () => {
      const m1 = makeModule({ id: 'm1' })
      useGraphStore.getState().addModule(m1)
      useGraphStore.getState().addModule(makeModule({ id: 'm2' }))
      expect(useGraphStore.getState().modules[0]).toEqual(m1)
    })
  })

  describe('addNode', () => {
    it('appends a node to empty array', () => {
      const node = makeNode()
      useGraphStore.getState().addNode(node)
      expect(useGraphStore.getState().nodes).toEqual([node])
    })

    it('appends to existing nodes', () => {
      const n1 = makeNode({ id: 'n1' })
      const n2 = makeNode({ id: 'n2', label: 'Validate' })
      useGraphStore.getState().addNode(n1)
      useGraphStore.getState().addNode(n2)
      expect(useGraphStore.getState().nodes).toHaveLength(2)
      expect(useGraphStore.getState().nodes[1]).toEqual(n2)
    })
  })

  describe('addEdge', () => {
    it('appends an edge to empty array', () => {
      const edge = makeEdge()
      useGraphStore.getState().addEdge(edge)
      expect(useGraphStore.getState().edges).toEqual([edge])
    })

    it('appends to existing edges', () => {
      const e1 = makeEdge({ id: 'e1' })
      const e2 = makeEdge({ id: 'e2' })
      useGraphStore.getState().addEdge(e1)
      useGraphStore.getState().addEdge(e2)
      expect(useGraphStore.getState().edges).toHaveLength(2)
      expect(useGraphStore.getState().edges[1]).toEqual(e2)
    })
  })

  describe('updateModule', () => {
    it('merges partial updates into matching module', () => {
      useGraphStore.getState().setModules([makeModule({ id: 'm1', name: 'Auth' })])
      useGraphStore.getState().updateModule('m1', { name: 'Authentication' })
      expect(useGraphStore.getState().modules[0].name).toBe('Authentication')
    })

    it('preserves unmodified fields', () => {
      const original = makeModule({ id: 'm1', name: 'Auth', color: '#4F46E5' })
      useGraphStore.getState().setModules([original])
      useGraphStore.getState().updateModule('m1', { name: 'Authentication' })
      expect(useGraphStore.getState().modules[0].color).toBe('#4F46E5')
    })

    it('does not modify other modules', () => {
      const m1 = makeModule({ id: 'm1', name: 'Auth' })
      const m2 = makeModule({ id: 'm2', name: 'Dashboard' })
      useGraphStore.getState().setModules([m1, m2])
      useGraphStore.getState().updateModule('m1', { name: 'Updated' })
      expect(useGraphStore.getState().modules[1].name).toBe('Dashboard')
    })

    it('is a no-op when id does not match', () => {
      useGraphStore.getState().setModules([makeModule({ id: 'm1' })])
      useGraphStore.getState().updateModule('nonexistent', { name: 'Nope' })
      expect(useGraphStore.getState().modules).toHaveLength(1)
      expect(useGraphStore.getState().modules[0].id).toBe('m1')
    })
  })

  describe('updateNode', () => {
    it('merges partial updates into matching node', () => {
      useGraphStore.getState().setNodes([makeNode({ id: 'n1', label: 'Old' })])
      useGraphStore.getState().updateNode('n1', { label: 'New' })
      expect(useGraphStore.getState().nodes[0].label).toBe('New')
    })

    it('preserves unmodified fields', () => {
      const original = makeNode({ id: 'n1', label: 'Process', pseudocode: 'do stuff' })
      useGraphStore.getState().setNodes([original])
      useGraphStore.getState().updateNode('n1', { label: 'Updated' })
      expect(useGraphStore.getState().nodes[0].pseudocode).toBe('do stuff')
    })

    it('does not modify other nodes', () => {
      const n1 = makeNode({ id: 'n1', label: 'A' })
      const n2 = makeNode({ id: 'n2', label: 'B' })
      useGraphStore.getState().setNodes([n1, n2])
      useGraphStore.getState().updateNode('n1', { label: 'Updated' })
      expect(useGraphStore.getState().nodes[1].label).toBe('B')
    })

    it('is a no-op when id does not match', () => {
      useGraphStore.getState().setNodes([makeNode({ id: 'n1' })])
      useGraphStore.getState().updateNode('nonexistent', { label: 'Nope' })
      expect(useGraphStore.getState().nodes).toHaveLength(1)
      expect(useGraphStore.getState().nodes[0].id).toBe('n1')
    })
  })

  describe('removeModule', () => {
    it('removes module by id', () => {
      useGraphStore.getState().setModules([makeModule({ id: 'm1' }), makeModule({ id: 'm2' })])
      useGraphStore.getState().removeModule('m1')
      expect(useGraphStore.getState().modules).toHaveLength(1)
      expect(useGraphStore.getState().modules[0].id).toBe('m2')
    })

    it('is a no-op when id does not match', () => {
      useGraphStore.getState().setModules([makeModule({ id: 'm1' })])
      useGraphStore.getState().removeModule('nonexistent')
      expect(useGraphStore.getState().modules).toHaveLength(1)
    })
  })

  describe('removeNode', () => {
    it('removes node by id', () => {
      useGraphStore.getState().setNodes([makeNode({ id: 'n1' }), makeNode({ id: 'n2' })])
      useGraphStore.getState().removeNode('n1')
      expect(useGraphStore.getState().nodes).toHaveLength(1)
      expect(useGraphStore.getState().nodes[0].id).toBe('n2')
    })

    it('is a no-op when id does not match', () => {
      useGraphStore.getState().setNodes([makeNode({ id: 'n1' })])
      useGraphStore.getState().removeNode('nonexistent')
      expect(useGraphStore.getState().nodes).toHaveLength(1)
    })
  })

  describe('removeEdge', () => {
    it('removes edge by id', () => {
      useGraphStore.getState().setEdges([makeEdge({ id: 'e1' }), makeEdge({ id: 'e2' })])
      useGraphStore.getState().removeEdge('e1')
      expect(useGraphStore.getState().edges).toHaveLength(1)
      expect(useGraphStore.getState().edges[0].id).toBe('e2')
    })

    it('is a no-op when id does not match', () => {
      useGraphStore.getState().setEdges([makeEdge({ id: 'e1' })])
      useGraphStore.getState().removeEdge('nonexistent')
      expect(useGraphStore.getState().edges).toHaveLength(1)
    })
  })

  describe('setActiveModuleId', () => {
    it('sets active module id', () => {
      useGraphStore.getState().setActiveModuleId('m1')
      expect(useGraphStore.getState().activeModuleId).toBe('m1')
    })

    it('sets active module id to null', () => {
      useGraphStore.getState().setActiveModuleId('m1')
      useGraphStore.getState().setActiveModuleId(null)
      expect(useGraphStore.getState().activeModuleId).toBeNull()
    })
  })

  describe('reset', () => {
    it('clears all state back to initial values', () => {
      useGraphStore.getState().addModule(makeModule())
      useGraphStore.getState().addNode(makeNode())
      useGraphStore.getState().addEdge(makeEdge())
      useGraphStore.getState().addOpenQuestion(makeQuestion())
      useGraphStore.getState().setActiveModuleId('m1')

      useGraphStore.getState().reset()

      const state = useGraphStore.getState()
      expect(state.modules).toEqual([])
      expect(state.nodes).toEqual([])
      expect(state.edges).toEqual([])
      expect(state.openQuestions).toEqual([])
      expect(state.activeModuleId).toBeNull()
    })
  })

  describe('openQuestions', () => {
    it('starts with empty openQuestions', () => {
      expect(useGraphStore.getState().openQuestions).toEqual([])
    })

    it('addOpenQuestion appends to array', () => {
      useGraphStore.getState().addOpenQuestion(makeQuestion())
      expect(useGraphStore.getState().openQuestions).toHaveLength(1)
    })

    it('addOpenQuestion appends to existing questions', () => {
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-1' }))
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-2', question: 'Another?' }))
      expect(useGraphStore.getState().openQuestions).toHaveLength(2)
      expect(useGraphStore.getState().openQuestions[1].id).toBe('oq-2')
    })

    it('setOpenQuestions replaces entire array', () => {
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-1' }))
      const replacement = [makeQuestion({ id: 'oq-3' })]
      useGraphStore.getState().setOpenQuestions(replacement)
      expect(useGraphStore.getState().openQuestions).toEqual(replacement)
      expect(useGraphStore.getState().openQuestions).toHaveLength(1)
    })

    it('resolveOpenQuestion updates status and stores resolution', () => {
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-1' }))
      useGraphStore.getState().resolveOpenQuestion('oq-1', 'Use OAuth2')
      const q = useGraphStore.getState().openQuestions[0]
      expect(q.status).toBe('resolved')
      expect(q.resolution).toBe('Use OAuth2')
      expect(q.resolved_at).toBeTruthy()
    })

    it('resolveOpenQuestion does not modify other questions', () => {
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-1' }))
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-2' }))
      useGraphStore.getState().resolveOpenQuestion('oq-1', 'Resolved')
      expect(useGraphStore.getState().openQuestions[1].status).toBe('open')
    })

    it('resolveOpenQuestion is a no-op when id does not match', () => {
      useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-1' }))
      useGraphStore.getState().resolveOpenQuestion('nonexistent', 'Nope')
      expect(useGraphStore.getState().openQuestions[0].status).toBe('open')
    })
  })
})

function makeQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'oq-1',
    project_id: 'proj-1',
    node_id: 'n1',
    section: 'Authentication',
    question: 'What OAuth providers?',
    status: 'open',
    resolution: null,
    created_at: '2026-04-08T00:00:00Z',
    resolved_at: null,
    ...overrides,
  }
}
