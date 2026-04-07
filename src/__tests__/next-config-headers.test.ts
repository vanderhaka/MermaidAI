// @vitest-environment node
import { beforeAll, describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

describe('next.config.ts security headers', () => {
  it('disables X-Powered-By header', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it('defines an async headers function', () => {
    expect(typeof nextConfig.headers).toBe('function')
  })

  describe('header values', () => {
    let headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>

    beforeAll(async () => {
      headers = (await nextConfig.headers!()) as typeof headers
    })

    it('applies headers to all routes', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')
      expect(allRoutes).toBeDefined()
    })

    it('sets Content-Security-Policy', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')!
      const csp = allRoutes.headers.find((h) => h.key === 'Content-Security-Policy')
      expect(csp).toBeDefined()
      expect(csp!.value).toContain("default-src 'self'")
    })

    it('sets Strict-Transport-Security with max-age >= 1 year and includeSubDomains', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')!
      const hsts = allRoutes.headers.find((h) => h.key === 'Strict-Transport-Security')
      expect(hsts).toBeDefined()
      const maxAgeMatch = hsts!.value.match(/max-age=(\d+)/)
      expect(maxAgeMatch).not.toBeNull()
      expect(Number(maxAgeMatch![1])).toBeGreaterThanOrEqual(31536000)
      expect(hsts!.value).toContain('includeSubDomains')
    })

    it('sets X-Frame-Options to DENY', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')!
      const xfo = allRoutes.headers.find((h) => h.key === 'X-Frame-Options')
      expect(xfo).toBeDefined()
      expect(xfo!.value).toBe('DENY')
    })

    it('sets X-Content-Type-Options to nosniff', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')!
      const xcto = allRoutes.headers.find((h) => h.key === 'X-Content-Type-Options')
      expect(xcto).toBeDefined()
      expect(xcto!.value).toBe('nosniff')
    })

    it('sets Referrer-Policy to strict-origin-when-cross-origin', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')!
      const rp = allRoutes.headers.find((h) => h.key === 'Referrer-Policy')
      expect(rp).toBeDefined()
      expect(rp!.value).toBe('strict-origin-when-cross-origin')
    })

    it('sets Permissions-Policy restricting camera, microphone, geolocation', () => {
      const allRoutes = headers.find((h) => h.source === '/(.*)')!
      const pp = allRoutes.headers.find((h) => h.key === 'Permissions-Policy')
      expect(pp).toBeDefined()
      expect(pp!.value).toContain('camera=()')
      expect(pp!.value).toContain('microphone=()')
      expect(pp!.value).toContain('geolocation=()')
    })
  })
})
