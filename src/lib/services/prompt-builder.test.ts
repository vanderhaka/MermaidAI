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

    it('instructs AI to ask clarifying questions about the project', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      // The prompt should instruct the AI to ask discovery/clarifying questions
      expect(prompt.toLowerCase()).toMatch(/clarif|discover|question/)
    })

    it('includes the JSON schema for graph operations', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      // Must include the operation types so the AI knows the available operations
      expect(prompt).toContain('create_module')
      expect(prompt).toContain('create_node')
      expect(prompt).toContain('create_edge')
      expect(prompt).toContain('connect_modules')
      expect(prompt).toContain('update_module')
      expect(prompt).toContain('delete_module')
      expect(prompt).toContain('update_node')
      expect(prompt).toContain('delete_node')
      expect(prompt).toContain('update_edge')
      expect(prompt).toContain('delete_edge')
    })

    it('instructs AI to wrap operations in <operations> delimiters', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt).toContain('<operations>')
      expect(prompt).toContain('</operations>')
    })

    it('instructs AI to include file path comments in pseudocode', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      // Must reference the // file: <path> pattern for file tree derivation
      expect(prompt).toContain('// file:')
    })

    it('works with a different project name', () => {
      const ctx: PromptContext = { projectName: 'E-Commerce Platform' }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('E-Commerce Platform')
      expect(prompt).not.toContain('TaskFlow')
    })

    it('includes all operation payload fields in the schema', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      // Key payload fields that the AI needs to know about
      expect(prompt).toContain('moduleId')
      expect(prompt).toContain('nodeId')
      expect(prompt).toContain('edgeId')
      expect(prompt).toContain('sourceNodeId')
      expect(prompt).toContain('targetNodeId')
      expect(prompt).toContain('pseudocode')
      expect(prompt).toContain('label')
      expect(prompt).toContain('nodeType')
    })

    it('references the file tree sidebar so the AI understands the purpose of file paths', () => {
      const prompt = buildSystemPrompt(mode, baseContext)
      expect(prompt.toLowerCase()).toMatch(/file.?tree/)
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

    it('describes module-level operations (create/update/delete module, connect_modules)', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('create_module')
      expect(prompt).toContain('update_module')
      expect(prompt).toContain('delete_module')
      expect(prompt).toContain('connect_modules')
    })

    it('does NOT include node-level operations', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).not.toContain('create_node')
      expect(prompt).not.toContain('update_node')
      expect(prompt).not.toContain('delete_node')
      expect(prompt).not.toContain('create_edge')
      expect(prompt).not.toContain('update_edge')
      expect(prompt).not.toContain('delete_edge')
    })

    it('includes file path instruction for pseudocode', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('// file:')
    })

    it('includes operation delimiters', () => {
      const prompt = buildSystemPrompt(mode, contextWithModules)
      expect(prompt).toContain('<operations>')
      expect(prompt).toContain('</operations>')
    })

    it('works with empty modules array', () => {
      const ctx: PromptContext = { projectName: 'EmptyApp', modules: [] }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('EmptyApp')
      expect(prompt).toContain('create_module')
    })

    it('works with undefined modules', () => {
      const ctx: PromptContext = { projectName: 'NewApp' }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('NewApp')
      expect(prompt).toContain('create_module')
    })
  })

  describe('module_detail mode', () => {
    const mode: PromptMode = 'module_detail'

    const currentModule = {
      id: 'mod-1',
      project_id: 'proj-1',
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

    it('includes node-level operations', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('create_node')
      expect(prompt).toContain('update_node')
      expect(prompt).toContain('delete_node')
      expect(prompt).toContain('create_edge')
      expect(prompt).toContain('update_edge')
      expect(prompt).toContain('delete_edge')
    })

    it('does NOT include module-level create/delete operations', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).not.toContain('create_module')
      expect(prompt).not.toContain('delete_module')
      expect(prompt).not.toContain('connect_modules')
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
    })

    it('includes file path instruction for pseudocode', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('// file:')
    })

    it('includes operation delimiters', () => {
      const prompt = buildSystemPrompt(mode, detailContext)
      expect(prompt).toContain('<operations>')
      expect(prompt).toContain('</operations>')
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
      expect(prompt).toContain('create_node')
    })

    it('works with undefined nodes and edges', () => {
      const ctx: PromptContext = {
        projectName: 'TaskFlow',
        currentModule,
      }
      const prompt = buildSystemPrompt(mode, ctx)
      expect(prompt).toContain('Auth')
      expect(prompt).toContain('create_node')
    })
  })
})
