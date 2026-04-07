'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { signInSchema, signUpSchema } from '@/types/auth'
import type { AuthResult } from '@/types/auth'

const SAFE_AUTH_ERRORS = new Set([
  'Invalid login credentials',
  'User already registered',
  'Email not confirmed',
  'Email rate limit exceeded',
  'Password should be at least 6 characters',
  'User not found',
  'New password should be different from the old password',
  'Auth session missing!',
])

const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.'

function sanitizeAuthError(message: string): string {
  return SAFE_AUTH_ERRORS.has(message) ? message : GENERIC_AUTH_ERROR
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({ email, password })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { success: false, error: sanitizeAuthError(error.message) }
  }

  return { success: true }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const parsed = signInSchema.safeParse({ email, password })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { success: false, error: sanitizeAuthError(error.message) }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
