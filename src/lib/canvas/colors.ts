import type { FlowNodeType } from '@/types/graph'

const NODE_COLOR_MAP: Record<FlowNodeType, string> = {
  decision: 'amber',
  process: 'blue',
  entry: 'green',
  exit: 'red',
  start: 'gray',
  end: 'gray',
}

const DEFAULT_NODE_COLOR = 'slate'

export function getNodeColor(nodeType: FlowNodeType): string {
  return NODE_COLOR_MAP[nodeType] ?? DEFAULT_NODE_COLOR
}
