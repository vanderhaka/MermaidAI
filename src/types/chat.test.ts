// @vitest-environment node
import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  ChatMessage,
  ChatRole,
  GraphOperation,
  GraphOperationType,
  CreateModuleOperation,
  UpdateModuleOperation,
  DeleteModuleOperation,
  CreateNodeOperation,
  UpdateNodeOperation,
  DeleteNodeOperation,
  CreateEdgeOperation,
  UpdateEdgeOperation,
  DeleteEdgeOperation,
  ConnectModulesOperation,
  ChatContext,
  ChatMode,
  CreateChatMessageInput,
} from '@/types/chat'

describe('ChatMessage type', () => {
  it('has all required fields', () => {
    const message: ChatMessage = {
      id: 'msg_001',
      role: 'user',
      content: 'Create a login module',
      operations: [],
      createdAt: '2026-04-06T00:00:00Z',
    }

    expect(message).toHaveProperty('id')
    expect(message).toHaveProperty('role')
    expect(message).toHaveProperty('content')
    expect(message).toHaveProperty('operations')
    expect(message).toHaveProperty('createdAt')
  })

  it('role is a union of user, assistant, system', () => {
    const userMsg: ChatMessage = {
      id: 'msg_001',
      role: 'user',
      content: 'Hello',
      operations: [],
      createdAt: '2026-04-06T00:00:00Z',
    }
    const assistantMsg: ChatMessage = {
      id: 'msg_002',
      role: 'assistant',
      content: 'Hi there',
      operations: [],
      createdAt: '2026-04-06T00:00:00Z',
    }
    const systemMsg: ChatMessage = {
      id: 'msg_003',
      role: 'system',
      content: 'System prompt',
      operations: [],
      createdAt: '2026-04-06T00:00:00Z',
    }

    expectTypeOf(userMsg.role).toEqualTypeOf<ChatRole>()
    expectTypeOf(assistantMsg.role).toEqualTypeOf<ChatRole>()
    expectTypeOf(systemMsg.role).toEqualTypeOf<ChatRole>()
  })

  it('operations accepts GraphOperation array', () => {
    const message: ChatMessage = {
      id: 'msg_001',
      role: 'assistant',
      content: 'Creating module',
      operations: [
        {
          type: 'create_module',
          payload: { name: 'Auth', description: 'Authentication module' },
        },
      ],
      createdAt: '2026-04-06T00:00:00Z',
    }

    expect(message.operations).toHaveLength(1)
    expect(message.operations[0].type).toBe('create_module')
  })
})

describe('GraphOperation discriminated union', () => {
  it('covers all 10 operation types', () => {
    expectTypeOf<GraphOperationType>().toEqualTypeOf<
      | 'create_module'
      | 'update_module'
      | 'delete_module'
      | 'create_node'
      | 'update_node'
      | 'delete_node'
      | 'create_edge'
      | 'update_edge'
      | 'delete_edge'
      | 'connect_modules'
    >()
  })

  it('create_module has name and optional description', () => {
    const op: CreateModuleOperation = {
      type: 'create_module',
      payload: { name: 'Auth', description: 'Handles login' },
    }
    expect(op.type).toBe('create_module')
    expect(op.payload.name).toBe('Auth')

    const opNoDesc: CreateModuleOperation = {
      type: 'create_module',
      payload: { name: 'Auth' },
    }
    expect(opNoDesc.payload.description).toBeUndefined()
  })

  it('update_module requires moduleId and partial fields', () => {
    const op: UpdateModuleOperation = {
      type: 'update_module',
      payload: { moduleId: 'mod_1', name: 'Auth v2' },
    }
    expect(op.type).toBe('update_module')
    expect(op.payload.moduleId).toBe('mod_1')
  })

  it('delete_module requires moduleId', () => {
    const op: DeleteModuleOperation = {
      type: 'delete_module',
      payload: { moduleId: 'mod_1' },
    }
    expect(op.type).toBe('delete_module')
    expect(op.payload.moduleId).toBe('mod_1')
  })

  it('create_node has moduleId, label, nodeType', () => {
    const op: CreateNodeOperation = {
      type: 'create_node',
      payload: { moduleId: 'mod_1', label: 'Check Auth', nodeType: 'decision' },
    }
    expect(op.type).toBe('create_node')
    expect(op.payload.moduleId).toBe('mod_1')
    expect(op.payload.label).toBe('Check Auth')
    expect(op.payload.nodeType).toBe('decision')
  })

  it('update_node requires nodeId and partial fields', () => {
    const op: UpdateNodeOperation = {
      type: 'update_node',
      payload: { nodeId: 'node_1', label: 'Updated Label' },
    }
    expect(op.type).toBe('update_node')
    expect(op.payload.nodeId).toBe('node_1')
  })

  it('delete_node requires nodeId', () => {
    const op: DeleteNodeOperation = {
      type: 'delete_node',
      payload: { nodeId: 'node_1' },
    }
    expect(op.type).toBe('delete_node')
    expect(op.payload.nodeId).toBe('node_1')
  })

  it('create_edge has moduleId, sourceNodeId, targetNodeId', () => {
    const op: CreateEdgeOperation = {
      type: 'create_edge',
      payload: { moduleId: 'mod_1', sourceNodeId: 'node_1', targetNodeId: 'node_2' },
    }
    expect(op.type).toBe('create_edge')
    expect(op.payload.sourceNodeId).toBe('node_1')
    expect(op.payload.targetNodeId).toBe('node_2')
  })

  it('update_edge requires edgeId and partial fields', () => {
    const op: UpdateEdgeOperation = {
      type: 'update_edge',
      payload: { edgeId: 'edge_1', label: 'Yes' },
    }
    expect(op.type).toBe('update_edge')
    expect(op.payload.edgeId).toBe('edge_1')
  })

  it('delete_edge requires edgeId', () => {
    const op: DeleteEdgeOperation = {
      type: 'delete_edge',
      payload: { edgeId: 'edge_1' },
    }
    expect(op.type).toBe('delete_edge')
    expect(op.payload.edgeId).toBe('edge_1')
  })

  it('connect_modules has sourceModuleId, targetModuleId, exit/entry points', () => {
    const op: ConnectModulesOperation = {
      type: 'connect_modules',
      payload: {
        sourceModuleId: 'mod_1',
        targetModuleId: 'mod_2',
        sourceExitPoint: 'success',
        targetEntryPoint: 'default',
      },
    }
    expect(op.type).toBe('connect_modules')
    expect(op.payload.sourceModuleId).toBe('mod_1')
    expect(op.payload.targetModuleId).toBe('mod_2')
  })

  it('discriminates correctly via type field', () => {
    const op: GraphOperation = {
      type: 'create_module',
      payload: { name: 'Auth' },
    }

    if (op.type === 'create_module') {
      expectTypeOf(op.payload).toHaveProperty('name')
    }
  })
})

describe('ChatContext type', () => {
  it('has all required fields', () => {
    const ctx: ChatContext = {
      projectId: 'proj_1',
      projectName: 'My Project',
      activeModuleId: null,
      mode: 'discovery',
      modules: [],
    }

    expect(ctx).toHaveProperty('projectId')
    expect(ctx).toHaveProperty('projectName')
    expect(ctx).toHaveProperty('activeModuleId')
    expect(ctx).toHaveProperty('mode')
    expect(ctx).toHaveProperty('modules')
  })

  it('activeModuleId is nullable', () => {
    const ctxNull: ChatContext = {
      projectId: 'proj_1',
      projectName: 'My Project',
      activeModuleId: null,
      mode: 'discovery',
      modules: [],
    }
    const ctxWithId: ChatContext = {
      projectId: 'proj_1',
      projectName: 'My Project',
      activeModuleId: 'mod_1',
      mode: 'module_detail',
      modules: [],
    }

    expect(ctxNull.activeModuleId).toBeNull()
    expect(ctxWithId.activeModuleId).toBe('mod_1')
  })

  it('mode is a union of discovery, module_map, module_detail', () => {
    expectTypeOf<ChatMode>().toEqualTypeOf<'discovery' | 'module_map' | 'module_detail'>()
  })

  it('modules is an array of module summaries', () => {
    const ctx: ChatContext = {
      projectId: 'proj_1',
      projectName: 'My Project',
      activeModuleId: null,
      mode: 'module_map',
      modules: [{ id: 'mod_1', name: 'Auth' }],
    }

    expect(ctx.modules).toHaveLength(1)
    expect(ctx.modules[0]).toEqual({ id: 'mod_1', name: 'Auth' })
  })
})

describe('CreateChatMessageInput type', () => {
  it('requires project_id, role, and content', () => {
    const input: CreateChatMessageInput = {
      project_id: 'proj_1',
      role: 'user',
      content: 'Build me a payments module',
    }

    expect(input).toHaveProperty('project_id')
    expect(input).toHaveProperty('role')
    expect(input).toHaveProperty('content')
  })

  it('does not require id or createdAt', () => {
    const input: CreateChatMessageInput = {
      project_id: 'proj_1',
      role: 'assistant',
      content: 'Sure, creating payments module now.',
    }

    expectTypeOf(input).not.toHaveProperty('id')
    expectTypeOf(input).not.toHaveProperty('createdAt')
  })
})
