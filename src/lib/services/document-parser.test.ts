// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

import {
  parseDocument,
  MAX_UPLOAD_BYTES,
  MAX_EXTRACTED_CHARS,
} from '@/lib/services/document-parser'

function makeFile(name: string, type: string, content: string): File {
  return new File([content], name, { type })
}

describe('parseDocument', () => {
  describe('text files', () => {
    it('parses a .txt file by extension', async () => {
      const file = makeFile('brief.txt', '', 'Build a checkout flow')
      const result = await parseDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.filename).toBe('brief.txt')
        expect(result.data.type).toBe('txt')
        expect(result.data.text).toBe('Build a checkout flow')
        expect(result.data.truncated).toBe(false)
      }
    })

    it('parses a .md file with heading', async () => {
      const file = makeFile('spec.md', 'text/markdown', '# Spec\n\nUser signs in with email.')
      const result = await parseDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('md')
        expect(result.data.text).toContain('# Spec')
      }
    })

    it('detects type by MIME when extension is missing', async () => {
      const file = makeFile('README', 'text/markdown', 'Hello')
      const result = await parseDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('md')
      }
    })

    it('normalizes CRLF line endings', async () => {
      const file = makeFile('notes.txt', 'text/plain', 'line one\r\nline two')
      const result = await parseDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.text).toBe('line one\nline two')
      }
    })
  })

  describe('validation errors', () => {
    it('rejects empty files', async () => {
      const file = makeFile('empty.txt', 'text/plain', '')
      const result = await parseDocument(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('empty')
      }
    })

    it('rejects whitespace-only files as empty', async () => {
      const file = makeFile('blank.txt', 'text/plain', '   \n\n  ')
      const result = await parseDocument(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('empty')
      }
    })

    it('rejects unsupported file types', async () => {
      const file = makeFile('image.png', 'image/png', 'fakepng')
      const result = await parseDocument(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('unsupported_type')
      }
    })

    it('rejects files over the size limit', async () => {
      // Build a File whose .size reports above the limit without allocating
      // the full buffer.
      const tiny = new Uint8Array(1)
      const file = new File([tiny], 'huge.pdf', { type: 'application/pdf' })
      Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 })

      const result = await parseDocument(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('too_large')
      }
    })
  })

  describe('truncation', () => {
    it('truncates text longer than the extraction cap', async () => {
      const longText = 'a'.repeat(MAX_EXTRACTED_CHARS + 500)
      const file = makeFile('long.txt', 'text/plain', longText)
      const result = await parseDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.truncated).toBe(true)
        expect(result.data.originalLength).toBe(MAX_EXTRACTED_CHARS + 500)
        expect(result.data.text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS + 200)
        expect(result.data.text).toContain('[Document truncated')
      }
    })

    it('does not truncate text at or below the cap', async () => {
      const text = 'a'.repeat(1000)
      const file = makeFile('short.txt', 'text/plain', text)
      const result = await parseDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.truncated).toBe(false)
        expect(result.data.text).toBe(text)
      }
    })
  })
})
