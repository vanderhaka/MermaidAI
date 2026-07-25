// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyProjectToolEvent,
  applyScopeToolEvent,
} from '@/components/dashboard/tool-event-applier'
import { useGraphStore } from '@/store/graph-store'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    project_id: 'proj-1',
    domain: null,
    name: 'Checkout',
    description: null,
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#111827',
    entry_points: [],
    exit_points: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-1',
    module_id: 'mod-1',
    node_type: 'process',
    label: 'Capture order',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#2563eb',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'edge-1',
    module_id: 'mod-1',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    label: null,
    condition: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'oq-1',
    project_id: 'proj-1',
    module_id: 'module-1',
    node_id: 'question-node-1',
    section: 'Checkout',
    question: 'What happens if payment fails?',
    status: 'open',
    resolution: null,
    coverage_area: null,
    created_at: '2026-01-01T00:00:00Z',
    resolved_at: null,
    ...overrides,
  }
}

function makeConnection(overrides: Partial<ModuleConnection> = {}): ModuleConnection {
  return {
    id: 'conn-1',
    project_id: 'proj-1',
    source_module_id: 'mod-source',
    target_module_id: 'mod-target',
    source_exit_point: 'success',
    target_entry_point: 'default',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('tool event appliers', () => {
  beforeEach(() => {
    useGraphStore.getState().reset()
  })

  it('applies scope open-question payloads to graph store and records count label', () => {
    const recordToolCall = vi.fn()
    const node = makeNode({ id: 'question-node-1', node_type: 'question' })
    const question = makeQuestion()
    const edge = makeEdge({ id: 'question-edge-1', target_node_id: 'question-node-1' })

    applyScopeToolEvent(
      'add_open_questions',
      { nodes: [node], questions: [question], edges: [edge] },
      {
        recordToolCall,
      },
    )

    expect(useGraphStore.getState().nodes).toEqual([node])
    expect(useGraphStore.getState().openQuestions).toEqual([question])
    expect(useGraphStore.getState().edges).toEqual([edge])
    expect(recordToolCall).toHaveBeenCalledWith('Flagged 1 question')
  })

  it('resolves a scope question, removes its question node, and clears active resolution state', () => {
    const recordToolCall = vi.fn()
    const clearActiveResolutionQuestion = vi.fn()
    const questionNode = makeNode({ id: 'question-node-1', node_type: 'question' })
    const question = makeQuestion({
      id: 'oq-payment',
      node_id: 'question-node-1',
      resolution: 'Let the customer retry with another card.',
      status: 'resolved',
    })
    useGraphStore.getState().setNodes([questionNode])
    useGraphStore
      .getState()
      .setOpenQuestions([makeQuestion({ id: 'oq-payment', node_id: 'question-node-1' })])

    applyScopeToolEvent(
      'resolve_open_question',
      { question },
      {
        activeResolutionQuestionId: 'oq-payment',
        clearActiveResolutionQuestion,
        recordToolCall,
      },
    )

    expect(useGraphStore.getState().nodes).toEqual([])
    expect(useGraphStore.getState().openQuestions[0]).toEqual(
      expect.objectContaining({
        id: 'oq-payment',
        status: 'resolved',
        resolution: 'Let the customer retry with another card.',
      }),
    )
    expect(clearActiveResolutionQuestion).toHaveBeenCalled()
    expect(recordToolCall).toHaveBeenCalledWith('Resolved question')
  })

  it('marks scope promote events for refresh', () => {
    const recordToolCall = vi.fn()
    const markPendingRefresh = vi.fn()

    applyScopeToolEvent(
      'promote_project',
      { promoted: true },
      { markPendingRefresh, recordToolCall },
    )

    expect(markPendingRefresh).toHaveBeenCalled()
    expect(recordToolCall).toHaveBeenCalledWith('Switched to Full Design')
  })

  it('labels promote events targeting scope as Quick Capture', () => {
    const recordToolCall = vi.fn()
    const markPendingRefresh = vi.fn()

    applyScopeToolEvent(
      'promote_project',
      { promoted: true, mode: 'scope' },
      { markPendingRefresh, recordToolCall },
    )

    expect(markPendingRefresh).toHaveBeenCalled()
    expect(recordToolCall).toHaveBeenCalledWith('Switched to Quick Capture')
  })

  it('applies insert_node_between payloads atomically: removes stale edge, adds node and edges', () => {
    const recordToolCall = vi.fn()
    const nodeA = makeNode({ id: 'node-a', label: 'Send Quote' })
    const nodeB = makeNode({ id: 'node-b', label: 'Send Invoice' })
    const staleEdge = makeEdge({
      id: 'edge-ab',
      source_node_id: 'node-a',
      target_node_id: 'node-b',
    })
    useGraphStore.getState().setNodes([nodeA, nodeB])
    useGraphStore.getState().setEdges([staleEdge])

    const insertedNode = makeNode({ id: 'node-new', label: 'Review Quote' })
    const edgeIn = makeEdge({ id: 'edge-in', source_node_id: 'node-a', target_node_id: 'node-new' })
    const edgeOut = makeEdge({
      id: 'edge-out',
      source_node_id: 'node-new',
      target_node_id: 'node-b',
    })

    applyScopeToolEvent(
      'insert_node_between',
      { node: insertedNode, edges: [edgeIn, edgeOut], removedEdgeIds: ['edge-ab'] },
      { recordToolCall },
    )

    const state = useGraphStore.getState()
    expect(state.nodes).toEqual([nodeA, nodeB, insertedNode])
    expect(state.edges).toEqual([edgeIn, edgeOut])
    expect(recordToolCall).toHaveBeenCalledWith('Inserted Review Quote')
  })

  it('applies Full Design connection payloads and refreshed endpoint modules', () => {
    const recordToolCall = vi.fn()
    const sourceModule = makeModule({
      id: 'mod-source',
      name: 'Cart',
      exit_points: ['success'],
    })
    const targetModule = makeModule({
      id: 'mod-target',
      name: 'Payments',
      entry_points: ['default'],
    })
    useGraphStore
      .getState()
      .setModules([
        makeModule({ id: 'mod-source', name: 'Cart', exit_points: [] }),
        makeModule({ id: 'mod-target', name: 'Payments', entry_points: [] }),
      ])
    const connection = makeConnection()

    applyProjectToolEvent(
      'connect_modules',
      { connection, sourceModule, targetModule },
      {
        recordToolCall,
      },
    )

    expect(useGraphStore.getState().connections).toEqual([connection])
    expect(useGraphStore.getState().modules).toEqual([
      expect.objectContaining({ id: 'mod-source', exit_points: ['success'] }),
      expect.objectContaining({ id: 'mod-target', entry_points: ['default'] }),
    ])
    expect(recordToolCall).toHaveBeenCalledWith('Connected Cart → Payments')
  })

  it('updates Full Design PRD content from write_prd payloads', () => {
    const recordToolCall = vi.fn()
    useGraphStore.getState().setModules([makeModule({ id: 'mod-1', prd_content: '' })])

    applyProjectToolEvent(
      'write_prd',
      {
        module: makeModule({ id: 'mod-1', prd_content: '## Checkout rules' }),
      },
      {
        recordToolCall,
      },
    )

    expect(useGraphStore.getState().modules[0].prd_content).toBe('## Checkout rules')
    expect(recordToolCall).toHaveBeenCalledWith('Updated PRD')
  })
})
