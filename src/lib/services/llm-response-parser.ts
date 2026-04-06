import type { GraphOperation, GraphOperationType } from '@/types/chat'

const OPERATIONS_REGEX = /<operations>([\s\S]*?)<\/operations>/

const VALID_OPERATION_TYPES: Set<string> = new Set<string>([
  'create_module',
  'update_module',
  'delete_module',
  'create_node',
  'update_node',
  'delete_node',
  'create_edge',
  'update_edge',
  'delete_edge',
  'connect_modules',
] satisfies GraphOperationType[])

function parseOperationsJson(json: string): GraphOperation[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json.trim())
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  return parsed.filter(
    (op: unknown) =>
      typeof op === 'object' &&
      op !== null &&
      'type' in op &&
      VALID_OPERATION_TYPES.has((op as { type: string }).type),
  ) as GraphOperation[]
}

export function parseLLMResponse(raw: string): {
  message: string
  operations: GraphOperation[]
} {
  const segments = raw.split(OPERATIONS_REGEX)

  const message = segments
    .filter((_, i) => i % 2 === 0)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n')

  const operationsJson = segments[1]
  const operations = operationsJson ? parseOperationsJson(operationsJson) : []

  return { message, operations }
}
