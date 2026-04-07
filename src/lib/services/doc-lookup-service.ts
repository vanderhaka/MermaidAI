'use server'

import Anthropic from '@anthropic-ai/sdk'

const CONTEXT7_BASE_URL = 'https://context7.com/api/v2'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_DOC_TOKENS = 1024

type SearchResult = {
  vendor: string
  library: string
  name: string
}

type DocLookupResult = {
  library: string
  topic: string
  summary: string
}

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic()
  }
  return _client
}

/**
 * Search Context7 for a library ID.
 */
async function searchLibrary(query: string): Promise<SearchResult | null> {
  const url = `${CONTEXT7_BASE_URL}/search?query=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    headers: context7Headers(),
  })

  if (!response.ok) return null

  const text = await response.text()

  // Parse the first result — Context7 returns text with library paths like /vendor/library
  const match = text.match(/\/([^/\s]+)\/([^/\s]+)/)
  if (!match) return null

  return {
    vendor: match[1],
    library: match[2],
    name: query,
  }
}

/**
 * Fetch documentation from Context7 for a specific library and topic.
 */
async function fetchDocs(vendor: string, library: string, topic: string): Promise<string> {
  const url = `${CONTEXT7_BASE_URL}/docs/code/${vendor}/${library}?type=txt&topic=${encodeURIComponent(topic)}`

  const response = await fetch(url, {
    headers: context7Headers(),
  })

  if (!response.ok) return ''

  return response.text()
}

function context7Headers(): Record<string, string> {
  const headers: Record<string, string> = {}
  const apiKey = process.env.CONTEXT7_API_KEY
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  return headers
}

/**
 * Summarize raw documentation using Haiku for the flow-building context.
 */
async function summarizeWithHaiku(
  library: string,
  topic: string,
  rawDocs: string,
): Promise<string> {
  const client = getClient()

  const message = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: MAX_DOC_TOKENS,
    messages: [
      {
        role: 'user',
        content: `Summarize the following documentation for "${library}" about "${topic}".

Focus on:
- Key API methods and their signatures
- Data flow patterns (inputs, outputs, callbacks, events)
- Integration points and setup requirements
- Common patterns and best practices

Be concise — this summary will be used by an AI designing a software architecture flow.

Documentation:
${rawDocs.slice(0, 8000)}`,
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  return textBlock?.text ?? 'No summary available.'
}

/**
 * Look up 3rd party documentation: search Context7, fetch docs, summarize with Haiku.
 */
export async function lookupDocumentation(
  library: string,
  topic: string,
): Promise<DocLookupResult> {
  // Step 1: Search for the library
  const searchResult = await searchLibrary(library)

  if (!searchResult) {
    // Fallback: ask Haiku directly from its training data
    const client = getClient()
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_DOC_TOKENS,
      messages: [
        {
          role: 'user',
          content: `Provide a concise technical summary of ${library} regarding: ${topic}. Focus on API patterns, data flows, integration points, and setup requirements. This will be used by an AI designing a software module flow.`,
        },
      ],
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    return {
      library,
      topic,
      summary: textBlock?.text ?? 'Documentation unavailable.',
    }
  }

  // Step 2: Fetch docs from Context7
  const rawDocs = await fetchDocs(searchResult.vendor, searchResult.library, topic)

  if (!rawDocs.trim()) {
    // Fallback: ask Haiku directly
    const client = getClient()
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_DOC_TOKENS,
      messages: [
        {
          role: 'user',
          content: `Provide a concise technical summary of ${library} regarding: ${topic}. Focus on API patterns, data flows, integration points, and setup requirements.`,
        },
      ],
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    return { library, topic, summary: textBlock?.text ?? 'Documentation unavailable.' }
  }

  // Step 3: Summarize with Haiku
  const summary = await summarizeWithHaiku(library, topic, rawDocs)

  return { library, topic, summary }
}
