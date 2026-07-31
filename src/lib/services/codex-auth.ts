import 'server-only'

import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Reads the OAuth tokens the Codex CLI writes to ~/.codex/auth.json so the
 * app can talk to the ChatGPT Codex backend on the user's membership.
 *
 * Verified against the installed Codex CLI: refreshes POST to
 * auth.openai.com/oauth/token with the CLI's public client id.
 */

const OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const REFRESH_SCOPE = 'openid profile email'

/** Refresh slightly early so a token can't lapse between check and request. */
const EXPIRY_SKEW_MS = 60_000

/** Every failure collapses to this so token material can never reach a log. */
const LOGIN_EXPIRED = 'Codex login expired. Run: codex login'

export type CodexAuth = {
  accessToken: string
  accountId: string
}

type CodexAuthFile = Record<string, unknown> & {
  tokens?: Record<string, unknown>
}

let refreshInFlight: Promise<CodexAuth> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key]
  return typeof value === 'string' ? value : ''
}

function authFilePath(): string {
  const base = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  return join(base, 'auth.json')
}

async function readAuthFile(): Promise<CodexAuthFile> {
  let raw: string
  try {
    raw = await readFile(authFilePath(), 'utf8')
  } catch {
    throw new Error('Codex login not found. Run: codex login')
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) throw new Error(LOGIN_EXPIRED)
    return parsed
  } catch {
    throw new Error(LOGIN_EXPIRED)
  }
}

/**
 * Reads `exp` out of a JWT payload. The signature is deliberately NOT
 * verified — only the issuer can do that, and all we need is a refresh
 * schedule. A token we misread simply gets refreshed or 401s.
 */
export function readJwtExpiryMs(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const decoded: unknown = JSON.parse(json)
    if (!isRecord(decoded)) return null
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

async function persistTokens(file: CodexAuthFile, tokens: Record<string, unknown>): Promise<void> {
  const next = { ...file, tokens, last_refresh: new Date().toISOString() }
  await writeFile(authFilePath(), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
}

async function performRefresh(file: CodexAuthFile): Promise<CodexAuth> {
  const refreshToken = readString(file.tokens, 'refresh_token')
  if (!refreshToken) throw new Error(LOGIN_EXPIRED)

  let payload: unknown
  try {
    const response = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CODEX_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: REFRESH_SCOPE,
      }),
    })
    if (!response.ok) throw new Error(LOGIN_EXPIRED)
    payload = await response.json()
  } catch {
    throw new Error(LOGIN_EXPIRED)
  }

  const body = isRecord(payload) ? payload : {}
  const accessToken = readString(body, 'access_token')
  if (!accessToken) throw new Error(LOGIN_EXPIRED)

  // Unknown fields (auth_mode, OPENAI_API_KEY, …) round-trip untouched so the
  // Codex CLI keeps working against the same file.
  const tokens: Record<string, unknown> = { ...(file.tokens ?? {}), access_token: accessToken }
  const rotatedRefresh = readString(body, 'refresh_token')
  if (rotatedRefresh) tokens.refresh_token = rotatedRefresh
  const idToken = readString(body, 'id_token')
  if (idToken) tokens.id_token = idToken

  await persistTokens(file, tokens)

  return { accessToken, accountId: readString(tokens, 'account_id') }
}

/** Concurrent turns must share one refresh — a second one races the rotated token. */
function refreshOnce(file: CodexAuthFile): Promise<CodexAuth> {
  refreshInFlight ??= performRefresh(file).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function getCodexAuth(): Promise<CodexAuth> {
  const file = await readAuthFile()
  const accessToken = readString(file.tokens, 'access_token')
  if (!accessToken) throw new Error(LOGIN_EXPIRED)

  const expiresAtMs = readJwtExpiryMs(accessToken)
  if (expiresAtMs !== null && expiresAtMs - EXPIRY_SKEW_MS <= Date.now()) {
    return refreshOnce(file)
  }

  return { accessToken, accountId: readString(file.tokens, 'account_id') }
}

export async function forceRefreshCodexAuth(): Promise<CodexAuth> {
  return refreshOnce(await readAuthFile())
}
