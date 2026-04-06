// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowEdgeSchema } from '@/lib/schemas/flow-edge'

const validInput = {
  module_id: '550e8400-e29b-41d4-a716-446655440000',
  source_node_id: '550e8400-e29b-41d4-a716-446655440001',
  target_node_id: '550e8400-e29b-41d4-a716-446655440002',
}

describe('createFlowEdgeSchema', () => {
  it('accepts valid input with only required fields', () => {
    const result = createFlowEdgeSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data).toEqual(validInput)
  })

  it('accepts valid input with label and condition', () => {
    const input = { ...validInput, label: 'Yes', condition: 'user.role === "admin"' }
    const result = createFlowEdgeSchema.safeParse(input)
    expect(result.success).toBe(true)
    expect(result.data?.label).toBe('Yes')
    expect(result.data?.condition).toBe('user.role === "admin"')
  })

  it('accepts undefined label', () => {
    const result = createFlowEdgeSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.label).toBeUndefined()
  })

  it('accepts undefined condition', () => {
    const result = createFlowEdgeSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.condition).toBeUndefined()
  })

  it('rejects invalid UUID for module_id', () => {
    const result = createFlowEdgeSchema.safeParse({
      ...validInput,
      module_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID for source_node_id', () => {
    const result = createFlowEdgeSchema.safeParse({
      ...validInput,
      source_node_id: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID for target_node_id', () => {
    const result = createFlowEdgeSchema.safeParse({
      ...validInput,
      target_node_id: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('returns error on module_id path for invalid UUID', () => {
    const result = createFlowEdgeSchema.safeParse({
      ...validInput,
      module_id: 'bad',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const idErrors = result.error.issues.filter((issue) => issue.path[0] === 'module_id')
      expect(idErrors.length).toBeGreaterThan(0)
    }
  })

  it('returns error on source_node_id path for invalid UUID', () => {
    const result = createFlowEdgeSchema.safeParse({
      ...validInput,
      source_node_id: 'bad',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const idErrors = result.error.issues.filter((issue) => issue.path[0] === 'source_node_id')
      expect(idErrors.length).toBeGreaterThan(0)
    }
  })

  it('strips extra fields', () => {
    const result = createFlowEdgeSchema.safeParse({
      ...validInput,
      extraField: 'should be removed',
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined()
  })
})
