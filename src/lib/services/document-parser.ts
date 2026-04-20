import 'server-only'

/**
 * Parses uploaded documents (PDF/DOCX/TXT/MD) into plain text for the scope
 * chat flow. Runs server-side only — `unpdf` and `mammoth` are Node/serverless
 * deps and must not be bundled to the client.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_EXTRACTED_CHARS = 80_000 // ~20k tokens — comfortable budget for scope prompt

export type SupportedDocumentType = 'pdf' | 'docx' | 'txt' | 'md'

export type ParsedDocument = {
  filename: string
  type: SupportedDocumentType
  text: string
  truncated: boolean
  originalLength: number
}

export type DocumentParseError = {
  code: 'unsupported_type' | 'too_large' | 'empty' | 'parse_failed'
  message: string
}

export type ParseResult =
  | { success: true; data: ParsedDocument }
  | { success: false; error: DocumentParseError }

const EXTENSION_TO_TYPE: Record<string, SupportedDocumentType> = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'txt',
  md: 'md',
  markdown: 'md',
}

const MIME_TO_TYPE: Record<string, SupportedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
}

function detectType(filename: string, mimeType: string): SupportedDocumentType | null {
  const mimeMatch = MIME_TO_TYPE[mimeType.toLowerCase()]
  if (mimeMatch) return mimeMatch

  const ext = filename.toLowerCase().split('.').pop() ?? ''
  return EXTENSION_TO_TYPE[ext] ?? null
}

function truncate(text: string): { text: string; truncated: boolean; originalLength: number } {
  const originalLength = text.length
  if (originalLength <= MAX_EXTRACTED_CHARS) {
    return { text, truncated: false, originalLength }
  }
  const head = text.slice(0, MAX_EXTRACTED_CHARS)
  return {
    text: `${head}\n\n[Document truncated — original length ${originalLength.toLocaleString()} characters, showing first ${MAX_EXTRACTED_CHARS.toLocaleString()}.]`,
    truncated: true,
    originalLength,
  }
}

async function parsePdf(buffer: Uint8Array): Promise<string> {
  const { extractText } = await import('unpdf')
  const result = await extractText(buffer, { mergePages: true })
  return result.text
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/**
 * Parses an uploaded File into plain text. Returns a tagged result — never
 * throws on user-facing errors (unsupported type, empty, too large). Parser
 * library errors are caught and mapped to `parse_failed`.
 */
export async function parseDocument(file: File): Promise<ParseResult> {
  if (file.size === 0) {
    return { success: false, error: { code: 'empty', message: 'The uploaded file is empty.' } }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)
    return {
      success: false,
      error: {
        code: 'too_large',
        message: `File exceeds the ${mb} MB upload limit.`,
      },
    }
  }

  const type = detectType(file.name, file.type)
  if (!type) {
    return {
      success: false,
      error: {
        code: 'unsupported_type',
        message: 'Only PDF, DOCX, TXT, and Markdown files are supported.',
      },
    }
  }

  let rawText: string
  try {
    if (type === 'pdf') {
      const bytes = new Uint8Array(await file.arrayBuffer())
      rawText = await parsePdf(bytes)
    } else if (type === 'docx') {
      const buffer = Buffer.from(await file.arrayBuffer())
      rawText = await parseDocx(buffer)
    } else {
      // txt / md
      rawText = await file.text()
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'parse_failed',
        message: err instanceof Error ? err.message : 'Unable to read the document.',
      },
    }
  }

  const normalized = rawText.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return {
      success: false,
      error: {
        code: 'empty',
        message: 'The document did not contain any readable text.',
      },
    }
  }

  const { text, truncated, originalLength } = truncate(normalized)

  return {
    success: true,
    data: {
      filename: file.name,
      type,
      text,
      truncated,
      originalLength,
    },
  }
}
