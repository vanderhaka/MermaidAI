import 'server-only'

import { auth } from '@clerk/nextjs/server'

export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId
}
