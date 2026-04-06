'use client'

import { useFileTree } from '@/hooks/useFileTree'
import FileTree from '@/components/file-tree/file-tree'

interface FileTreeSidebarProps {
  onFileSelect?: (linkedNodeIds: string[]) => void
  highlightedPaths?: string[]
}

export default function FileTreeSidebar({ onFileSelect, highlightedPaths }: FileTreeSidebarProps) {
  const root = useFileTree()

  return (
    <div>
      <h2 className="px-3 py-2 text-sm font-semibold text-gray-500">Files</h2>
      <FileTree root={root} onFileSelect={onFileSelect} highlightedPaths={highlightedPaths} />
    </div>
  )
}
