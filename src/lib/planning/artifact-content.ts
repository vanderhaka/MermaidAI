import {
  architectureSnapshotContentSchema,
  executionHandoffContentSchema,
  workPlanContentSchema,
} from '@/lib/schemas/planning'
import { EXECUTION_HANDOFF_CAPABILITIES } from '@/types/planning'
import type {
  ArchitectureSnapshotContent,
  ExecutionHandoffCapability,
  ExecutionHandoffContent,
  WorkPlanContent,
} from '@/types/planning'

export function parseArchitectureSnapshotContent(input: unknown): ArchitectureSnapshotContent {
  return architectureSnapshotContentSchema.parse(input)
}

export function parseWorkPlanContent(input: unknown): WorkPlanContent {
  return workPlanContentSchema.parse(input)
}

export function parseExecutionHandoffContent(input: unknown): ExecutionHandoffContent {
  return executionHandoffContentSchema.parse(input)
}

export function getExecutionHandoffCapabilities(): readonly ExecutionHandoffCapability[] {
  return EXECUTION_HANDOFF_CAPABILITIES
}
