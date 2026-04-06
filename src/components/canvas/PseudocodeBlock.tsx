const KEYWORDS = ['if', 'else', 'return', 'function'] as const
const KEYWORD_PATTERN = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g')

interface PseudocodeBlockProps {
  pseudocode: string | null | undefined
}

function highlightLine(line: string, lineIndex: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  KEYWORD_PATTERN.lastIndex = 0
  while ((match = KEYWORD_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={`${lineIndex}-${match.index}`} className="font-bold text-purple-600">
        {match[0]}
      </span>,
    )
    lastIndex = KEYWORD_PATTERN.lastIndex
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex))
  }

  return parts
}

export default function PseudocodeBlock({ pseudocode }: PseudocodeBlockProps) {
  if (!pseudocode) return null

  const lines = pseudocode.split('\n')

  return (
    <pre className="whitespace-pre-wrap font-mono rounded bg-gray-50 p-2 text-xs text-gray-700">
      <code role="code">
        {lines.map((line, i) => (
          <span key={i}>
            {highlightLine(line, i)}
            {i < lines.length - 1 ? '\n' : null}
          </span>
        ))}
      </code>
    </pre>
  )
}
