// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { FileTreeNode } from '@/types/file-tree'

describe('FileTreeNode type contract', () => {
  const validFile: FileTreeNode = {
    name: 'auth.ts',
    path: 'src/lib/auth.ts',
    type: 'file',
  }

  const validFolder: FileTreeNode = {
    name: 'lib',
    path: 'src/lib',
    type: 'folder',
    children: [validFile],
  }

  it('has required fields: name, path, type', () => {
    expect(validFile).toHaveProperty('name')
    expect(validFile).toHaveProperty('path')
    expect(validFile).toHaveProperty('type')
  })

  it('type discriminates between file and folder', () => {
    const file: FileTreeNode = { ...validFile, type: 'file' }
    const folder: FileTreeNode = { ...validFile, type: 'folder' }
    expect(file.type).toBe('file')
    expect(folder.type).toBe('folder')
  })

  it('children is optional and recursive', () => {
    expect(validFile.children).toBeUndefined()
    expect(validFolder.children).toHaveLength(1)
    expect(validFolder.children![0].name).toBe('auth.ts')
  })

  it('linkedNodeIds is optional string array', () => {
    const withLinks: FileTreeNode = {
      ...validFile,
      linkedNodeIds: ['node_001', 'node_002'],
    }
    expect(validFile.linkedNodeIds).toBeUndefined()
    expect(withLinks.linkedNodeIds).toHaveLength(2)
    expect(withLinks.linkedNodeIds![0]).toBe('node_001')
  })

  it('supports deeply nested folder structure', () => {
    const deep: FileTreeNode = {
      name: 'src',
      path: 'src',
      type: 'folder',
      children: [
        {
          name: 'lib',
          path: 'src/lib',
          type: 'folder',
          children: [validFile],
        },
      ],
    }
    expect(deep.children![0].children![0].name).toBe('auth.ts')
  })
})
