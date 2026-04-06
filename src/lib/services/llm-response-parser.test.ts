// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseLLMResponse } from '@/lib/services/llm-response-parser'
import type { GraphOperation } from '@/types/chat'

describe('parseLLMResponse', () => {
  it('returns empty message and empty operations for empty string', () => {
    const result = parseLLMResponse('')
    expect(result).toEqual({ message: '', operations: [] })
  })

  it('returns text as message when no operations block exists', () => {
    const result = parseLLMResponse('Here is your flowchart explanation.')
    expect(result).toEqual({
      message: 'Here is your flowchart explanation.',
      operations: [],
    })
  })

  it('extracts text outside operations tags as the message', () => {
    const raw = `I'll create the modules for you.
<operations>
[{"type":"create_module","payload":{"name":"Auth"}}]
</operations>
Let me know if you need changes.`

    const result = parseLLMResponse(raw)
    expect(result.message).toBe(
      "I'll create the modules for you.\n\nLet me know if you need changes.",
    )
  })

  it('parses valid JSON inside operations tags into GraphOperation[]', () => {
    const raw = `Creating modules.
<operations>
[{"type":"create_module","payload":{"name":"Auth","description":"Handles login"}},{"type":"create_module","payload":{"name":"Dashboard"}}]
</operations>`

    const result = parseLLMResponse(raw)
    expect(result.operations).toHaveLength(2)
    expect(result.operations[0]).toEqual({
      type: 'create_module',
      payload: { name: 'Auth', description: 'Handles login' },
    })
    expect(result.operations[1]).toEqual({
      type: 'create_module',
      payload: { name: 'Dashboard' },
    })
  })

  it('returns empty array for malformed JSON inside operations tags', () => {
    const raw = `Here's the update.
<operations>
{not valid json!!!
</operations>`

    const result = parseLLMResponse(raw)
    expect(result.operations).toEqual([])
    expect(result.message).toBe("Here's the update.")
  })

  it('filters out unknown operation types', () => {
    const raw = `<operations>
[{"type":"create_module","payload":{"name":"Auth"}},{"type":"explode_universe","payload":{}},{"type":"delete_node","payload":{"nodeId":"n1"}}]
</operations>`

    const result = parseLLMResponse(raw)
    expect(result.operations).toHaveLength(2)
    expect(result.operations[0].type).toBe('create_module')
    expect(result.operations[1].type).toBe('delete_node')
  })

  it('handles all valid GraphOperation types', () => {
    const ops: GraphOperation[] = [
      { type: 'create_module', payload: { name: 'M1' } },
      { type: 'update_module', payload: { moduleId: 'm1', name: 'M1v2' } },
      { type: 'delete_module', payload: { moduleId: 'm1' } },
      {
        type: 'create_node',
        payload: { moduleId: 'm1', label: 'Start', nodeType: 'start' },
      },
      { type: 'update_node', payload: { nodeId: 'n1', label: 'Updated' } },
      { type: 'delete_node', payload: { nodeId: 'n1' } },
      {
        type: 'create_edge',
        payload: {
          moduleId: 'm1',
          sourceNodeId: 'n1',
          targetNodeId: 'n2',
        },
      },
      { type: 'update_edge', payload: { edgeId: 'e1', label: 'yes' } },
      { type: 'delete_edge', payload: { edgeId: 'e1' } },
      {
        type: 'connect_modules',
        payload: {
          sourceModuleId: 'm1',
          targetModuleId: 'm2',
          sourceExitPoint: 'exit1',
          targetEntryPoint: 'entry1',
        },
      },
    ]
    const raw = `All operations.\n<operations>\n${JSON.stringify(ops)}\n</operations>`

    const result = parseLLMResponse(raw)
    expect(result.operations).toHaveLength(10)
    expect(result.operations).toEqual(ops)
  })

  it('trims whitespace from the extracted message', () => {
    const raw = `  Hello!
<operations>
[{"type":"create_module","payload":{"name":"Test"}}]
</operations>
  Goodbye!  `

    const result = parseLLMResponse(raw)
    expect(result.message).toBe('Hello!\n\nGoodbye!')
  })

  it('handles operations block with no surrounding text', () => {
    const raw = `<operations>
[{"type":"delete_module","payload":{"moduleId":"m1"}}]
</operations>`

    const result = parseLLMResponse(raw)
    expect(result.message).toBe('')
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]).toEqual({
      type: 'delete_module',
      payload: { moduleId: 'm1' },
    })
  })

  it('handles operations block with empty array', () => {
    const raw = `No changes needed.
<operations>
[]
</operations>`

    const result = parseLLMResponse(raw)
    expect(result.message).toBe('No changes needed.')
    expect(result.operations).toEqual([])
  })

  it('handles non-array JSON inside operations tags gracefully', () => {
    const raw = `<operations>
{"type":"create_module","payload":{"name":"Auth"}}
</operations>`

    const result = parseLLMResponse(raw)
    expect(result.operations).toEqual([])
  })
})
