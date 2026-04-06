// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { FILE_PATH_PATTERN, deriveFileTree } from '@/lib/services/file-tree'
import type { FlowNode } from '@/types/graph'

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-1',
    module_id: 'mod-1',
    node_type: 'process',
    label: 'Test',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

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

describe('deriveFileTree', () => {
  it('returns an empty root when given no nodes', () => {
    const root = deriveFileTree([])
    expect(root).toEqual({
      name: 'root',
      path: '',
      type: 'folder',
      children: [],
      linkedNodeIds: [],
    })
  })

  it('returns an empty root when nodes have no pseudocode', () => {
    const root = deriveFileTree([makeNode({ pseudocode: '' })])
    expect(root).toEqual({
      name: 'root',
      path: '',
      type: 'folder',
      children: [],
      linkedNodeIds: [],
    })
  })

  it('builds a nested folder/file structure from a single node', () => {
    const node = makeNode({
      id: 'n1',
      pseudocode: '// file: src/lib/auth.ts\nfunction login() {}',
    })
    const root = deriveFileTree([node])

    expect(root.children).toHaveLength(1)
    const src = root.children![0]
    expect(src).toMatchObject({ name: 'src', path: 'src', type: 'folder' })

    const lib = src.children![0]
    expect(lib).toMatchObject({ name: 'lib', path: 'src/lib', type: 'folder' })

    const file = lib.children![0]
    expect(file).toMatchObject({
      name: 'auth.ts',
      path: 'src/lib/auth.ts',
      type: 'file',
      linkedNodeIds: ['n1'],
    })
  })

  it('merges shared folders from multiple nodes', () => {
    const nodes = [
      makeNode({
        id: 'n1',
        pseudocode: '// file: src/lib/auth.ts',
      }),
      makeNode({
        id: 'n2',
        pseudocode: '// file: src/lib/db.ts',
      }),
    ]
    const root = deriveFileTree(nodes)

    const src = root.children![0]
    expect(src.name).toBe('src')
    const lib = src.children![0]
    expect(lib.name).toBe('lib')
    expect(lib.children).toHaveLength(2)

    const fileNames = lib.children!.map((c) => c.name)
    expect(fileNames).toContain('auth.ts')
    expect(fileNames).toContain('db.ts')
  })

  it('merges linkedNodeIds for duplicate file paths', () => {
    const nodes = [
      makeNode({
        id: 'n1',
        pseudocode: '// file: src/lib/auth.ts',
      }),
      makeNode({
        id: 'n2',
        pseudocode: '// file: src/lib/auth.ts',
      }),
    ]
    const root = deriveFileTree(nodes)

    const src = root.children![0]
    const lib = src.children![0]
    expect(lib.children).toHaveLength(1)

    const file = lib.children![0]
    expect(file.linkedNodeIds).toEqual(['n1', 'n2'])
  })

  it('handles multiple file paths in a single node', () => {
    const node = makeNode({
      id: 'n1',
      pseudocode: '// file: src/lib/auth.ts\n// file: src/types/user.ts',
    })
    const root = deriveFileTree([node])

    const src = root.children![0]
    expect(src.children).toHaveLength(2)

    const folderNames = src.children!.map((c) => c.name).sort()
    expect(folderNames).toEqual(['lib', 'types'])
  })

  it('sorts folders before files, both alphabetically', () => {
    const node = makeNode({
      id: 'n1',
      pseudocode: [
        '// file: src/index.ts',
        '// file: src/components/Button.tsx',
        '// file: src/lib/utils.ts',
        '// file: src/app.ts',
      ].join('\n'),
    })
    const root = deriveFileTree([node])

    const src = root.children![0]
    const names = src.children!.map((c) => c.name)
    // folders first (alphabetically), then files (alphabetically)
    expect(names).toEqual(['components', 'lib', 'app.ts', 'index.ts'])
  })

  it('handles a file at the root level (no folders)', () => {
    const node = makeNode({
      id: 'n1',
      pseudocode: '// file: README.md',
    })
    const root = deriveFileTree([node])

    expect(root.children).toHaveLength(1)
    expect(root.children![0]).toMatchObject({
      name: 'README.md',
      path: 'README.md',
      type: 'file',
      linkedNodeIds: ['n1'],
    })
  })

  it('does not extract paths from pseudocode without file annotations', () => {
    const node = makeNode({
      id: 'n1',
      pseudocode: 'function doStuff() { return 42 }',
    })
    const root = deriveFileTree([node])
    expect(root.children).toEqual([])
  })
})
