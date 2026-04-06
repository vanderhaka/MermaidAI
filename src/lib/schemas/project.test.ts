// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createProjectSchema } from '@/lib/schemas/project'

describe('createProjectSchema', () => {
  it('accepts valid input', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project' })
    expect(result.success).toBe(true)
    expect(result.data?.name).toBe('My Project')
  })

  it('accepts valid input with description', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      description: 'A description',
    })
    expect(result.success).toBe(true)
    expect(result.data?.description).toBe('A description')
  })

  it('accepts null description', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      description: null,
    })
    expect(result.success).toBe(true)
    expect(result.data?.description).toBeNull()
  })

  it('accepts missing description', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project' })
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('description')
  })

  it('rejects empty name', () => {
    const result = createProjectSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only name', () => {
    const result = createProjectSchema.safeParse({ name: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 100 characters', () => {
    const result = createProjectSchema.safeParse({ name: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('accepts name exactly 100 characters', () => {
    const result = createProjectSchema.safeParse({ name: 'a'.repeat(100) })
    expect(result.success).toBe(true)
  })

  it('trims whitespace from name', () => {
    const result = createProjectSchema.safeParse({ name: '  Test  ' })
    expect(result.success).toBe(true)
    expect(result.data?.name).toBe('Test')
  })

  it('strips extra fields', () => {
    const result = createProjectSchema.safeParse({
      name: 'Test',
      extraField: 'should be removed',
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined()
  })

  it('returns error on name path for empty name', () => {
    const result = createProjectSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameErrors = result.error.issues.filter((issue) => issue.path[0] === 'name')
      expect(nameErrors.length).toBeGreaterThan(0)
    }
  })
})
