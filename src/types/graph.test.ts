// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { Project, CreateProjectInput } from '@/types/graph'

describe('Project type', () => {
  const validProject: Project = {
    id: 'proj_123',
    user_id: 'user_456',
    name: 'Test Project',
    description: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('has all required fields', () => {
    expect(validProject).toHaveProperty('id')
    expect(validProject).toHaveProperty('user_id')
    expect(validProject).toHaveProperty('name')
    expect(validProject).toHaveProperty('description')
    expect(validProject).toHaveProperty('created_at')
    expect(validProject).toHaveProperty('updated_at')
  })

  it('description is nullable', () => {
    const withNull: Project = { ...validProject, description: null }
    const withString: Project = { ...validProject, description: 'A description' }
    expect(withNull.description).toBeNull()
    expect(withString.description).toBe('A description')
  })

  it('CreateProjectInput omits server-generated fields', () => {
    const input: CreateProjectInput = {
      name: 'New Project',
      description: 'Optional description',
    }
    expect(input).toHaveProperty('name')
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('user_id')
    expect(input).not.toHaveProperty('created_at')
    expect(input).not.toHaveProperty('updated_at')
  })
})
