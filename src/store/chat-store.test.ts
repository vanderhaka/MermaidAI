// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '@/store/chat-store'
import type { ChatMessage } from '@/types/chat'

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    operations: [],
    createdAt: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with empty messages', () => {
      const state = useChatStore.getState()
      expect(state.messages).toEqual([])
    })

    it('starts with isLoading false', () => {
      const state = useChatStore.getState()
      expect(state.isLoading).toBe(false)
    })

    it('starts with error null', () => {
      const state = useChatStore.getState()
      expect(state.error).toBeNull()
    })
  })

  describe('addMessage', () => {
    it('appends a message to the messages array', () => {
      const msg = makeMessage()
      useChatStore.getState().addMessage(msg)
      expect(useChatStore.getState().messages).toEqual([msg])
    })

    it('appends multiple messages in order', () => {
      const msg1 = makeMessage({ id: 'msg-1', content: 'First' })
      const msg2 = makeMessage({ id: 'msg-2', content: 'Second' })
      useChatStore.getState().addMessage(msg1)
      useChatStore.getState().addMessage(msg2)
      expect(useChatStore.getState().messages).toEqual([msg1, msg2])
    })

    it('preserves existing messages when adding', () => {
      const msg1 = makeMessage({ id: 'msg-1' })
      useChatStore.getState().addMessage(msg1)
      const msg2 = makeMessage({ id: 'msg-2', role: 'assistant' })
      useChatStore.getState().addMessage(msg2)
      expect(useChatStore.getState().messages).toHaveLength(2)
      expect(useChatStore.getState().messages[0]).toEqual(msg1)
    })
  })

  describe('setLoading', () => {
    it('sets isLoading to true', () => {
      useChatStore.getState().setLoading(true)
      expect(useChatStore.getState().isLoading).toBe(true)
    })

    it('sets isLoading back to false', () => {
      useChatStore.getState().setLoading(true)
      useChatStore.getState().setLoading(false)
      expect(useChatStore.getState().isLoading).toBe(false)
    })
  })

  describe('setError', () => {
    it('sets error to a string', () => {
      useChatStore.getState().setError('Something went wrong')
      expect(useChatStore.getState().error).toBe('Something went wrong')
    })

    it('clears error by setting null', () => {
      useChatStore.getState().setError('Error')
      useChatStore.getState().setError(null)
      expect(useChatStore.getState().error).toBeNull()
    })
  })

  describe('reset', () => {
    it('clears all state back to initial values', () => {
      useChatStore.getState().addMessage(makeMessage())
      useChatStore.getState().setLoading(true)
      useChatStore.getState().setError('Error')

      useChatStore.getState().reset()

      const state = useChatStore.getState()
      expect(state.messages).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })
})
