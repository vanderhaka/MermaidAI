// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('defaults the model selector to OSS', () => {
    render(<FloatingChat {...baseProps} />)

    expect(screen.getByLabelText('AI model')).toHaveValue('cerebras')
  })

  it('notifies when the model selector changes', () => {
    const onModelProviderChange = vi.fn()
    render(<FloatingChat {...baseProps} onModelProviderChange={onModelProviderChange} />)

    fireEvent.change(screen.getByLabelText('AI model'), { target: { value: 'anthropic' } })

    expect(onModelProviderChange).toHaveBeenCalledWith('anthropic')
  })
})
