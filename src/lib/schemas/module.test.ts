// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createModuleSchema } from '@/lib/schemas/module'

const validInput = {
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Auth',
  position: { x: 0, y: 0 },
  color: '#4A90D9',
}

describe('createModuleSchema', () => {
  it('accepts valid input', () => {
    const result = createModuleSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.name).toBe('Auth')
  })

  it('accepts valid input with entry and exit points', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      entry_points: ['start'],
      exit_points: ['end'],
    })
    expect(result.success).toBe(true)
    expect(result.data?.entry_points).toEqual(['start'])
    expect(result.data?.exit_points).toEqual(['end'])
  })

  it('defaults entry_points to empty array', () => {
    const result = createModuleSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.entry_points).toEqual([])
  })

  it('defaults exit_points to empty array', () => {
    const result = createModuleSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.exit_points).toEqual([])
  })

  it('rejects invalid UUID for project_id', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      project_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only name', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      name: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 100 characters', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      name: 'a'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  it('accepts name exactly 100 characters', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      name: 'a'.repeat(100),
    })
    expect(result.success).toBe(true)
  })

  it('trims whitespace from name', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      name: '  Auth  ',
    })
    expect(result.success).toBe(true)
    expect(result.data?.name).toBe('Auth')
  })

  it('rejects missing position', () => {
    const { position: _, ...noPosition } = validInput
    const result = createModuleSchema.safeParse(noPosition)
    expect(result.success).toBe(false)
  })

  it('rejects position with missing y', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      position: { x: 0 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts negative position values', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      position: { x: -100, y: -200 },
    })
    expect(result.success).toBe(true)
    expect(result.data?.position).toEqual({ x: -100, y: -200 })
  })

  it('strips extra fields', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      extraField: 'should be removed',
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined()
  })

  it('returns error on project_id path for invalid UUID', () => {
    const result = createModuleSchema.safeParse({
      ...validInput,
      project_id: 'bad',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const idErrors = result.error.issues.filter((issue) => issue.path[0] === 'project_id')
      expect(idErrors.length).toBeGreaterThan(0)
    }
  })
})
