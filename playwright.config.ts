import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local for test credentials
function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(__dirname, '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=["']?(.+?)["']?$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2]
      }
    }
  } catch {
    // .env.local not found — tests will skip auth-gated scenarios
  }
}
loadEnvLocal()

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  projects: [
    // Auth setup — runs first, saves session state
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Unauthenticated tests (original walkthrough + auth/nav stress tests)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /stress\//,
    },
    // Authenticated stress tests — reuse saved session
    {
      name: 'stress-authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      testMatch: /stress\//,
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
