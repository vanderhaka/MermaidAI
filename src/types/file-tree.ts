export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  linkedNodeIds?: string[]
}
