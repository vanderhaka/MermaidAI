// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/chat'
import ChatMessageList from '@/components/chat/ChatMessageList'

function makeMessage(
  overrides: Partial<ChatMessage> & { id: string; role: ChatMessage['role'] },
): ChatMessage {
  return {
    content: '',
    operations: [],
    createdAt: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

const userMsg = makeMessage({
  id: 'msg-1',
  role: 'user',
  content: 'Build me a login flow',
})

const assistantMsg = makeMessage({
  id: 'msg-2',
  role: 'assistant',
  content: 'Here is a login flow with email and password.',
})

describe('ChatMessageList', () => {
  describe('empty state', () => {
    it('shows a welcome prompt when there are no messages and not loading', () => {
      render(<ChatMessageList messages={[]} isLoading={false} />)
      expect(screen.getByText(/describe what you want to build/i)).toBeInTheDocument()
    })

    it('does not show the welcome prompt when messages exist', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={false} />)
      expect(screen.queryByText(/describe what you want to build/i)).not.toBeInTheDocument()
    })
  })

  describe('message rendering', () => {
    it('renders each message content', () => {
      render(<ChatMessageList messages={[userMsg, assistantMsg]} isLoading={false} />)
      expect(screen.getByText('Build me a login flow')).toBeInTheDocument()
      expect(screen.getByText('Here is a login flow with email and password.')).toBeInTheDocument()
    })

    it('applies distinct styling for user messages (right-aligned)', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={false} />)
      const msgEl = screen.getByText('Build me a login flow').closest('[data-role="user"]')
      expect(msgEl).toBeInTheDocument()
    })

    it('applies distinct styling for assistant messages (left-aligned)', () => {
      render(<ChatMessageList messages={[assistantMsg]} isLoading={false} />)
      const msgEl = screen
        .getByText('Here is a login flow with email and password.')
        .closest('[data-role="assistant"]')
      expect(msgEl).toBeInTheDocument()
    })
  })

  describe('streaming', () => {
    it('renders streaming content in the latest assistant bubble', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={true} streamingContent="Here is" />)
      expect(screen.getByText('Here is')).toBeInTheDocument()
      // The streaming bubble should be marked as assistant
      const streamBubble = screen.getByText('Here is').closest('[data-role="assistant"]')
      expect(streamBubble).toBeInTheDocument()
    })

    it('shows a thinking indicator when loading with no streaming content', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={true} />)
      expect(screen.getByLabelText(/thinking/i)).toBeInTheDocument()
    })

    it('does not show thinking indicator when streaming content arrives', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={true} streamingContent="Starting" />)
      expect(screen.queryByLabelText(/thinking/i)).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('uses a log role on the message list container', () => {
      render(<ChatMessageList messages={[userMsg, assistantMsg]} isLoading={false} />)
      expect(screen.getByRole('log')).toBeInTheDocument()
    })

    it('marks each message with an article role', () => {
      render(<ChatMessageList messages={[userMsg, assistantMsg]} isLoading={false} />)
      const articles = screen.getAllByRole('article')
      expect(articles).toHaveLength(2)
    })

    it('labels user messages with aria-label containing user', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={false} />)
      const article = screen.getByRole('article')
      expect(article).toHaveAttribute('aria-label', expect.stringMatching(/user/i))
    })

    it('labels assistant messages with aria-label containing assistant', () => {
      render(<ChatMessageList messages={[assistantMsg]} isLoading={false} />)
      const article = screen.getByRole('article')
      expect(article).toHaveAttribute('aria-label', expect.stringMatching(/assistant/i))
    })
  })

  describe('auto-scroll', () => {
    it('has a scroll anchor element at the bottom', () => {
      render(<ChatMessageList messages={[userMsg, assistantMsg]} isLoading={false} />)
      expect(screen.getByTestId('scroll-anchor')).toBeInTheDocument()
    })
  })
})
