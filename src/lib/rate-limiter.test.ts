// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter, chatRateLimiter } from '@/lib/rate-limiter'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests within the limit', () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 })
    const result = limiter.check('user-1')
    expect(result).toEqual({ allowed: true, remaining: 2 })
  })

  it('decrements remaining on each call', () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 })
    limiter.check('user-1')
    const result = limiter.check('user-1')
    expect(result).toEqual({ allowed: true, remaining: 1 })
  })

  it('rejects requests when limit is exceeded', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 })
    limiter.check('user-1')
    limiter.check('user-1')
    const result = limiter.check('user-1')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('tracks different keys independently', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 })
    limiter.check('user-1')
    const result = limiter.check('user-2')
    expect(result).toEqual({ allowed: true, remaining: 0 })
  })

  it('resets after the sliding window elapses', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10_000 })
    limiter.check('user-1')
    const blocked = limiter.check('user-1')
    expect(blocked.allowed).toBe(false)

    vi.advanceTimersByTime(10_001)

    const result = limiter.check('user-1')
    expect(result).toEqual({ allowed: true, remaining: 0 })
  })

  it('only counts requests within the sliding window', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10_000 })
    limiter.check('user-1') // t=0
    vi.advanceTimersByTime(6_000) // t=6s
    limiter.check('user-1') // t=6s
    vi.advanceTimersByTime(5_000) // t=11s — first request should have expired

    const result = limiter.check('user-1')
    expect(result).toEqual({ allowed: true, remaining: 0 })
  })

  it('cleans up stale entries', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 5_000 })
    limiter.check('stale-key')
    vi.advanceTimersByTime(6_000)

    // After window elapses, the next check should work and old timestamps cleaned
    const result = limiter.check('stale-key')
    expect(result).toEqual({ allowed: true, remaining: 0 })
  })

  it('returns correct retryAfterSeconds value', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10_000 })
    limiter.check('user-1') // t=0
    vi.advanceTimersByTime(3_000) // t=3s

    const result = limiter.check('user-1')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      // Earliest request was at t=0, window is 10s, so retry after ~7s
      expect(result.retryAfterSeconds).toBeCloseTo(7, 0)
    }
  })

  describe('chatRateLimiter', () => {
    it('is pre-configured with 20 requests per 60 seconds', () => {
      const result = chatRateLimiter.check('test-user')
      expect(result).toEqual({ allowed: true, remaining: 19 })
    })
  })
})
