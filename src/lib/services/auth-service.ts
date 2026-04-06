'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { signInSchema, signUpSchema } from '@/types/auth'
import type { AuthResult } from '@/types/auth'

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
    return { success: false, error: error.message }
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
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
