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
})
