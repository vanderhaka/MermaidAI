import { create } from 'zustand'
import type { ChatMessage } from '@/types/chat'

type ChatState = {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
}

type ChatActions = {
  addMessage: (msg: ChatMessage) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
}

export const useChatStore = create<ChatState & ChatActions>()((set) => ({
  ...initialState,
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))
