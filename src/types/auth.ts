import { z } from 'zod'

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type SignInInput = z.infer<typeof signInSchema>

export type AuthResult = {
  success: boolean
  error?: string
}
