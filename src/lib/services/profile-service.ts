import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

type ProfileResult = { success: true; data: Profile } | { success: false; error: string }

export async function getOrCreateProfile(userId: string): Promise<ProfileResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (data) {
    return { success: true, data }
  }

  if (error && error.code !== 'PGRST116') {
    return { success: false, error: error.message }
  }

  const { data: upserted, error: upsertError } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id' })
    .select('*')
    .single()

  if (upsertError) {
    return { success: false, error: upsertError.message }
  }

  return { success: true, data: upserted }
}
