// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { FILE_PATH_PATTERN } from '@/lib/services/file-tree'

describe('FILE_PATH_PATTERN', () => {
  it('matches a file path comment in pseudocode', () => {
    const pseudocode = '// file: src/lib/auth.ts\nfunction login() {}'
    const match = pseudocode.match(FILE_PATH_PATTERN)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('src/lib/auth.ts')
  })

  it('extracts multiple file paths from one block', () => {
    const pseudocode = '// file: src/lib/auth.ts\n// file: src/types/user.ts'
    const all = [...pseudocode.matchAll(new RegExp(FILE_PATH_PATTERN.source, 'gm'))]
    expect(all).toHaveLength(2)
    expect(all[0][1]).toBe('src/lib/auth.ts')
    expect(all[1][1]).toBe('src/types/user.ts')
  })

  it('handles extra whitespace around the path', () => {
    const pseudocode = '//  file:   src/components/Button.tsx  '
    const match = pseudocode.match(FILE_PATH_PATTERN)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('src/components/Button.tsx')
  })

  it('does not match lines without the file: prefix', () => {
    const pseudocode = '// this is a comment\nconst x = 1'
    const match = pseudocode.match(FILE_PATH_PATTERN)
    expect(match).toBeNull()
  })

  it('handles paths with dots and hyphens', () => {
    const pseudocode = '// file: src/lib/my-service.config.ts'
    const match = pseudocode.match(FILE_PATH_PATTERN)
    expect(match![1]).toBe('src/lib/my-service.config.ts')
  })
})
