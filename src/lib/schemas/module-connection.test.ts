// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createModuleConnectionSchema } from '@/lib/schemas/module-connection'

const validInput = {
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  source_module_id: '550e8400-e29b-41d4-a716-446655440001',
  target_module_id: '550e8400-e29b-41d4-a716-446655440002',
  source_exit_point: 'out',
  target_entry_point: 'in',
}

describe('createModuleConnectionSchema', () => {
  it('accepts valid input with different modules', () => {
    const result = createModuleConnectionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data).toEqual(validInput)
  })

  it('rejects self-referencing connection', () => {
    const sameId = '550e8400-e29b-41d4-a716-446655440000'
    const result = createModuleConnectionSchema.safeParse({
      project_id: sameId,
      source_module_id: sameId,
      target_module_id: sameId,
      source_exit_point: 'out',
      target_entry_point: 'in',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID for project_id', () => {
    const result = createModuleConnectionSchema.safeParse({
      ...validInput,
      project_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID for source_module_id', () => {
    const result = createModuleConnectionSchema.safeParse({
      ...validInput,
      source_module_id: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID for target_module_id', () => {
    const result = createModuleConnectionSchema.safeParse({
      ...validInput,
      target_module_id: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty source_exit_point', () => {
    const result = createModuleConnectionSchema.safeParse({
      ...validInput,
      source_exit_point: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty target_entry_point', () => {
    const result = createModuleConnectionSchema.safeParse({
      ...validInput,
      target_entry_point: '',
    })
    expect(result.success).toBe(false)
  })

  it('strips extra fields', () => {
    const result = createModuleConnectionSchema.safeParse({
      ...validInput,
      extraField: 'should be removed',
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined()
  })
})
