// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { addOpenQuestionTool, resolveOpenQuestionTool } from '@/lib/services/llm-tools'

describe('add_open_question tool definition', () => {
  it('has the correct name', () => {
    expect(addOpenQuestionTool.name).toBe('add_open_question')
  })

  it('has correct required params', () => {
    expect(addOpenQuestionTool.input_schema.required).toEqual(['moduleId', 'section', 'question'])
  })

  it('includes optional relatedNodeId', () => {
    const props = addOpenQuestionTool.input_schema.properties as Record<string, { type: string }>
    expect(props.relatedNodeId).toBeDefined()
    expect(props.relatedNodeId.type).toBe('string')
  })

  it('has a description', () => {
    expect(addOpenQuestionTool.description).toBeTruthy()
  })
})

describe('resolve_open_question tool definition', () => {
  it('has the correct name', () => {
    expect(resolveOpenQuestionTool.name).toBe('resolve_open_question')
  })

  it('has correct required params', () => {
    expect(resolveOpenQuestionTool.input_schema.required).toEqual(['questionId', 'resolution'])
  })

  it('has a description', () => {
    expect(resolveOpenQuestionTool.description).toBeTruthy()
  })
})
