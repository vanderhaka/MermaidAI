import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, {
    error: 'NEXT_PUBLIC_SUPABASE_URL is required',
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required',
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, {
    error: 'SUPABASE_SERVICE_ROLE_KEY is required',
  }),
  NEXT_PUBLIC_SITE_URL: z.string().min(1, {
    error: 'NEXT_PUBLIC_SITE_URL is required',
  }),
})

export type EnvConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  siteUrl: string
}

export function createConfig(): EnvConfig {
  const parsed = envSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? undefined,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? undefined,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? undefined,
  })

  return {
    supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: parsed.NEXT_PUBLIC_SITE_URL,
  }
}

let _config: EnvConfig | null = null

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = createConfig()
  }
  return _config
}
