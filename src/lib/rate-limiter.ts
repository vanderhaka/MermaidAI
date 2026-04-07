type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number }

export class RateLimiter {
  private maxRequests: number
  private windowMs: number
  private requests: Map<string, number[]> = new Map()

  constructor(opts: { maxRequests: number; windowMs: number }) {
    this.maxRequests = opts.maxRequests
    this.windowMs = opts.windowMs
  }

  check(key: string): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this.requests.get(key) ?? []

    // Remove timestamps outside the sliding window
    timestamps = timestamps.filter((t) => t > windowStart)

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0]
      const retryAfterMs = oldestInWindow + this.windowMs - now
      this.requests.set(key, timestamps)
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      }
    }

    timestamps.push(now)
    this.requests.set(key, timestamps)

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
    }
  }
}

export const chatRateLimiter = new RateLimiter({ maxRequests: 20, windowMs: 60_000 })
