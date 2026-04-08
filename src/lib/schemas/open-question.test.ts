// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createOpenQuestionSchema, resolveOpenQuestionSchema } from '@/lib/schemas/open-question'

const validInput = {
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  node_id: '660e8400-e29b-41d4-a716-446655440000',
  section: 'Authentication',
  question: 'What OAuth providers should we support?',
}

describe('createOpenQuestionSchema', () => {
  it('accepts valid input and defaults status to open', () => {
    const result = createOpenQuestionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.data?.status).toBe('open')
    expect(result.data?.resolution).toBeNull()
  })

  it('accepts explicit status', () => {
    const result = createOpenQuestionSchema.safeParse({ ...validInput, status: 'resolved' })
    expect(result.success).toBe(true)
    expect(result.data?.status).toBe('resolved')
  })

  it('rejects empty question', () => {
    expect(createOpenQuestionSchema.safeParse({ ...validInput, question: '' }).success).toBe(false)
  })

  it('rejects whitespace-only question', () => {
    expect(createOpenQuestionSchema.safeParse({ ...validInput, question: '   ' }).success).toBe(
      false,
    )
  })

  it('rejects empty section', () => {
    expect(createOpenQuestionSchema.safeParse({ ...validInput, section: '' }).success).toBe(false)
  })

  it('rejects invalid project_id UUID', () => {
    const result = createOpenQuestionSchema.safeParse({ ...validInput, project_id: 'bad' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const idErrors = result.error.issues.filter((issue) => issue.path[0] === 'project_id')
      expect(idErrors.length).toBeGreaterThan(0)
    }
  })

  it('rejects invalid node_id UUID', () => {
    const result = createOpenQuestionSchema.safeParse({ ...validInput, node_id: 'bad' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const idErrors = result.error.issues.filter((issue) => issue.path[0] === 'node_id')
      expect(idErrors.length).toBeGreaterThan(0)
    }
  })

  it('rejects question longer than 500 characters', () => {
    const result = createOpenQuestionSchema.safeParse({
      ...validInput,
      question: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('accepts question exactly 500 characters', () => {
    const result = createOpenQuestionSchema.safeParse({
      ...validInput,
      question: 'a'.repeat(500),
    })
    expect(result.success).toBe(true)
  })

  it('trims whitespace from question', () => {
    const result = createOpenQuestionSchema.safeParse({
      ...validInput,
      question: '  What providers?  ',
    })
    expect(result.success).toBe(true)
    expect(result.data?.question).toBe('What providers?')
  })

  it('trims whitespace from section', () => {
    const result = createOpenQuestionSchema.safeParse({
      ...validInput,
      section: '  Auth  ',
    })
    expect(result.success).toBe(true)
    expect(result.data?.section).toBe('Auth')
  })

  it('strips extra fields', () => {
    const result = createOpenQuestionSchema.safeParse({
      ...validInput,
      extraField: 'should be removed',
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined()
  })
})

describe('resolveOpenQuestionSchema', () => {
  it('accepts valid resolution', () => {
    const result = resolveOpenQuestionSchema.safeParse({ resolution: 'Google + GitHub OAuth' })
    expect(result.success).toBe(true)
    expect(result.data?.resolution).toBe('Google + GitHub OAuth')
  })

  it('rejects empty resolution', () => {
    expect(resolveOpenQuestionSchema.safeParse({ resolution: '' }).success).toBe(false)
  })

  it('rejects whitespace-only resolution', () => {
    expect(resolveOpenQuestionSchema.safeParse({ resolution: '   ' }).success).toBe(false)
  })

  it('trims whitespace from resolution', () => {
    const result = resolveOpenQuestionSchema.safeParse({ resolution: '  Google OAuth  ' })
    expect(result.success).toBe(true)
    expect(result.data?.resolution).toBe('Google OAuth')
  })

  it('rejects resolution longer than 1000 characters', () => {
    const result = resolveOpenQuestionSchema.safeParse({ resolution: 'a'.repeat(1001) })
    expect(result.success).toBe(false)
  })
})
