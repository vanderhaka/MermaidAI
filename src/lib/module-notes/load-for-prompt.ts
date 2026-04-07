import 'server-only'

import { headers } from 'next/headers'

import { moduleNotesFileSlug } from '@/lib/module-notes-slug'

const MAX_CHARS = 14_000

export type LoadedModuleNotes =
  | { source: 'module'; markdown: string }
  | { source: 'default'; markdown: string }
  | { source: 'none'; markdown: null }

/**
 * Loads markdown from `public/module-notes/<slug>.md`, then `default.md`, for injection into the
 * module-detail system prompt. Uses fetch against the app's own origin so it works on Vercel
 * (where `public/` files are served as static assets, not on the filesystem).
 */
export async function loadModuleNotesForChat(moduleName: string): Promise<LoadedModuleNotes> {
  const slug = moduleNotesFileSlug(moduleName)
  const origin = await resolveOrigin()

  const primary = await fetchText(`${origin}/module-notes/${slug}.md`)
  if (primary !== null) {
    return { source: 'module', markdown: trimDoc(primary) }
  }

  const fallback = await fetchText(`${origin}/module-notes/default.md`)
  if (fallback !== null) {
    return { source: 'default', markdown: trimDoc(fallback) }
  }

  return { source: 'none', markdown: null }
}

async function resolveOrigin(): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) return siteUrl.replace(/\/+$/, '')

  try {
    const hdrs = await headers()
    const host = hdrs.get('host')
    if (host) {
      const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
      return `${protocol}://${host}`
    }
  } catch {
    // headers() unavailable outside request scope
  }

  return 'http://localhost:3000'
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

function trimDoc(text: string): string {
  const t = text.trim()
  if (t.length <= MAX_CHARS) return t
  return `${t.slice(0, MAX_CHARS)}\n\n_[Module notes truncated for prompt size]_`
}
