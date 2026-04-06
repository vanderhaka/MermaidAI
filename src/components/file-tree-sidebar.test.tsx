// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FileTreeSidebar from '@/components/file-tree-sidebar'
import type { FileTreeNode } from '@/types/file-tree'

const mockRoot: FileTreeNode = {
  name: 'root',
  path: '/',
  type: 'folder',
  children: [{ name: 'index.ts', path: '/index.ts', type: 'file', linkedNodeIds: ['n1'] }],
}

vi.mock('@/hooks/useFileTree', () => ({
  useFileTree: vi.fn(() => mockRoot),
}))

vi.mock('@/components/file-tree/file-tree', () => ({
  default: vi.fn(
    ({
      root,
      onFileSelect,
      highlightedPaths,
    }: {
      root: FileTreeNode
      onFileSelect?: (ids: string[]) => void
      highlightedPaths?: string[]
    }) => (
      <div
        data-testid="file-tree"
        data-root={root.name}
        data-highlighted={JSON.stringify(highlightedPaths ?? [])}
        onClick={() => onFileSelect?.(['n1'])}
      />
    ),
  ),
}))

describe('FileTreeSidebar', () => {
  it('renders Files heading', () => {
    render(<FileTreeSidebar />)
    expect(screen.getByRole('heading', { name: /files/i })).toBeDefined()
  })

  it('renders FileTree with root from useFileTree', () => {
    render(<FileTreeSidebar />)
    const tree = screen.getByTestId('file-tree')
    expect(tree.getAttribute('data-root')).toBe('root')
  })

  it('passes onFileSelect through to FileTree', () => {
    const handler = vi.fn()
    render(<FileTreeSidebar onFileSelect={handler} />)
    screen.getByTestId('file-tree').click()
    expect(handler).toHaveBeenCalledWith(['n1'])
  })

  it('passes highlightedPaths through to FileTree', () => {
    render(<FileTreeSidebar highlightedPaths={['/index.ts']} />)
    const tree = screen.getByTestId('file-tree')
    expect(tree.getAttribute('data-highlighted')).toBe(JSON.stringify(['/index.ts']))
  })
})
