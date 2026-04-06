// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PseudocodeBlock from '@/components/canvas/PseudocodeBlock'

describe('PseudocodeBlock', () => {
  it('returns null for null pseudocode', () => {
    const { container } = render(<PseudocodeBlock pseudocode={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null for undefined pseudocode', () => {
    const { container } = render(<PseudocodeBlock pseudocode={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null for empty string pseudocode', () => {
    const { container } = render(<PseudocodeBlock pseudocode="" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a pre > code block', () => {
    render(<PseudocodeBlock pseudocode="x = 1" />)
    const code = screen.getByRole('code')
    expect(code).toBeInTheDocument()
    expect(code.tagName).toBe('CODE')
    expect(code.parentElement?.tagName).toBe('PRE')
  })

  it('applies monospace font styling', () => {
    render(<PseudocodeBlock pseudocode="x = 1" />)
    const pre = screen.getByRole('code').parentElement!
    expect(pre.className).toMatch(/font-mono/)
  })

  it('highlights the "if" keyword', () => {
    render(<PseudocodeBlock pseudocode="if x > 0" />)
    const keyword = screen.getByText('if')
    expect(keyword.tagName).toBe('SPAN')
    expect(keyword.className).toMatch(/text-purple-600|font-bold/)
  })

  it('highlights the "else" keyword', () => {
    render(<PseudocodeBlock pseudocode="else do thing" />)
    const keyword = screen.getByText('else')
    expect(keyword.tagName).toBe('SPAN')
    expect(keyword.className).toMatch(/text-purple-600|font-bold/)
  })

  it('highlights the "return" keyword', () => {
    render(<PseudocodeBlock pseudocode="return result" />)
    const keyword = screen.getByText('return')
    expect(keyword.tagName).toBe('SPAN')
    expect(keyword.className).toMatch(/text-purple-600|font-bold/)
  })

  it('highlights the "function" keyword', () => {
    render(<PseudocodeBlock pseudocode="function doStuff" />)
    const keyword = screen.getByText('function')
    expect(keyword.tagName).toBe('SPAN')
    expect(keyword.className).toMatch(/text-purple-600|font-bold/)
  })

  it('does not highlight non-keywords', () => {
    render(<PseudocodeBlock pseudocode="hello world" />)
    const code = screen.getByRole('code')
    const keywordSpans = code.querySelectorAll('span.text-purple-600')
    expect(keywordSpans.length).toBe(0)
  })

  it('highlights multiple keywords in multiline pseudocode', () => {
    const code = 'if valid\n  return ok\nelse\n  return error'
    render(<PseudocodeBlock pseudocode={code} />)
    expect(screen.getByText('if')).toBeInTheDocument()
    expect(screen.getAllByText('return')).toHaveLength(2)
    expect(screen.getByText('else')).toBeInTheDocument()
  })

  it('preserves whitespace in pre block', () => {
    render(<PseudocodeBlock pseudocode="  indented" />)
    const pre = screen.getByRole('code').parentElement!
    expect(pre.className).toMatch(/whitespace-pre-wrap/)
  })
})
