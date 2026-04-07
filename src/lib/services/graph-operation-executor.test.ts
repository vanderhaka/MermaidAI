// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type {
  GraphOperation,
  CreateModuleOperation,
  UpdateModuleOperation,
  DeleteModuleOperation,
  ConnectModulesOperation,
  CreateNodeOperation,
  UpdateNodeOperation,
  DeleteNodeOperation,
  CreateEdgeOperation,
  DeleteEdgeOperation,
} from '@/types/chat'

vi.mock('@/lib/services/module-service', () => ({
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deleteModule: vi.fn(),
}))

vi.mock('@/lib/services/module-connection-service', () => ({
  connectModules: vi.fn(),
  disconnectModules: vi.fn(),
}))

vi.mock('@/lib/services/graph-service', () => ({
  addNode: vi.fn(),
  updateNode: vi.fn(),
  removeNode: vi.fn(),
  addEdge: vi.fn(),
  removeEdge: vi.fn(),
}))

import { createModule, updateModule, deleteModule } from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'
import { addNode, updateNode, removeNode, addEdge, removeEdge } from '@/lib/services/graph-service'
import { executeOperations } from '@/lib/services/graph-operation-executor'
import type { ExecutionResult } from '@/lib/services/graph-operation-executor'

const mockSupabase = { projectId: 'proj-1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('executeOperations', () => {
  it('returns empty results array when given no operations', async () => {
    const result = await executeOperations([], mockSupabase)

    expect(result).toEqual({ success: true, results: [] })
  })

  describe('create_module', () => {
    it('calls createModule service with operation payload', async () => {
      const op: CreateModuleOperation = {
        type: 'create_module',
        payload: { name: 'Auth Module', description: 'Handles authentication' },
      }

      vi.mocked(createModule).mockResolvedValue({
        success: true,
        data: { id: 'mod-1', name: 'Auth Module' } as any,
      })

      const result = await executeOperations([op], mockSupabase)

      expect(createModule).toHaveBeenCalledWith({
        project_id: 'proj-1',
        name: 'Auth Module',
        description: 'Handles authentication',
        position: { x: 0, y: 0 },
        color: '#111827',
        entry_points: [],
        exit_points: [],
      })
      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]).toEqual({
        operation: 'create_module',
        success: true,
      })
    })

    it('records failure when createModule service fails', async () => {
      const op: CreateModuleOperation = {
        type: 'create_module',
        payload: { name: 'Bad Module' },
      }

      vi.mocked(createModule).mockResolvedValue({
        success: false,
        error: 'Validation failed: name too short',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'create_module',
        success: false,
        error: 'Validation failed: name too short',
      })
    })
  })

  describe('update_module', () => {
    it('calls updateModule service with module id and payload', async () => {
      const op: UpdateModuleOperation = {
        type: 'update_module',
        payload: { moduleId: 'mod-1', name: 'Updated Name' },
      }

      vi.mocked(updateModule).mockResolvedValue({
        success: true,
        data: { id: 'mod-1', name: 'Updated Name' } as any,
      })

      const result = await executeOperations([op], mockSupabase)

      expect(updateModule).toHaveBeenCalledWith('mod-1', { name: 'Updated Name' })
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'update_module',
        success: true,
      })
    })

    it('records failure when updateModule service fails', async () => {
      const op: UpdateModuleOperation = {
        type: 'update_module',
        payload: { moduleId: 'mod-1', name: 'X' },
      }

      vi.mocked(updateModule).mockResolvedValue({
        success: false,
        error: 'Module not found',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'update_module',
        success: false,
        error: 'Module not found',
      })
    })
  })

  describe('delete_module', () => {
    it('calls deleteModule service with module id', async () => {
      const op: DeleteModuleOperation = {
        type: 'delete_module',
        payload: { moduleId: 'mod-1' },
      }

      vi.mocked(deleteModule).mockResolvedValue({ success: true })

      const result = await executeOperations([op], mockSupabase)

      expect(deleteModule).toHaveBeenCalledWith('mod-1')
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'delete_module',
        success: true,
      })
    })

    it('records failure when deleteModule service fails', async () => {
      const op: DeleteModuleOperation = {
        type: 'delete_module',
        payload: { moduleId: 'mod-1' },
      }

      vi.mocked(deleteModule).mockResolvedValue({
        success: false,
        error: 'Foreign key violation',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'delete_module',
        success: false,
        error: 'Foreign key violation',
      })
    })
  })

  describe('connect_modules', () => {
    it('calls connectModules service with payload fields', async () => {
      const op: ConnectModulesOperation = {
        type: 'connect_modules',
        payload: {
          sourceModuleId: 'mod-1',
          targetModuleId: 'mod-2',
          sourceExitPoint: 'success',
          targetEntryPoint: 'default',
        },
      }

      vi.mocked(connectModules).mockResolvedValue({
        success: true,
        data: { id: 'conn-1' } as any,
      })

      const result = await executeOperations([op], mockSupabase)

      expect(connectModules).toHaveBeenCalledWith({
        project_id: 'proj-1',
        source_module_id: 'mod-1',
        target_module_id: 'mod-2',
        source_exit_point: 'success',
        target_entry_point: 'default',
      })
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'connect_modules',
        success: true,
      })
    })

    it('records failure when connectModules service fails', async () => {
      const op: ConnectModulesOperation = {
        type: 'connect_modules',
        payload: {
          sourceModuleId: 'mod-1',
          targetModuleId: 'mod-1',
          sourceExitPoint: 'out',
          targetEntryPoint: 'in',
        },
      }

      vi.mocked(connectModules).mockResolvedValue({
        success: false,
        error: 'Cannot connect module to itself',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'connect_modules',
        success: false,
        error: 'Cannot connect module to itself',
      })
    })
  })

  describe('multiple operations', () => {
    it('executes all operations sequentially and aggregates results', async () => {
      const ops: GraphOperation[] = [
        { type: 'create_module', payload: { name: 'Module A' } },
        { type: 'create_module', payload: { name: 'Module B' } },
        { type: 'update_module', payload: { moduleId: 'mod-1', description: 'Updated' } },
      ]

      vi.mocked(createModule)
        .mockResolvedValueOnce({ success: true, data: { id: 'mod-a' } as any })
        .mockResolvedValueOnce({ success: true, data: { id: 'mod-b' } as any })
      vi.mocked(updateModule).mockResolvedValue({ success: true, data: { id: 'mod-1' } as any })

      const result = await executeOperations(ops, mockSupabase)

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(3)
      expect(result.results.every((r) => r.success)).toBe(true)
    })

    it('marks overall success as false if any operation fails', async () => {
      const ops: GraphOperation[] = [
        { type: 'create_module', payload: { name: 'Module A' } },
        { type: 'delete_module', payload: { moduleId: 'nonexistent' } },
      ]

      vi.mocked(createModule).mockResolvedValue({
        success: true,
        data: { id: 'mod-a' } as any,
      })
      vi.mocked(deleteModule).mockResolvedValue({
        success: false,
        error: 'Not found',
      })

      const result = await executeOperations(ops, mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(false)
      expect(result.results[1].error).toBe('Not found')
    })

    it('continues executing remaining operations after a failure', async () => {
      const ops: GraphOperation[] = [
        { type: 'delete_module', payload: { moduleId: 'bad' } },
        { type: 'create_module', payload: { name: 'Good Module' } },
      ]

      vi.mocked(deleteModule).mockResolvedValue({
        success: false,
        error: 'Not found',
      })
      vi.mocked(createModule).mockResolvedValue({
        success: true,
        data: { id: 'mod-good' } as any,
      })

      const result = await executeOperations(ops, mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results).toHaveLength(2)
      expect(result.results[0].success).toBe(false)
      expect(result.results[1].success).toBe(true)
      expect(createModule).toHaveBeenCalled()
    })
  })

  describe('create_node', () => {
    it('calls addNode service with operation payload', async () => {
      const op: CreateNodeOperation = {
        type: 'create_node',
        payload: { moduleId: 'mod-1', label: 'Validate Input', nodeType: 'process' },
      }

      vi.mocked(addNode).mockResolvedValue({
        success: true,
        data: { id: 'node-1', label: 'Validate Input' } as any,
      })

      const result = await executeOperations([op], mockSupabase)

      expect(addNode).toHaveBeenCalledWith({
        module_id: 'mod-1',
        label: 'Validate Input',
        node_type: 'process',
        pseudocode: '',
        position: { x: 0, y: 0 },
        color: '#2563eb',
      })
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'create_node',
        success: true,
      })
    })

    it('records failure when addNode service fails', async () => {
      const op: CreateNodeOperation = {
        type: 'create_node',
        payload: { moduleId: 'mod-1', label: '', nodeType: 'process' },
      }

      vi.mocked(addNode).mockResolvedValue({
        success: false,
        error: 'Validation failed: label required',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'create_node',
        success: false,
        error: 'Validation failed: label required',
      })
    })
  })

  describe('update_node', () => {
    it('calls updateNode service with node id and fields', async () => {
      const op: UpdateNodeOperation = {
        type: 'update_node',
        payload: { nodeId: 'node-1', label: 'Updated Label', pseudocode: 'return true' },
      }

      vi.mocked(updateNode).mockResolvedValue({
        success: true,
        data: { id: 'node-1', label: 'Updated Label' } as any,
      })

      const result = await executeOperations([op], mockSupabase)

      expect(updateNode).toHaveBeenCalledWith('node-1', {
        label: 'Updated Label',
        pseudocode: 'return true',
      })
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'update_node',
        success: true,
      })
    })

    it('records failure when updateNode service fails', async () => {
      const op: UpdateNodeOperation = {
        type: 'update_node',
        payload: { nodeId: 'nonexistent', label: 'X' },
      }

      vi.mocked(updateNode).mockResolvedValue({
        success: false,
        error: 'Node not found',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'update_node',
        success: false,
        error: 'Node not found',
      })
    })
  })

  describe('delete_node', () => {
    it('calls removeNode service with node id', async () => {
      const op: DeleteNodeOperation = {
        type: 'delete_node',
        payload: { nodeId: 'node-1' },
      }

      vi.mocked(removeNode).mockResolvedValue({ success: true, data: null })

      const result = await executeOperations([op], mockSupabase)

      expect(removeNode).toHaveBeenCalledWith('node-1')
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'delete_node',
        success: true,
      })
    })

    it('records failure when removeNode service fails', async () => {
      const op: DeleteNodeOperation = {
        type: 'delete_node',
        payload: { nodeId: 'node-1' },
      }

      vi.mocked(removeNode).mockResolvedValue({
        success: false,
        error: 'Foreign key violation',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'delete_node',
        success: false,
        error: 'Foreign key violation',
      })
    })
  })

  describe('create_edge', () => {
    it('calls addEdge service with operation payload', async () => {
      const op: CreateEdgeOperation = {
        type: 'create_edge',
        payload: {
          moduleId: 'mod-1',
          sourceNodeId: 'node-1',
          targetNodeId: 'node-2',
          label: 'yes',
          condition: 'isValid',
        },
      }

      vi.mocked(addEdge).mockResolvedValue({
        success: true,
        data: { id: 'edge-1' } as any,
      })

      const result = await executeOperations([op], mockSupabase)

      expect(addEdge).toHaveBeenCalledWith({
        module_id: 'mod-1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        label: 'yes',
        condition: 'isValid',
      })
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'create_edge',
        success: true,
      })
    })

    it('records failure when addEdge service fails', async () => {
      const op: CreateEdgeOperation = {
        type: 'create_edge',
        payload: {
          moduleId: 'mod-1',
          sourceNodeId: 'node-1',
          targetNodeId: 'node-1',
        },
      }

      vi.mocked(addEdge).mockResolvedValue({
        success: false,
        error: 'Source and target cannot be the same',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'create_edge',
        success: false,
        error: 'Source and target cannot be the same',
      })
    })
  })

  describe('delete_edge', () => {
    it('calls removeEdge service with edge id', async () => {
      const op: DeleteEdgeOperation = {
        type: 'delete_edge',
        payload: { edgeId: 'edge-1' },
      }

      vi.mocked(removeEdge).mockResolvedValue({ success: true, data: null })

      const result = await executeOperations([op], mockSupabase)

      expect(removeEdge).toHaveBeenCalledWith('edge-1')
      expect(result.success).toBe(true)
      expect(result.results[0]).toEqual({
        operation: 'delete_edge',
        success: true,
      })
    })

    it('records failure when removeEdge service fails', async () => {
      const op: DeleteEdgeOperation = {
        type: 'delete_edge',
        payload: { edgeId: 'edge-1' },
      }

      vi.mocked(removeEdge).mockResolvedValue({
        success: false,
        error: 'Edge not found',
      })

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'delete_edge',
        success: false,
        error: 'Edge not found',
      })
    })
  })

  describe('partial failure reporting', () => {
    it('reports which operations succeeded and which failed with error summary', async () => {
      const ops: GraphOperation[] = [
        {
          type: 'create_node',
          payload: { moduleId: 'mod-1', label: 'Good Node', nodeType: 'process' },
        },
        { type: 'delete_node', payload: { nodeId: 'bad-id' } },
        {
          type: 'create_edge',
          payload: { moduleId: 'mod-1', sourceNodeId: 'node-1', targetNodeId: 'node-2' },
        },
      ]

      vi.mocked(addNode).mockResolvedValue({
        success: true,
        data: { id: 'node-1' } as any,
      })
      vi.mocked(removeNode).mockResolvedValue({
        success: false,
        error: 'Node not found',
      })
      vi.mocked(addEdge).mockResolvedValue({
        success: true,
        data: { id: 'edge-1' } as any,
      })

      const result = await executeOperations(ops, mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results).toHaveLength(3)
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(false)
      expect(result.results[1].error).toBe('Node not found')
      expect(result.results[2].success).toBe(true)
      // error field summarises failures
      expect(result.error).toBeDefined()
      expect(result.error).toContain('1 of 3 operations failed')
    })

    it('does not include error field when all operations succeed', async () => {
      const ops: GraphOperation[] = [
        {
          type: 'create_node',
          payload: { moduleId: 'mod-1', label: 'Node A', nodeType: 'process' },
        },
        {
          type: 'create_node',
          payload: { moduleId: 'mod-1', label: 'Node B', nodeType: 'decision' },
        },
      ]

      vi.mocked(addNode)
        .mockResolvedValueOnce({ success: true, data: { id: 'n-1' } as any })
        .mockResolvedValueOnce({ success: true, data: { id: 'n-2' } as any })

      const result = await executeOperations(ops, mockSupabase)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('mixes module and node/edge operations with partial failure', async () => {
      const ops: GraphOperation[] = [
        { type: 'create_module', payload: { name: 'Auth Module' } },
        {
          type: 'create_node',
          payload: { moduleId: 'mod-1', label: 'Check Token', nodeType: 'process' },
        },
        { type: 'delete_edge', payload: { edgeId: 'bad-edge' } },
      ]

      vi.mocked(createModule).mockResolvedValue({
        success: true,
        data: { id: 'mod-1' } as any,
      })
      vi.mocked(addNode).mockResolvedValue({
        success: true,
        data: { id: 'node-1' } as any,
      })
      vi.mocked(removeEdge).mockResolvedValue({
        success: false,
        error: 'Edge not found',
      })

      const result = await executeOperations(ops, mockSupabase)

      expect(result.success).toBe(false)
      expect(result.error).toContain('1 of 3 operations failed')
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(true)
      expect(result.results[2].success).toBe(false)
    })
  })

  describe('unhandled operation type', () => {
    it('records an error for unknown operation types', async () => {
      const op = { type: 'unknown_op', payload: {} } as unknown as GraphOperation

      const result = await executeOperations([op], mockSupabase)

      expect(result.success).toBe(false)
      expect(result.results[0]).toEqual({
        operation: 'unknown_op',
        success: false,
        error: 'Unsupported operation type: unknown_op',
      })
    })
  })
})
