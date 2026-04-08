// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/services/prompt-builder'
import type { PromptMode, PromptContext } from '@/lib/services/prompt-builder'

describe('buildSystemPrompt', () => {
  const baseContext: PromptContext = {
    projectName: 'TaskFlow',
  }

  describe('discovery mode', () => {
    const mode: PromptMode = 'discovery'

    it('returns a non-empty string', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toBeTruthy()
      expect(typeof prompt).toBe('string')
    })

    it('includes the project name for context', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('TaskFlow')
    })

    it('instructs AI to ask one question at a time', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('one question at a time')
    })

    it('instructs AI to confirm before using tools', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('confirm')
    })

    it('does not contain operations delimiters (tools handle operations now)', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).not.toContain('<operations>')
      expect(prompt).not.toContain('</operations>')
    })

    it('includes file path instruction for pseudocode', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('// file:')
    })

    it('works with a different project name', () => {
      const ctx: PromptContext = { projectName: 'E-Commerce Platform' }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('E-Commerce Platform')
      expect(prompt).not.toContain('TaskFlow')
    })
  })

  describe('module_map mode', () => {
    const mode: PromptMode = 'module_map'

    const contextWithModules: PromptContext = {
      projectName: 'TaskFlow',
      modules: [
        {
          id: 'mod-1',
          project_id: 'proj-1',
          domain: null,
          name: 'Auth',
          description: 'Handles user authentication',
          position: { x: 0, y: 0 },
          color: '#3b82f6',
          entry_points: ['login'],
          exit_points: ['session'],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'mod-2',
          project_id: 'proj-1',
          domain: null,
          name: 'Dashboard',
          description: null,
          position: { x: 200, y: 0 },
          color: '#10b981',
          entry_points: [],
          exit_points: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    }

    it('returns a non-empty string', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toBeTruthy()
      expect(typeof prompt).toBe('string')
    })

    it('includes the project name', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('TaskFlow')
    })

    it('includes existing module names from context', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('Auth')
      expect(prompt).toContain('Dashboard')
    })

    it('includes existing module descriptions from context', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('Handles user authentication')
    })

    it('includes module IDs so the AI can reference them in tool calls', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('mod-1')
      expect(prompt).toContain('mod-2')
    })

    it('does not contain operations delimiters', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).not.toContain('<operations>')
      expect(prompt).not.toContain('</operations>')
    })

    it('references tools for module operations', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt.toLowerCase()).toContain('tool')
    })

    it('includes file path instruction for pseudocode', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('// file:')
    })

    it('works with empty modules array', () => {
      const ctx: PromptContext = { projectName: 'EmptyApp', modules: [] }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('EmptyApp')
      expect(prompt).toContain('No modules exist yet')
    })

    it('works with undefined modules', () => {
      const ctx: PromptContext = { projectName: 'NewApp' }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('NewApp')
      expect(prompt).toContain('No modules exist yet')
    })
  })

  describe('module_detail mode', () => {
    const mode: PromptMode = 'module_detail'

    const currentModule = {
      id: 'mod-1',
      project_id: 'proj-1',
      domain: null,
      name: 'Auth',
      description: 'Handles user authentication',
      position: { x: 0, y: 0 },
      color: '#3b82f6',
      entry_points: ['login'],
      exit_points: ['session'],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const nodes = [
      {
        id: 'node-1',
        module_id: 'mod-1',
        node_type: 'process' as const,
        label: 'Validate Credentials',
        pseudocode: '// file: src/lib/services/auth.ts\nvalidate(email, password)',
        position: { x: 0, y: 0 },
        color: '#3b82f6',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'node-2',
        module_id: 'mod-1',
        node_type: 'decision' as const,
        label: 'Is Valid?',
        pseudocode: '',
        position: { x: 0, y: 100 },
        color: '#f59e0b',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]

    const edges = [
      {
        id: 'edge-1',
        module_id: 'mod-1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        label: null,
        condition: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]

    const detailContext: PromptContext = {
      projectName: 'TaskFlow',
      currentModule,
      nodes,
      edges,
    }

    it('returns a non-empty string', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toBeTruthy()
      expect(typeof prompt).toBe('string')
    })

    it('includes the project name', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('TaskFlow')
    })

    it('includes the current module name', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('Auth')
    })

    it('includes current module flow data — node labels', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('Validate Credentials')
      expect(prompt).toContain('Is Valid?')
    })

    it('includes current module flow data — node types', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('process')
      expect(prompt).toContain('decision')
    })

    it('includes current module flow data — edge connections', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('node-1')
      expect(prompt).toContain('node-2')
    })

    it('includes node type vocabulary', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('decision')
      expect(prompt).toContain('process')
      expect(prompt).toContain('entry')
      expect(prompt).toContain('exit')
      expect(prompt).toContain('start')
      expect(prompt).toContain('end')
      expect(prompt).toContain('question')
    })

    it('lists question as an available node type with description', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('**question**')
    })

    it('does not contain operations delimiters', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).not.toContain('<operations>')
      expect(prompt).not.toContain('</operations>')
    })

    it('references tools for node/edge operations', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt.toLowerCase()).toContain('tool')
    })

    it('includes file path instruction for pseudocode', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('// file:')
    })

    it('works with empty nodes and edges', () => {
      const ctx: PromptContext = {
        projectName: 'TaskFlow',
        currentModule,
        nodes: [],
        edges: [],
      }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('Auth')
      expect(prompt).toContain('No nodes exist yet')
    })

    it('works with undefined nodes and edges', () => {
      const ctx: PromptContext = {
        projectName: 'TaskFlow',
        currentModule,
      }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('Auth')
      expect(prompt).toContain('No nodes exist yet')
    })
  })

  describe('scope_build mode', () => {
    const mode: PromptMode = 'scope_build'

    it('returns a non-empty string', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toBeTruthy()
      expect(typeof prompt).toBe('string')
    })

    it('includes the project name', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('TaskFlow')
    })

    it('mentions scope mode', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('scope')
    })

    it('mentions open questions', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('open question')
    })

    it('instructs AI to ask exactly one follow-up question after building', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('always ask exactly one follow-up question')
    })

    it('instructs AI to keep follow-up questions domain-focused, not technical', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('domain')
    })

    it('references add_open_questions tool', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('add_open_questions')
    })

    it('references resolve_open_question tool', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('resolve_open_question')
    })

    it('includes open questions context when provided', () => {
      const prompt = buildSystemPrompt(mode, {
        ...baseContext,
        openQuestions: [
          {
            id: 'oq-1',
            section: 'Auth',
            question: 'OAuth or password?',
            status: 'open',
            resolution: null,
          },
        ],
      })
      expect(prompt).toContain('OAuth or password?')
      expect(prompt).toContain('Auth')
    })

    it('groups open questions by section', () => {
      const prompt = buildSystemPrompt(mode, {
        ...baseContext,
        openQuestions: [
          {
            id: 'oq-1',
            section: 'Auth',
            question: 'OAuth?',
            status: 'open',
            resolution: null,
          },
          {
            id: 'oq-2',
            section: 'Payments',
            question: 'Stripe or Square?',
            status: 'open',
            resolution: null,
          },
        ],
      })
      expect(prompt).toContain('### Auth')
      expect(prompt).toContain('### Payments')
    })

    it('shows resolved questions with resolution text', () => {
      const prompt = buildSystemPrompt(mode, {
        ...baseContext,
        openQuestions: [
          {
            id: 'oq-1',
            section: 'Auth',
            question: 'OAuth?',
            status: 'resolved',
            resolution: 'Google OAuth',
          },
        ],
      })
      expect(prompt).toContain('Google OAuth')
    })

    it('works with no open questions', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toBeTruthy()
      expect(prompt).not.toContain('undefined')
      expect(prompt).toContain('No open questions yet')
    })

    it('lists question as a node type', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('**question**')
    })

    it('instructs AI to assign section names automatically', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('section')
      expect(prompt.toLowerCase()).toContain('automatically')
    })

    it('includes module ID when currentModule is provided', () => {
      const prompt = buildSystemPrompt(mode, {
        ...baseContext,
        currentModule: {
          id: 'mod-scope-123',
          name: 'Scope',
          description: 'Scope module',
          domain: null,
          project_id: 'proj-1',
          position: { x: 0, y: 0 },
          color: '#3b82f6',
          entry_points: [],
          exit_points: [],
          created_at: '',
          updated_at: '',
        },
      })
      expect(prompt).toContain('mod-scope-123')
      expect(prompt).toContain('Never ask the user for a module ID')
    })

    it('instructs AI to never ask for module ID', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toContain('never ask the user for a module id')
    })
  })
})
