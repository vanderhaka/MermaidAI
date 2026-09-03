import { describe, expect, it } from 'vitest'

import {
  buildSelectedOpenQuestionHelpResponse,
  isClickOnlySelectedQuestionPrompt,
} from '@/lib/services/selected-open-question'

const cartQuestion = {
  id: 'oq-cart',
  section: 'Cart Management',
  question: 'Can users edit cart items?',
}

describe('selected open question helpers', () => {
  it('detects a drawer selection prompt without treating it as an answer', () => {
    expect(
      isClickOnlySelectedQuestionPrompt(
        'Resolve this open question from Cart Management: "Can users edit cart items?"',
        cartQuestion,
      ),
    ).toBe(true)
  })

  it('normalizes legacy prompt copy and smart quotes', () => {
    expect(
      isClickOnlySelectedQuestionPrompt(
        'Let’s resolve this open question: “Can users edit cart items?”',
        cartQuestion,
      ),
    ).toBe(true)
  })

  it('does not classify an answered prompt as click-only', () => {
    expect(
      isClickOnlySelectedQuestionPrompt(
        'Yes, users can edit quantities and remove items before checkout.',
        cartQuestion,
      ),
    ).toBe(false)
  })

  it('builds the deterministic helper response with the recommended default', () => {
    const response = buildSelectedOpenQuestionHelpResponse(cartQuestion)
    expect(response).toContain('Options:')
    expect(response).toContain(
      'Let users edit quantities and remove items until payment is submitted',
    )
    expect(response.match(/\(Recommended\)/g)).toHaveLength(1)
    expect(response.match(/^\d+\. /gm)).toHaveLength(3)
  })

  it('answers supplier access choices with a concrete low-friction default', () => {
    const response = buildSelectedOpenQuestionHelpResponse({
      id: 'oq-supplier-access',
      section: 'Supplier Access',
      question: 'Should suppliers use accounts, or receive secure quote links without signing up?',
    })
    expect(response).toContain('Use secure passwordless links initially')
    expect(response).toContain('Require every user to create an account first')
  })

  it('gives reminder questions an actionable default schedule', () => {
    expect(
      buildSelectedOpenQuestionHelpResponse({
        id: 'oq-reminders',
        section: 'Notifications',
        question: 'When should staff be reminded about missing supplier quotes?',
      }),
    ).toContain('48 hours before the deadline')
  })
})
