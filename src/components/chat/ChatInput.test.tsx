// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    it('disables input when isLoading is true', () => {
      render(<ChatInput onSend={onSend} isLoading={true} />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('disables send button when isLoading is true', () => {
      render(<ChatInput onSend={onSend} isLoading={true} />)
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
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
