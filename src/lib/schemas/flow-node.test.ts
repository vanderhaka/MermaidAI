// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowNodeSchema } from '@/lib/schemas/flow-node'

const validInput = {
  module_id: '550e8400-e29b-41d4-a716-446655440000',
  node_type: 'decision' as const,
  label: 'Check user role',
  pseudocode: 'if user.role === "admin" then ...',
  position: { x: 100, y: 200 },
  color: '#FF6B6B',
}

describe('createFlowNodeSchema', () => {
  it('accepts valid input', () => {
    const result = createFlowNodeSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.label).toBe('Check user role')
  })

  it('accepts all 6 valid node types', () => {
    const types = ['decision', 'process', 'entry', 'exit', 'start', 'end'] as const
    for (const node_type of types) {
      const result = createFlowNodeSchema.safeParse({ ...validInput, node_type })
      expect(result.success).toBe(true)
      expect(result.data?.node_type).toBe(node_type)
    }
  })

  it('rejects invalid node_type', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      node_type: 'invalid_type',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty string node_type', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      node_type: '',
    })
    expect(result.success).toBe(false)
  })

  it('defaults pseudocode to empty string', () => {
    const { pseudocode: _, ...noPseudocode } = validInput
    const result = createFlowNodeSchema.safeParse(noPseudocode)
    expect(result.success).toBe(true)
    expect(result.data?.pseudocode).toBe('')
  })

  it('accepts explicit pseudocode', () => {
    const result = createFlowNodeSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.pseudocode).toBe('if user.role === "admin" then ...')
  })

  it('rejects invalid UUID for module_id', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      module_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('returns error on module_id path for invalid UUID', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      module_id: 'bad',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const idErrors = result.error.issues.filter((issue) => issue.path[0] === 'module_id')
      expect(idErrors.length).toBeGreaterThan(0)
    }
  })

  it('rejects empty label', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      label: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only label', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      label: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('rejects label longer than 200 characters', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      label: 'a'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it('accepts label exactly 200 characters', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      label: 'a'.repeat(200),
    })
    expect(result.success).toBe(true)
  })

  it('trims whitespace from label', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      label: '  Check role  ',
    })
    expect(result.success).toBe(true)
    expect(result.data?.label).toBe('Check role')
  })

  it('rejects missing position', () => {
    const { position: _, ...noPosition } = validInput
    const result = createFlowNodeSchema.safeParse(noPosition)
    expect(result.success).toBe(false)
  })

  it('rejects position with missing y', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      position: { x: 0 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts negative position values', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      position: { x: -100, y: -200 },
    })
    expect(result.success).toBe(true)
    expect(result.data?.position).toEqual({ x: -100, y: -200 })
  })

  it('strips extra fields', () => {
    const result = createFlowNodeSchema.safeParse({
      ...validInput,
      extraField: 'should be removed',
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined()
  })
})
