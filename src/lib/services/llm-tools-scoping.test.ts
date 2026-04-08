// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { addOpenQuestionsTool, resolveOpenQuestionTool } from '@/lib/services/llm-tools'

describe('add_open_questions tool definition', () => {
  it('has the correct name', () => {
    expect(addOpenQuestionsTool.name).toBe('add_open_questions')
  })

  it('has correct required params', () => {
    expect(addOpenQuestionsTool.input_schema.required).toEqual(['moduleId', 'questions'])
  })

  it('has questions array with correct item schema', () => {
    const props = addOpenQuestionsTool.input_schema.properties as Record<
      string,
      Record<string, unknown>
    >
    expect(props.questions.type).toBe('array')

    const items = props.questions.items as Record<string, unknown>
    expect(items.type).toBe('object')
    expect(items.required).toEqual(['section', 'question'])

    const itemProps = items.properties as Record<string, { type: string }>
    expect(itemProps.section.type).toBe('string')
    expect(itemProps.question.type).toBe('string')
    expect(itemProps.relatedNodeId.type).toBe('string')
  })

  it('has a description', () => {
    expect(addOpenQuestionsTool.description).toBeTruthy()
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
