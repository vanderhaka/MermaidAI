// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatInput from '@/components/chat/ChatInput'

describe('ChatInput', () => {
  let onSend: ReturnType<typeof vi.fn<(message: string) => void>>

  beforeEach(() => {
    onSend = vi.fn<(message: string) => void>()
  })

  describe('rendering', () => {
    it('renders a textbox with placeholder', () => {
      render(<ChatInput onSend={onSend} isLoading={false} />)
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('placeholder', 'Describe what you want to build...')
    })

    it('renders a send button', () => {
      render(<ChatInput onSend={onSend} isLoading={false} />)
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    })
  })

  describe('submission', () => {
    it('calls onSend with message text on button click', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      await user.type(screen.getByRole('textbox'), 'Build an auth system')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(onSend).toHaveBeenCalledWith('Build an auth system')
    })

    it('calls onSend with message text on Enter key', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      await user.type(screen.getByRole('textbox'), 'Design a dashboard')
      await user.keyboard('{Enter}')

      expect(onSend).toHaveBeenCalledWith('Design a dashboard')
    })

    it('does not send on Shift+Enter (allows newline)', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      await user.type(screen.getByRole('textbox'), 'Line one')
      await user.keyboard('{Shift>}{Enter}{/Shift}')

      expect(onSend).not.toHaveBeenCalled()
    })

    it('clears input after successful send', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(input).toHaveValue('')
    })

    it('does not send empty messages on button click', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(onSend).not.toHaveBeenCalled()
    })

    it('does not send whitespace-only messages', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      await user.type(screen.getByRole('textbox'), '   ')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(onSend).not.toHaveBeenCalled()
    })

    it('keeps the message in place when onSend returns false', async () => {
      const user = userEvent.setup()
      const failingSend = vi.fn<(message: string) => Promise<boolean>>().mockResolvedValue(false)
      render(<ChatInput onSend={failingSend} isLoading={false} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Retry me')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(failingSend).toHaveBeenCalledWith('Retry me')
      expect(input).toHaveValue('Retry me')
    })
  })

  describe('attachments', () => {
    it('sends the selected file and note via onAttachFile', async () => {
      const user = userEvent.setup()
      const onAttachFile = vi.fn<(file: File, note: string) => void>()
      render(<ChatInput onSend={onSend} onAttachFile={onAttachFile} isLoading={false} />)

      const file = new File(['hello'], 'brief.txt', { type: 'text/plain' })
      const fileInput = screen.getByTestId('chat-file-input') as HTMLInputElement

      await user.upload(fileInput, file)
      await user.type(screen.getByRole('textbox'), 'Use this brief')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(onAttachFile).toHaveBeenCalledWith(file, 'Use this brief')
      expect(onSend).not.toHaveBeenCalled()
    })

    it('clears the file pill and note after a successful attachment send', async () => {
      const user = userEvent.setup()
      const onAttachFile = vi.fn<(file: File, note: string) => void>()
      render(<ChatInput onSend={onSend} onAttachFile={onAttachFile} isLoading={false} />)

      const file = new File(['hello'], 'brief.txt', { type: 'text/plain' })
      const fileInput = screen.getByTestId('chat-file-input') as HTMLInputElement
      const input = screen.getByRole('textbox')

      await user.upload(fileInput, file)
      await user.type(input, 'Use this brief')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(screen.queryByTestId('attached-file-pill')).not.toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    it('keeps the file and note when onAttachFile returns false', async () => {
      const user = userEvent.setup()
      const failingAttach = vi
        .fn<(file: File, note: string) => Promise<boolean>>()
        .mockResolvedValue(false)
      render(<ChatInput onSend={onSend} onAttachFile={failingAttach} isLoading={false} />)

      const file = new File(['hello'], 'brief.txt', { type: 'text/plain' })
      const fileInput = screen.getByTestId('chat-file-input') as HTMLInputElement
      const input = screen.getByRole('textbox')

      await user.upload(fileInput, file)
      await user.type(input, 'Try again')
      await user.click(screen.getByRole('button', { name: /send/i }))

      expect(failingAttach).toHaveBeenCalledWith(file, 'Try again')
      expect(screen.getByTestId('attached-file-pill')).toBeInTheDocument()
      expect(input).toHaveValue('Try again')
    })
  })

  describe('IME composition', () => {
    function dispatchKeyDown(element: Element, isComposing: boolean): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing,
      } as KeyboardEventInit)
      element.dispatchEvent(event)
      return event
    }

    it('does not send when Enter is pressed during IME composition', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'テスト')

      dispatchKeyDown(input, true)

      expect(onSend).not.toHaveBeenCalled()
    })

    it('does not preventDefault during IME composition', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'テスト')

      const event = dispatchKeyDown(input, true)

      expect(event.defaultPrevented).toBe(false)
    })

    it('still sends on Enter when not composing', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={false} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello')

      dispatchKeyDown(input, false)

      expect(onSend).toHaveBeenCalledWith('Hello')
    })
  })

  describe('loading state', () => {
    it('keeps the textarea enabled while loading so typing is never lost', () => {
      render(<ChatInput onSend={onSend} isLoading={true} />)
      expect(screen.getByRole('textbox')).not.toBeDisabled()
    })

    it('disables the send button while loading when there is no text', () => {
      render(<ChatInput onSend={onSend} isLoading={true} />)
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
    })

    it('queues a message submitted while loading instead of dropping it', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={true} />)

      await user.type(screen.getByRole('textbox'), 'Note typed mid-stream')
      await user.click(screen.getByRole('button', { name: /queue/i }))

      expect(onSend).not.toHaveBeenCalled()
      expect(screen.getByTestId('queued-messages-pill')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('')
    })

    it('queues on Enter while loading', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={true} />)

      await user.type(screen.getByRole('textbox'), 'Enter mid-stream')
      await user.keyboard('{Enter}')

      expect(onSend).not.toHaveBeenCalled()
      expect(screen.getByTestId('queued-messages-pill')).toBeInTheDocument()
    })

    it('auto-sends queued messages when loading finishes', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<ChatInput onSend={onSend} isLoading={true} />)

      await user.type(screen.getByRole('textbox'), 'First note')
      await user.keyboard('{Enter}')
      await user.type(screen.getByRole('textbox'), 'Second note')
      await user.keyboard('{Enter}')

      rerender(<ChatInput onSend={onSend} isLoading={false} />)

      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith('First note\n\nSecond note')
      })
      expect(onSend).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('queued-messages-pill')).not.toBeInTheDocument()
    })

    it('restores queued text to the input when the flush send fails', async () => {
      const user = userEvent.setup()
      const failingSend = vi.fn<(message: string) => Promise<boolean>>().mockResolvedValue(false)
      const { rerender } = render(<ChatInput onSend={failingSend} isLoading={true} />)

      await user.type(screen.getByRole('textbox'), 'Do not lose me')
      await user.keyboard('{Enter}')

      rerender(<ChatInput onSend={failingSend} isLoading={false} />)

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveValue('Do not lose me')
      })
    })

    it('cancelling the queue restores the text to the input', async () => {
      const user = userEvent.setup()
      render(<ChatInput onSend={onSend} isLoading={true} />)

      await user.type(screen.getByRole('textbox'), 'Changed my mind')
      await user.keyboard('{Enter}')
      await user.click(screen.getByRole('button', { name: /cancel queued messages/i }))

      expect(screen.queryByTestId('queued-messages-pill')).not.toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('Changed my mind')
      expect(onSend).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('has a form element wrapping the inputs', () => {
      render(<ChatInput onSend={onSend} isLoading={false} />)
      expect(screen.getByRole('form')).toBeInTheDocument()
    })

    it('has an accessible label on the textbox', () => {
      render(<ChatInput onSend={onSend} isLoading={false} />)
      expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
    })

    it('send button has accessible name', () => {
      render(<ChatInput onSend={onSend} isLoading={false} />)
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    })
  })
})
