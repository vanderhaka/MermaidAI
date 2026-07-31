// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only (it throws at import time in non-server contexts)
vi.mock('server-only', () => ({}))

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

function makeAccessToken(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')
  return `eyJhbGciOiJub25lIn0.${payload}.signature`
}

function authFileJson(accessToken: string): string {
  return JSON.stringify({
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: 'id-token',
      access_token: accessToken,
      refresh_token: 'refresh-token',
      account_id: 'acct-123',
    },
    last_refresh: '2026-01-01T00:00:00.000Z',
  })
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

async function loadAuthModule() {
  vi.resetModules()
  return import('@/lib/services/codex-auth')
}

describe('codex-auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Keeps every path resolution inside a fake dir — the real ~/.codex is
    // never read even if the fs mock were bypassed.
    process.env = { ...originalEnv, CODEX_HOME: '/tmp/fake-codex-home' }
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('returns the stored token without refreshing while it is still valid', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() + 3600)))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { getCodexAuth } = await loadAuthModule()
    await expect(getCodexAuth()).resolves.toEqual({
      accessToken: expect.any(String),
      accountId: 'acct-123',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('refreshes a token that is already expired', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() - 60)))
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getCodexAuth } = await loadAuthModule()
    await expect(getCodexAuth()).resolves.toEqual({
      accessToken: 'fresh-access-token',
      accountId: 'acct-123',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
      scope: 'openid profile email',
    })
  })

  it('refreshes a token that expires inside the skew window', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() + 30)))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { getCodexAuth } = await loadAuthModule()
    await getCodexAuth()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves unknown fields and rotates tokens when writing back', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() - 60)))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'fresh-access-token',
            refresh_token: 'rotated-refresh-token',
            id_token: 'rotated-id-token',
          }),
          { status: 200 },
        ),
      ),
    )

    const { getCodexAuth } = await loadAuthModule()
    await getCodexAuth()

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const [, contents] = mockWriteFile.mock.calls[0]
    const written = JSON.parse(String(contents))

    expect(written.auth_mode).toBe('chatgpt')
    expect(written.OPENAI_API_KEY).toBeNull()
    expect(written.tokens).toEqual({
      id_token: 'rotated-id-token',
      access_token: 'fresh-access-token',
      refresh_token: 'rotated-refresh-token',
      account_id: 'acct-123',
    })
    expect(written.last_refresh).not.toBe('2026-01-01T00:00:00.000Z')
    expect(Date.parse(written.last_refresh)).not.toBeNaN()
  })

  it('keeps the existing refresh token when the response does not rotate it', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() - 60)))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 }),
        ),
    )

    const { getCodexAuth } = await loadAuthModule()
    await getCodexAuth()

    const [, contents] = mockWriteFile.mock.calls[0]
    expect(JSON.parse(String(contents)).tokens.refresh_token).toBe('refresh-token')
  })

  it('refreshes only once when two callers race', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() - 60)))
    const fetchMock = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 })),
              10,
            ),
          ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { getCodexAuth } = await loadAuthModule()
    const [first, second] = await Promise.all([getCodexAuth(), getCodexAuth()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it('throws a login-expired error when the refresh is rejected', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() - 60)))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 })),
    )

    const { getCodexAuth } = await loadAuthModule()
    await expect(getCodexAuth()).rejects.toThrow('Codex login expired. Run: codex login')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('throws a login-expired error when the network call fails', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() - 60)))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const { getCodexAuth } = await loadAuthModule()
    await expect(getCodexAuth()).rejects.toThrow('Codex login expired. Run: codex login')
  })

  it('reports a missing auth file as a login prompt', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const { getCodexAuth } = await loadAuthModule()
    await expect(getCodexAuth()).rejects.toThrow('Codex login not found. Run: codex login')
  })

  it('forceRefreshCodexAuth refreshes even when the token has not expired', async () => {
    mockReadFile.mockResolvedValue(authFileJson(makeAccessToken(nowSeconds() + 3600)))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'forced' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { forceRefreshCodexAuth } = await loadAuthModule()
    await expect(forceRefreshCodexAuth()).resolves.toEqual({
      accessToken: 'forced',
      accountId: 'acct-123',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('readJwtExpiryMs returns null for tokens without a readable payload', async () => {
    const { readJwtExpiryMs } = await loadAuthModule()

    expect(readJwtExpiryMs('not-a-jwt')).toBeNull()
    expect(readJwtExpiryMs('header.%%%.signature')).toBeNull()
    expect(readJwtExpiryMs(makeAccessToken(1_800_000_000))).toBe(1_800_000_000_000)
  })
})
