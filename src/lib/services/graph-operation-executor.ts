import type { SupabaseClient } from '@supabase/supabase-js'

import type { GraphOperation } from '@/types/chat'
import { createModule, updateModule, deleteModule } from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'

export type OperationResult = {
  operation: string
  success: boolean
  error?: string
}

export type ExecutionResult = {
  success: boolean
  results: OperationResult[]
}

async function executeOne(op: GraphOperation, _supabase: SupabaseClient): Promise<OperationResult> {
  switch (op.type) {
    case 'create_module': {
      const result = await createModule(op.payload)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'update_module': {
      const { moduleId, ...fields } = op.payload
      const result = await updateModule(moduleId, fields)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'delete_module': {
      const result = await deleteModule(op.payload.moduleId)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'connect_modules': {
      const result = await connectModules({
        source_module_id: op.payload.sourceModuleId,
        target_module_id: op.payload.targetModuleId,
        source_exit_point: op.payload.sourceExitPoint,
        target_entry_point: op.payload.targetEntryPoint,
      })
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    default: {
      const unknownOp = op as { type: string }
      return {
        operation: unknownOp.type,
        success: false,
        error: `Unsupported operation type: ${unknownOp.type}`,
      }
    }
  }
}

export async function executeOperations(
  operations: GraphOperation[],
  supabase: SupabaseClient,
): Promise<ExecutionResult> {
  const results: OperationResult[] = []

  for (const op of operations) {
    const result = await executeOne(op, supabase)
    results.push(result)
  }

  return {
    success: results.every((r) => r.success),
    results,
  }
}
