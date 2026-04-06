// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type {
  Project,
  CreateProjectInput,
  Position,
  Module,
  CreateModuleInput,
} from '@/types/graph'

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

describe('Position type', () => {
  it('has x and y number coordinates', () => {
    const pos: Position = { x: 100, y: 250 }
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(250)
  })

  it('accepts zero and negative values', () => {
    const pos: Position = { x: 0, y: -50 }
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(-50)
  })
})

describe('Module type', () => {
  const validModule: Module = {
    id: 'mod_123',
    project_id: 'proj_456',
    name: 'Auth Module',
    description: null,
    position: { x: 100, y: 200 },
    color: '#3B82F6',
    entry_points: ['login', 'register'],
    exit_points: ['authenticated', 'error'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('has all required fields', () => {
    expect(validModule).toHaveProperty('id')
    expect(validModule).toHaveProperty('project_id')
    expect(validModule).toHaveProperty('name')
    expect(validModule).toHaveProperty('description')
    expect(validModule).toHaveProperty('position')
    expect(validModule).toHaveProperty('color')
    expect(validModule).toHaveProperty('entry_points')
    expect(validModule).toHaveProperty('exit_points')
    expect(validModule).toHaveProperty('created_at')
    expect(validModule).toHaveProperty('updated_at')
  })

  it('description is nullable', () => {
    const withNull: Module = { ...validModule, description: null }
    const withString: Module = { ...validModule, description: 'Handles auth flows' }
    expect(withNull.description).toBeNull()
    expect(withString.description).toBe('Handles auth flows')
  })

  it('position has x and y coordinates', () => {
    expect(validModule.position.x).toBe(100)
    expect(validModule.position.y).toBe(200)
  })

  it('entry_points and exit_points are string arrays', () => {
    expect(Array.isArray(validModule.entry_points)).toBe(true)
    expect(validModule.entry_points).toHaveLength(2)
    expect(Array.isArray(validModule.exit_points)).toBe(true)
    expect(validModule.exit_points).toHaveLength(2)
  })

  it('supports empty entry and exit points', () => {
    const emptyPoints: Module = {
      ...validModule,
      entry_points: [],
      exit_points: [],
    }
    expect(emptyPoints.entry_points).toHaveLength(0)
    expect(emptyPoints.exit_points).toHaveLength(0)
  })
})

describe('CreateModuleInput', () => {
  it('omits server-generated fields', () => {
    const input: CreateModuleInput = {
      project_id: 'proj_456',
      name: 'Auth Module',
      description: null,
      position: { x: 100, y: 200 },
      color: '#3B82F6',
      entry_points: ['login'],
      exit_points: ['authenticated'],
    }
    expect(input).toHaveProperty('project_id')
    expect(input).toHaveProperty('name')
    expect(input).toHaveProperty('position')
    expect(input).toHaveProperty('color')
    expect(input).toHaveProperty('entry_points')
    expect(input).toHaveProperty('exit_points')
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
    expect(input).not.toHaveProperty('updated_at')
  })
})
