import { useMemo } from 'react'
import { useGraphStore } from '@/store/graph-store'
import { deriveFileTree } from '@/lib/services/file-tree'
import type { FileTreeNode } from '@/types/file-tree'

export function useFileTree(): FileTreeNode {
  const nodes = useGraphStore((state) => state.nodes)
  return useMemo(() => deriveFileTree(nodes), [nodes])
}
