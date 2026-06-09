// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

    it('renders recommended assistant answers as an accept action', async () => {
      const user = userEvent.setup()
      const onSend = vi.fn()
      const msg = makeMessage({
        id: 'msg-rec',
        role: 'assistant',
        content:
          'Should checkout changes stay editable after payment starts?\n\nRecommended answer: Lock the cart after payment begins, but let users return to the cart to edit before retrying.',
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} onSend={onSend} />)

      expect(screen.getByTestId('assistant-question')).toHaveTextContent(
        'Should checkout changes stay editable after payment starts?',
      )
      expect(screen.getByTestId('assistant-recommendation')).toHaveTextContent(
        'Lock the cart after payment begins',
      )
      expect(screen.queryByText(/recommended answer:/i)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /accept suggestion/i }))

      expect(onSend).toHaveBeenCalledWith(
        'Accept suggestion: Lock the cart after payment begins, but let users return to the cart to edit before retrying.',
      )
    })

    it('renders follow-up questions as a prominent callout before recommendations', () => {
      const msg = makeMessage({
        id: 'msg-question-callout',
        role: 'assistant',
        content:
          'Perfect. I added the coupon step.\n\n**Should an invalid coupon code show an error and let them retry, or silently skip it?**\n\nRecommended answer: Show an error, allow retry, and let them skip if needed.',
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} />)

      const question = screen.getByTestId('assistant-question')
      expect(within(question).getByText('Question')).toBeInTheDocument()
      expect(question).toHaveTextContent(
        'Should an invalid coupon code show an error and let them retry, or silently skip it?',
      )
      expect(screen.getByText('Perfect. I added the coupon step.')).toBeInTheDocument()
      expect(screen.getByTestId('assistant-recommendation')).toHaveTextContent(
        'Show an error, allow retry',
      )
    })

    it('normalizes old tool-loop assistant messages into readable paragraphs', () => {
      const msg = makeMessage({
        id: 'msg-run-on',
        role: 'assistant',
        content:
          "I'll start by creating a simple flow for a checkout/cart system.Now I'll add the steps:Now I'll connect everything:Done! The flow is ready.",
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} />)

      expect(screen.queryByText(/system\.Now/)).not.toBeInTheDocument()
      expect(
        screen.getByText("I'll start by creating a simple flow for a checkout/cart system."),
      ).toBeInTheDocument()
      expect(screen.getByText("Now I'll add the steps:")).toBeInTheDocument()
      expect(screen.getByText("Now I'll connect everything:")).toBeInTheDocument()
      expect(screen.getByText('Done! The flow is ready.')).toBeInTheDocument()
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

  describe('uploaded-document messages', () => {
    const uploadedMsg = makeMessage({
      id: 'msg-upload',
      role: 'user',
      content:
        "📎 client-brief.pdf\n\nHere is the brief from today's call\n\n-----BEGIN SCOPE DOCUMENT-----\nFull project description with many words that should not appear in the chat bubble.\n-----END SCOPE DOCUMENT-----",
    })

    it('renders a file chip with the filename', () => {
      render(<ChatMessageList messages={[uploadedMsg]} isLoading={false} />)
      expect(screen.getByText('client-brief.pdf')).toBeInTheDocument()
    })

    it('renders the user note alongside the chip', () => {
      render(<ChatMessageList messages={[uploadedMsg]} isLoading={false} />)
      expect(screen.getByText(/here is the brief from today/i)).toBeInTheDocument()
    })

    it('hides the raw document content from the chat bubble', () => {
      render(<ChatMessageList messages={[uploadedMsg]} isLoading={false} />)
      expect(
        screen.queryByText(/full project description with many words/i),
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/-----BEGIN SCOPE DOCUMENT-----/)).not.toBeInTheDocument()
    })

    it('marks the article with a data-upload attribute for styling hooks', () => {
      render(<ChatMessageList messages={[uploadedMsg]} isLoading={false} />)
      const article = screen.getByRole('article')
      expect(article).toHaveAttribute('data-upload')
    })

    it('renders a plain bubble when the content has no upload marker', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={false} />)
      const article = screen.getByRole('article')
      expect(article).not.toHaveAttribute('data-upload')
    })
  })
})
