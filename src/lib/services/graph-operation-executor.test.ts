// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GraphOperation,
  CreateModuleOperation,
  UpdateModuleOperation,
  DeleteModuleOperation,
  ConnectModulesOperation,
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

import { createModule, updateModule, deleteModule } from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'
import { executeOperations } from '@/lib/services/graph-operation-executor'
import type { ExecutionResult } from '@/lib/services/graph-operation-executor'

const mockSupabase = {} as SupabaseClient

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
        name: 'Auth Module',
        description: 'Handles authentication',
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
