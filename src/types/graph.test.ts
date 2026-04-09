// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type {
  Project,
  CreateProjectInput,
  Position,
  Module,
  CreateModuleInput,
  FlowNodeType,
  FlowNode,
  CreateFlowNodeInput,
  ModuleConnection,
  CreateModuleConnectionInput,
  FlowEdge,
  CreateFlowEdgeInput,
} from '@/types/graph'

describe('Project type', () => {
  const validProject: Project = {
    id: 'proj_123',
    user_id: 'user_456',
    name: 'Test Project',
    description: null,
    mode: 'architecture',
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
      mode: 'scope',
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
    domain: null,
    name: 'Auth Module',
    description: null,
    prd_content: '',
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
    expect(validModule).toHaveProperty('domain')
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

describe('FlowNodeType', () => {
  it('accepts all valid discriminated node types', () => {
    const types: FlowNodeType[] = [
      'decision',
      'process',
      'entry',
      'exit',
      'start',
      'end',
      'question',
    ]
    expect(types).toHaveLength(7)
    expect(types).toContain('decision')
    expect(types).toContain('process')
    expect(types).toContain('entry')
    expect(types).toContain('exit')
    expect(types).toContain('start')
    expect(types).toContain('end')
    expect(types).toContain('question')
  })
})

describe('FlowNode type', () => {
  const validNode: FlowNode = {
    id: 'node_001',
    module_id: 'mod_123',
    node_type: 'decision',
    label: 'Is authenticated?',
    pseudocode: 'if user.token is valid then proceed',
    position: { x: 200, y: 300 },
    color: '#EF4444',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('has all required fields', () => {
    expect(validNode).toHaveProperty('id')
    expect(validNode).toHaveProperty('module_id')
    expect(validNode).toHaveProperty('node_type')
    expect(validNode).toHaveProperty('label')
    expect(validNode).toHaveProperty('pseudocode')
    expect(validNode).toHaveProperty('position')
    expect(validNode).toHaveProperty('color')
    expect(validNode).toHaveProperty('created_at')
    expect(validNode).toHaveProperty('updated_at')
  })

  it('node_type accepts each discriminated value', () => {
    const decision: FlowNode = { ...validNode, node_type: 'decision' }
    const process: FlowNode = { ...validNode, node_type: 'process' }
    const entry: FlowNode = { ...validNode, node_type: 'entry' }
    const exit: FlowNode = { ...validNode, node_type: 'exit' }
    const start: FlowNode = { ...validNode, node_type: 'start' }
    const end: FlowNode = { ...validNode, node_type: 'end' }
    expect(decision.node_type).toBe('decision')
    expect(process.node_type).toBe('process')
    expect(entry.node_type).toBe('entry')
    expect(exit.node_type).toBe('exit')
    expect(start.node_type).toBe('start')
    expect(end.node_type).toBe('end')
  })

  it('position uses Position type with x and y', () => {
    expect(validNode.position.x).toBe(200)
    expect(validNode.position.y).toBe(300)
  })

  it('pseudocode holds the logic description', () => {
    expect(validNode.pseudocode).toBe('if user.token is valid then proceed')
  })
})

describe('CreateFlowNodeInput', () => {
  it('requires module_id, node_type, and label', () => {
    const input: CreateFlowNodeInput = {
      module_id: 'mod_123',
      node_type: 'process',
      label: 'Validate input',
    }
    expect(input).toHaveProperty('module_id')
    expect(input).toHaveProperty('node_type')
    expect(input).toHaveProperty('label')
  })

  it('omits server-generated fields', () => {
    const input: CreateFlowNodeInput = {
      module_id: 'mod_123',
      node_type: 'start',
      label: 'Begin',
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
    expect(input).not.toHaveProperty('updated_at')
  })
})

describe('ModuleConnection type', () => {
  const validConnection: ModuleConnection = {
    id: 'conn_001',
    project_id: 'proj_456',
    source_module_id: 'mod_100',
    target_module_id: 'mod_200',
    source_exit_point: 'authenticated',
    target_entry_point: 'login',
    created_at: '2024-01-01T00:00:00Z',
  }

  it('has all required fields', () => {
    expect(validConnection).toHaveProperty('id')
    expect(validConnection).toHaveProperty('project_id')
    expect(validConnection).toHaveProperty('source_module_id')
    expect(validConnection).toHaveProperty('target_module_id')
    expect(validConnection).toHaveProperty('source_exit_point')
    expect(validConnection).toHaveProperty('target_entry_point')
    expect(validConnection).toHaveProperty('created_at')
  })

  it('references two modules by id', () => {
    expect(validConnection.source_module_id).toBe('mod_100')
    expect(validConnection.target_module_id).toBe('mod_200')
    expect(validConnection.source_module_id).not.toBe(validConnection.target_module_id)
  })

  it('specifies which exit/entry points are linked', () => {
    expect(validConnection.source_exit_point).toBe('authenticated')
    expect(validConnection.target_entry_point).toBe('login')
  })
})

describe('CreateModuleConnectionInput', () => {
  it('omits server-generated fields', () => {
    const input: CreateModuleConnectionInput = {
      project_id: 'proj_456',
      source_module_id: 'mod_100',
      target_module_id: 'mod_200',
      source_exit_point: 'success',
      target_entry_point: 'start',
    }
    expect(input).toHaveProperty('project_id')
    expect(input).toHaveProperty('source_module_id')
    expect(input).toHaveProperty('target_module_id')
    expect(input).toHaveProperty('source_exit_point')
    expect(input).toHaveProperty('target_entry_point')
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
  })
})

describe('FlowEdge type', () => {
  const validEdge: FlowEdge = {
    id: 'edge_001',
    module_id: 'mod_123',
    source_node_id: 'node_001',
    target_node_id: 'node_002',
    label: 'Yes',
    condition: 'user.isAuthenticated === true',
    created_at: '2024-01-01T00:00:00Z',
  }

  it('has all required fields', () => {
    expect(validEdge).toHaveProperty('id')
    expect(validEdge).toHaveProperty('module_id')
    expect(validEdge).toHaveProperty('source_node_id')
    expect(validEdge).toHaveProperty('target_node_id')
    expect(validEdge).toHaveProperty('label')
    expect(validEdge).toHaveProperty('condition')
    expect(validEdge).toHaveProperty('created_at')
  })

  it('label is nullable', () => {
    const withNull: FlowEdge = { ...validEdge, label: null }
    const withString: FlowEdge = { ...validEdge, label: 'Yes' }
    expect(withNull.label).toBeNull()
    expect(withString.label).toBe('Yes')
  })

  it('condition is nullable', () => {
    const withNull: FlowEdge = { ...validEdge, condition: null }
    const withString: FlowEdge = { ...validEdge, condition: 'x > 0' }
    expect(withNull.condition).toBeNull()
    expect(withString.condition).toBe('x > 0')
  })

  it('references two nodes by id', () => {
    expect(validEdge.source_node_id).toBe('node_001')
    expect(validEdge.target_node_id).toBe('node_002')
    expect(validEdge.source_node_id).not.toBe(validEdge.target_node_id)
  })
})

describe('CreateFlowEdgeInput', () => {
  it('requires module_id, source_node_id, and target_node_id', () => {
    const input: CreateFlowEdgeInput = {
      module_id: 'mod_123',
      source_node_id: 'node_001',
      target_node_id: 'node_002',
    }
    expect(input).toHaveProperty('module_id')
    expect(input).toHaveProperty('source_node_id')
    expect(input).toHaveProperty('target_node_id')
  })

  it('label and condition are optional', () => {
    const minimal: CreateFlowEdgeInput = {
      module_id: 'mod_123',
      source_node_id: 'node_001',
      target_node_id: 'node_002',
    }
    const withOptionals: CreateFlowEdgeInput = {
      module_id: 'mod_123',
      source_node_id: 'node_001',
      target_node_id: 'node_002',
      label: 'Fallback',
      condition: 'else',
    }
    expect(minimal).not.toHaveProperty('label')
    expect(minimal).not.toHaveProperty('condition')
    expect(withOptionals.label).toBe('Fallback')
    expect(withOptionals.condition).toBe('else')
  })

  it('omits server-generated fields', () => {
    const input: CreateFlowEdgeInput = {
      module_id: 'mod_123',
      source_node_id: 'node_001',
      target_node_id: 'node_002',
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
  })
})
