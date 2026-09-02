// @vitest-environment happy-dom
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

    it('restores a persisted Architecture receipt after reload', () => {
      const msg = makeMessage({
        id: 'msg-architecture-receipt',
        role: 'assistant',
        content: 'Your first Architecture is ready to review.',
        changeSetId: '11111111-1111-4111-8111-111111111111',
        metadata: {
          change_summary: {
            capabilitiesCreated: 4,
            connectionsCreated: 3,
            assumptionsRecorded: 1,
            questionsRecorded: 2,
            provisional: true,
          },
        },
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} />)

      expect(within(screen.getByRole('article')).getByText('Provisional')).toBeInTheDocument()
      expect(screen.getByTestId('architecture-change-receipt')).toHaveTextContent(
        'Created 4 capabilities · Connected 3 handoffs · Recorded 1 assumption and 2 questions',
      )
    })

    it('continues a partial Architecture turn from the committed current map', async () => {
      const user = userEvent.setup()
      const onSend = vi.fn()
      const msg = makeMessage({
        id: 'msg-partial-architecture',
        role: 'assistant',
        content: 'Updated the booking boundary.\n\n⚠ Response interrupted',
        changeSetId: '11111111-1111-4111-8111-111111111111',
        metadata: {
          turn_status: 'partial',
          change_summary: {
            capabilitiesCreated: 0,
            connectionsCreated: 0,
            assumptionsRecorded: 0,
            questionsRecorded: 0,
            created: 0,
            updated: 1,
            deleted: 0,
            assumed: 0,
            resolved: 0,
            provisional: true,
          },
        },
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} onSend={onSend} />)
      await user.click(screen.getByRole('button', { name: 'Continue' }))

      expect(onSend).toHaveBeenCalledWith(
        expect.stringMatching(/check the current Architecture.*unfinished part/i),
      )
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

    it('shows the supplied Architecture activity instead of a generic thinking state', () => {
      render(
        <ChatMessageList
          messages={[userMsg]}
          isLoading={true}
          pendingActivity="Reading your brief and finding actors"
        />,
      )

      expect(screen.getByTestId('architecture-turn-activity')).toHaveTextContent(
        'Reading your brief and finding actors…',
      )
      expect(screen.getAllByRole('log')).toHaveLength(1)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/thinking/i)).not.toBeInTheDocument()
    })

    it('does not show thinking indicator when streaming content arrives', () => {
      render(<ChatMessageList messages={[userMsg]} isLoading={true} streamingContent="Starting" />)
      expect(screen.queryByLabelText(/thinking/i)).not.toBeInTheDocument()
    })
  })

  describe('tool call visibility', () => {
    it('renders a live progress block that grows as the turn runs', () => {
      const { rerender } = render(
        <ChatMessageList
          messages={[userMsg]}
          isLoading={true}
          streamingContent="Working on it"
          toolActivity="Created node"
          toolCalls={['Created node']}
        />,
      )

      expect(screen.getByTestId('tool-calls-live')).toHaveTextContent('1 action')

      rerender(
        <ChatMessageList
          messages={[userMsg]}
          isLoading={true}
          streamingContent="Working on it"
          toolActivity="Created edge"
          toolCalls={['Created node', 'Updated node', 'Created edge']}
        />,
      )

      const live = screen.getByTestId('tool-calls-live')
      expect(live).toHaveTextContent('3 actions')
      expect(live).toHaveTextContent('Created edge')
    })

    it('expands the live block to the full list so far', async () => {
      const user = userEvent.setup()
      render(
        <ChatMessageList
          messages={[userMsg]}
          isLoading={true}
          streamingContent="Working on it"
          toolActivity="Created edge"
          toolCalls={['Created node', 'Created edge']}
        />,
      )

      const live = screen.getByTestId('tool-calls-live')
      const toggle = within(live).getByRole('button')
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(within(live).queryAllByRole('listitem')).toHaveLength(0)

      await user.click(toggle)

      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(
        within(live)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Created node', 'Created edge'])
    })

    it('falls back to the latest label before the first call completes', () => {
      render(
        <ChatMessageList
          messages={[userMsg]}
          isLoading={true}
          streamingContent="Working on it"
          toolActivity="Creating node"
          toolCalls={[]}
        />,
      )

      expect(screen.queryByTestId('tool-calls-live')).not.toBeInTheDocument()
      expect(screen.getByText('Creating node…')).toBeInTheDocument()
    })

    it('renders a collapsed summary under the message that produced it', async () => {
      const user = userEvent.setup()
      const msg = makeMessage({
        id: 'msg-tools',
        role: 'assistant',
        content: 'Added the checkout steps.',
        toolCalls: ['Created node', 'Updated node', 'Created edge'],
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} />)

      const article = screen.getByRole('article')
      const summary = within(article).getByTestId('tool-calls-summary')
      expect(summary).toHaveTextContent('3 actions')
      expect(within(summary).queryAllByRole('listitem')).toHaveLength(0)

      await user.click(within(summary).getByRole('button'))

      expect(within(summary).getAllByRole('listitem')).toHaveLength(3)
    })

    it('shows a single call as its own label rather than a count', () => {
      const msg = makeMessage({
        id: 'msg-one-tool',
        role: 'assistant',
        content: 'Added the step.',
        toolCalls: ['Created node'],
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} />)

      expect(screen.getByTestId('tool-calls-summary')).toHaveTextContent('Created node')
    })

    it('keeps the question and recommendation cards alongside the tool record', () => {
      const msg = makeMessage({
        id: 'msg-tools-question',
        role: 'assistant',
        content:
          'Added the coupon step.\n\n**Should an invalid coupon show an error?**\n\nRecommended answer: Show an error and allow a retry.',
        toolCalls: ['Created node', 'Created edge'],
      })

      render(<ChatMessageList messages={[msg]} isLoading={false} />)

      expect(screen.getByTestId('assistant-question')).toHaveTextContent(
        'Should an invalid coupon show an error?',
      )
      expect(screen.getByTestId('assistant-recommendation')).toHaveTextContent(
        'Show an error and allow a retry',
      )
      expect(screen.getByTestId('tool-calls-summary')).toHaveTextContent('2 actions')
    })

    it('no longer renders a global summary once the turn ends', () => {
      render(
        <ChatMessageList
          messages={[userMsg, assistantMsg]}
          isLoading={false}
          toolCalls={['Created node', 'Created edge']}
        />,
      )

      expect(screen.queryByTestId('tool-calls-summary')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tool-calls-live')).not.toBeInTheDocument()
      expect(screen.queryByText(/\d+ actions?\b/i)).not.toBeInTheDocument()
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

    it('batches streamed chunks into one instant scroll per animation frame', () => {
      const frameCallbacks = new Map<number, FrameRequestCallback>()
      let nextFrameId = 0
      const requestFrame = vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextFrameId
        frameCallbacks.set(id, callback)
        return id
      })
      const cancelFrame = vi.fn((id: number) => frameCallbacks.delete(id))
      const scrollIntoView = vi.fn()

      vi.stubGlobal('requestAnimationFrame', requestFrame)
      vi.stubGlobal('cancelAnimationFrame', cancelFrame)
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      })

      const { rerender } = render(
        <ChatMessageList messages={[userMsg]} isLoading streamingContent="First" />,
      )
      rerender(<ChatMessageList messages={[userMsg]} isLoading streamingContent="First chunk" />)
      rerender(
        <ChatMessageList
          messages={[userMsg]}
          isLoading
          streamingContent="First chunk, then more"
        />,
      )

      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(frameCallbacks.size).toBe(1)

      const pendingFrame = Array.from(frameCallbacks.values())[0]
      act(() => pendingFrame(0))

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' })
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
