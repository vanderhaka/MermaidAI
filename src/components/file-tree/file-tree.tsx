'use client'

import { useState } from 'react'

import type { FileTreeNode } from '@/types/file-tree'

interface FileTreeProps {
  root: FileTreeNode
  onFileSelect?: (linkedNodeIds: string[]) => void
  highlightedPaths?: string[]
}

function TreeNode({
  node,
  onFileSelect,
  highlightedPaths,
  depth,
}: {
  node: FileTreeNode
  onFileSelect?: (linkedNodeIds: string[]) => void
  highlightedPaths?: string[]
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const isFolder = node.type === 'folder'
  const isHighlighted = highlightedPaths?.includes(node.path) ?? false

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-gray-100"
          style={{ paddingLeft: `${depth * 12}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          <span className="font-medium text-gray-700">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              onFileSelect={onFileSelect}
              highlightedPaths={highlightedPaths}
              depth={depth + 1}
            />
          ))}
      </div>
    )
  }

  return (
    <div data-highlighted={isHighlighted ? 'true' : undefined}>
      <button
        type="button"
        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-gray-100 ${
          isHighlighted ? 'bg-blue-50 text-blue-700' : 'text-gray-600'
        }`}
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={() => onFileSelect?.(node.linkedNodeIds ?? [])}
      >
        <span>{node.name}</span>
      </button>
    </div>
  )
}

export default function FileTree({ root, onFileSelect, highlightedPaths }: FileTreeProps) {
  const isEmpty = !root.children || root.children.length === 0

  if (isEmpty) {
    return <div className="px-3 py-4 text-sm text-gray-400">No files generated yet</div>
  }

  return (
    <div className="py-1">
      <TreeNode
        node={root}
        onFileSelect={onFileSelect}
        highlightedPaths={highlightedPaths}
        depth={0}
      />
    </div>
  )
}
