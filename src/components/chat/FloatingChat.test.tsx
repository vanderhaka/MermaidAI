// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingChat from '@/components/chat/FloatingChat'

const baseProps = {
  messages: [],
  isLoading: false,
  streamingContent: '',
  toolActivity: null,
  onSend: vi.fn(),
  isOpen: true,
  onToggle: vi.fn(),
}

describe('FloatingChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1200,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 900,
    })
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.localStorage.clear()
  })

  it('opens at a readable default size', () => {
    render(<FloatingChat {...baseProps} />)

    const panel = screen.getByTestId('chat-panel')
    expect(panel).toHaveStyle({ height: '640px' })
    expect(panel.parentElement).toHaveStyle({ width: '760px' })
  })

  it('constrains the first paint to the viewport before stored sizing is restored', () => {
    render(<FloatingChat {...baseProps} />)

    const panel = screen.getByTestId('chat-panel')
    expect(panel.parentElement).toHaveClass(
      'max-w-[calc(100vw-2rem)]',
      'sm:max-w-[calc(100vw-3rem)]',
    )
    expect(panel).toHaveClass('max-h-[calc(100dvh-7.5rem)]')
  })

  it('lets the user stretch the chat height and width from the corner handle', () => {
    render(<FloatingChat {...baseProps} />)

    fireEvent.pointerDown(screen.getByTestId('chat-resize-handle'), {
      button: 0,
      clientX: 700,
      clientY: 500,
    })
    fireEvent.pointerMove(window, {
      clientX: 600,
      clientY: 420,
    })
    fireEvent.pointerUp(window)

    const panel = screen.getByTestId('chat-panel')
    expect(panel).toHaveStyle({ height: '720px' })
    expect(panel.parentElement).toHaveStyle({ width: '860px' })
  })

  it('remembers the stretched chat size', async () => {
    const { unmount } = render(<FloatingChat {...baseProps} />)

    fireEvent.pointerDown(screen.getByTestId('chat-resize-handle'), {
      button: 0,
      clientX: 700,
      clientY: 500,
    })
    fireEvent.pointerMove(window, {
      clientX: 640,
      clientY: 450,
    })
    fireEvent.pointerUp(window)
    unmount()

    render(<FloatingChat {...baseProps} />)

    const panel = screen.getByTestId('chat-panel')
    await waitFor(() => {
      expect(panel).toHaveStyle({ height: '690px' })
      expect(panel.parentElement).toHaveStyle({ width: '820px' })
    })
  })

  it('persists a resize once on release instead of on every pointer move', async () => {
    render(<FloatingChat {...baseProps} />)
    await waitFor(() => {
      expect(window.localStorage.length).toBe(1)
    })
    const storedBeforeResize = window.localStorage.getItem('mermaidai.assistantChatSize')

    fireEvent.pointerDown(screen.getByTestId('chat-resize-handle'), {
      button: 0,
      clientX: 700,
      clientY: 500,
    })
    fireEvent.pointerMove(window, { clientX: 660, clientY: 470 })
    fireEvent.pointerMove(window, { clientX: 620, clientY: 440 })

    expect(window.localStorage.getItem('mermaidai.assistantChatSize')).toBe(storedBeforeResize)

    fireEvent.pointerUp(window)
    expect(window.localStorage.getItem('mermaidai.assistantChatSize')).toBe(
      JSON.stringify({ width: 840, height: 700 }),
    )
  })

  it('renders no model selector — Claude is the only model', () => {
    render(<FloatingChat {...baseProps} />)

    expect(screen.queryByLabelText('AI model')).not.toBeInTheDocument()
  })

  describe('closing the panel', () => {
    it('keeps the typed draft when the panel is toggled shut and reopened', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<FloatingChat {...baseProps} />)

      await user.type(screen.getByRole('textbox'), 'Half-written thought')
      rerender(<FloatingChat {...baseProps} isOpen={false} />)
      rerender(<FloatingChat {...baseProps} isOpen={true} />)

      expect(screen.getByRole('textbox')).toHaveValue('Half-written thought')
    })

    it('hides the panel content instead of exposing it while closed', () => {
      render(<FloatingChat {...baseProps} isOpen={false} />)

      expect(screen.getByTestId('chat-panel')).toHaveStyle({ display: 'none' })
    })

    it('refocuses the message field when the panel reopens', async () => {
      const { rerender } = render(<FloatingChat {...baseProps} isOpen={false} />)

      rerender(<FloatingChat {...baseProps} isOpen={true} />)

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveFocus()
      })
    })
  })

  describe('auto-decide toggle', () => {
    it('stays out of the header when the workspace does not offer the setting', () => {
      render(<FloatingChat {...baseProps} />)

      expect(screen.queryByRole('button', { name: 'Auto-decide' })).not.toBeInTheDocument()
    })

    it('shows the setting as on', () => {
      render(<FloatingChat {...baseProps} helperMode onToggleHelperMode={vi.fn()} />)

      const toggle = screen.getByRole('button', { name: 'Auto-decide' })
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      expect(toggle).toHaveAttribute(
        'title',
        'When on, the assistant includes standard product basics and records non-obvious choices for review',
      )
    })

    it('shows the setting as off', () => {
      render(<FloatingChat {...baseProps} helperMode={false} onToggleHelperMode={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Auto-decide' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })

    it('hands the toggle back to the workspace on click', async () => {
      const user = userEvent.setup()
      const onToggleHelperMode = vi.fn()
      render(<FloatingChat {...baseProps} helperMode onToggleHelperMode={onToggleHelperMode} />)

      await user.click(screen.getByRole('button', { name: 'Auto-decide' }))

      expect(onToggleHelperMode).toHaveBeenCalledTimes(1)
    })
  })

  describe('errors', () => {
    it('renders the failure inside the panel with retry and dismiss', async () => {
      const user = userEvent.setup()
      const onRetry = vi.fn()
      const onDismissError = vi.fn()
      render(
        <FloatingChat
          {...baseProps}
          error="Assistant response stream was unavailable"
          onRetry={onRetry}
          onDismissError={onDismissError}
        />,
      )

      const notice = screen.getByRole('alert')
      expect(notice).toHaveTextContent('Assistant response stream was unavailable')
      expect(screen.getByTestId('chat-panel')).toContainElement(notice)

      await user.click(screen.getByRole('button', { name: /retry/i }))
      expect(onRetry).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: /dismiss error/i }))
      expect(onDismissError).toHaveBeenCalledTimes(1)
    })

    it('omits retry when there is nothing to re-send', () => {
      render(
        <FloatingChat {...baseProps} error="Failed to parse document" onDismissError={vi.fn()} />,
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    })

    it('shows nothing when there is no error', () => {
      render(<FloatingChat {...baseProps} onDismissError={vi.fn()} />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
