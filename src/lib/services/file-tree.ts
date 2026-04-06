import type { FlowNode } from '@/types/graph'
import type { FileTreeNode } from '@/types/file-tree'

export const FILE_PATH_PATTERN = /\/\/\s*file:\s*(\S+)/

function sortChildren(children: FileTreeNode[]): FileTreeNode[] {
  const folders = children
    .filter((c) => c.type === 'folder')
    .sort((a, b) => a.name.localeCompare(b.name))
  const files = children
    .filter((c) => c.type === 'file')
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...folders, ...files]
}

function insertPath(root: FileTreeNode, parts: string[], nodeId: string): void {
  let current = root

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const path = parts.slice(0, i + 1).join('/')
    const isFile = i === parts.length - 1

    if (!current.children) current.children = []

    let existing = current.children.find((c) => c.name === part)

    if (!existing) {
      existing = {
        name: part,
        path,
        type: isFile ? 'file' : 'folder',
        children: isFile ? undefined : [],
        linkedNodeIds: isFile ? [nodeId] : undefined,
      }
      current.children.push(existing)
    } else if (isFile) {
      if (!existing.linkedNodeIds) existing.linkedNodeIds = []
      if (!existing.linkedNodeIds.includes(nodeId)) {
        existing.linkedNodeIds.push(nodeId)
      }
    }

    current = existing
  }
}

function sortTree(node: FileTreeNode): void {
  if (node.children && node.children.length > 0) {
    node.children = sortChildren(node.children)
    for (const child of node.children) {
      sortTree(child)
    }
  }
}

export function deriveFileTree(nodes: FlowNode[]): FileTreeNode {
  const root: FileTreeNode = {
    name: 'root',
    path: '',
    type: 'folder',
    children: [],
    linkedNodeIds: [],
  }
  const pattern = new RegExp(FILE_PATH_PATTERN.source, 'gm')

  for (const node of nodes) {
    if (!node.pseudocode) continue

    const matches = node.pseudocode.matchAll(pattern)
    for (const match of matches) {
      const filePath = match[1]
      const parts = filePath.split('/')
      insertPath(root, parts, node.id)
    }
  }

  sortTree(root)
  return root
}
