// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FlowNode } from '@/types/graph'
import type { FileTreeNode } from '@/types/file-tree'

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'n1',
    module_id: 'm1',
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

const emptyRoot: FileTreeNode = {
  name: 'root',
  path: '',
  type: 'folder',
  children: [],
  linkedNodeIds: [],
}

const mockDeriveFileTree = vi.fn<(nodes: FlowNode[]) => FileTreeNode>(() => emptyRoot)

vi.mock('@/lib/services/file-tree', () => ({
  deriveFileTree: (...args: Parameters<typeof mockDeriveFileTree>) => mockDeriveFileTree(...args),
}))

// Use zustand's real store so we can test reactivity via act()
// We import after mocks are set up
const { useGraphStore } = await import('@/store/graph-store')
const { useFileTree } = await import('@/hooks/useFileTree')

describe('useFileTree', () => {
  beforeEach(() => {
    useGraphStore.getState().reset()
    mockDeriveFileTree.mockClear()
    mockDeriveFileTree.mockReturnValue(emptyRoot)
  })

  it('returns empty root when store has no nodes', () => {
    const { result } = renderHook(() => useFileTree())

    expect(result.current).toEqual(emptyRoot)
    expect(mockDeriveFileTree).toHaveBeenCalledWith([])
  })

  it('returns derived file tree from store nodes', () => {
    const nodes = [
      makeNode({ id: 'n1', pseudocode: '// file: src/lib/auth.ts' }),
      makeNode({ id: 'n2', pseudocode: '// file: src/types/user.ts' }),
    ]
    useGraphStore.getState().setNodes(nodes)

    const derivedTree: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'folder',
      children: [
        {
          name: 'src',
          path: 'src',
          type: 'folder',
          children: [
            {
              name: 'lib',
              path: 'src/lib',
              type: 'folder',
              children: [
                { name: 'auth.ts', path: 'src/lib/auth.ts', type: 'file', linkedNodeIds: ['n1'] },
              ],
            },
            {
              name: 'types',
              path: 'src/types',
              type: 'folder',
              children: [
                {
                  name: 'user.ts',
                  path: 'src/types/user.ts',
                  type: 'file',
                  linkedNodeIds: ['n2'],
                },
              ],
            },
          ],
        },
      ],
      linkedNodeIds: [],
    }
    mockDeriveFileTree.mockReturnValue(derivedTree)

    const { result } = renderHook(() => useFileTree())

    expect(mockDeriveFileTree).toHaveBeenCalledWith(nodes)
    expect(result.current).toEqual(derivedTree)
  })

  it('reactively updates when nodes change in the store', () => {
    const { result } = renderHook(() => useFileTree())

    expect(result.current).toEqual(emptyRoot)

    const newNode = makeNode({ id: 'n1', pseudocode: '// file: src/index.ts' })
    const updatedTree: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'folder',
      children: [
        {
          name: 'src',
          path: 'src',
          type: 'folder',
          children: [
            { name: 'index.ts', path: 'src/index.ts', type: 'file', linkedNodeIds: ['n1'] },
          ],
        },
      ],
      linkedNodeIds: [],
    }
    mockDeriveFileTree.mockReturnValue(updatedTree)

    act(() => {
      useGraphStore.getState().setNodes([newNode])
    })

    expect(result.current).toEqual(updatedTree)
    expect(mockDeriveFileTree).toHaveBeenCalledWith([newNode])
  })

  it('does not re-derive when nodes reference is the same', () => {
    const nodes = [makeNode({ id: 'n1', pseudocode: '// file: src/app.ts' })]
    useGraphStore.getState().setNodes(nodes)

    const { result, rerender } = renderHook(() => useFileTree())

    const callCountAfterMount = mockDeriveFileTree.mock.calls.length

    rerender()

    // Should NOT have called deriveFileTree again — memoized
    expect(mockDeriveFileTree.mock.calls.length).toBe(callCountAfterMount)
    expect(result.current).toBeDefined()
  })
})
