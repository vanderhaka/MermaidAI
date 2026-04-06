// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import FileTree from '@/components/file-tree/file-tree'
import type { FileTreeNode } from '@/types/file-tree'

const mockTree: FileTreeNode = {
  name: 'src',
  path: 'src',
  type: 'folder',
  children: [
    {
      name: 'components',
      path: 'src/components',
      type: 'folder',
      children: [
        {
          name: 'Button.tsx',
          path: 'src/components/Button.tsx',
          type: 'file',
          linkedNodeIds: ['node-1', 'node-2'],
        },
        {
          name: 'Input.tsx',
          path: 'src/components/Input.tsx',
          type: 'file',
          linkedNodeIds: ['node-3'],
        },
      ],
    },
    {
      name: 'index.ts',
      path: 'src/index.ts',
      type: 'file',
      linkedNodeIds: ['node-4'],
    },
  ],
}

const emptyTree: FileTreeNode = {
  name: 'root',
  path: '',
  type: 'folder',
  children: [],
}

describe('FileTree', () => {
  let onFileSelect: ReturnType<typeof vi.fn<(linkedNodeIds: string[]) => void>>

  beforeEach(() => {
    onFileSelect = vi.fn<(linkedNodeIds: string[]) => void>()
  })

  describe('rendering', () => {
    it('renders the root folder name', () => {
      render(<FileTree root={mockTree} />)
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    it('renders nested folder names', () => {
      render(<FileTree root={mockTree} />)
      expect(screen.getByText('components')).toBeInTheDocument()
    })

    it('renders file names', () => {
      render(<FileTree root={mockTree} />)
      expect(screen.getByText('Button.tsx')).toBeInTheDocument()
      expect(screen.getByText('Input.tsx')).toBeInTheDocument()
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  describe('folder collapse/expand', () => {
    it('collapses a folder when clicked', async () => {
      const user = userEvent.setup()
      render(<FileTree root={mockTree} />)

      const componentsFolder = screen.getByText('components')
      await user.click(componentsFolder)

      expect(screen.queryByText('Button.tsx')).not.toBeInTheDocument()
      expect(screen.queryByText('Input.tsx')).not.toBeInTheDocument()
    })

    it('expands a collapsed folder when clicked again', async () => {
      const user = userEvent.setup()
      render(<FileTree root={mockTree} />)

      const componentsFolder = screen.getByText('components')
      await user.click(componentsFolder)
      await user.click(componentsFolder)

      expect(screen.getByText('Button.tsx')).toBeInTheDocument()
      expect(screen.getByText('Input.tsx')).toBeInTheDocument()
    })

    it('does not collapse sibling folders when one is collapsed', async () => {
      const user = userEvent.setup()
      render(<FileTree root={mockTree} />)

      const componentsFolder = screen.getByText('components')
      await user.click(componentsFolder)

      // Root-level file should still be visible
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  describe('file selection', () => {
    it('calls onFileSelect with linkedNodeIds when a file is clicked', async () => {
      const user = userEvent.setup()
      render(<FileTree root={mockTree} onFileSelect={onFileSelect} />)

      await user.click(screen.getByText('Button.tsx'))

      expect(onFileSelect).toHaveBeenCalledOnce()
      expect(onFileSelect).toHaveBeenCalledWith(['node-1', 'node-2'])
    })

    it('calls onFileSelect with correct ids for different files', async () => {
      const user = userEvent.setup()
      render(<FileTree root={mockTree} onFileSelect={onFileSelect} />)

      await user.click(screen.getByText('Input.tsx'))

      expect(onFileSelect).toHaveBeenCalledWith(['node-3'])
    })

    it('does not call onFileSelect when a folder is clicked', async () => {
      const user = userEvent.setup()
      render(<FileTree root={mockTree} onFileSelect={onFileSelect} />)

      await user.click(screen.getByText('components'))

      expect(onFileSelect).not.toHaveBeenCalled()
    })
  })

  describe('highlighted paths', () => {
    it('applies highlight styling to matching file paths', () => {
      render(<FileTree root={mockTree} highlightedPaths={['src/components/Button.tsx']} />)

      const button = screen.getByText('Button.tsx')
      expect(button.closest('[data-highlighted="true"]')).toBeInTheDocument()
    })

    it('does not highlight non-matching files', () => {
      render(<FileTree root={mockTree} highlightedPaths={['src/components/Button.tsx']} />)

      const input = screen.getByText('Input.tsx')
      expect(input.closest('[data-highlighted="true"]')).toBeNull()
    })
  })

  describe('empty state', () => {
    it('shows an empty state message when the tree has no children', () => {
      render(<FileTree root={emptyTree} />)
      expect(screen.getByText('No files generated yet')).toBeInTheDocument()
    })
  })
})
