import type { OpenQuestion } from '@/types/graph'

export type SelectedOpenQuestion = Pick<OpenQuestion, 'id' | 'section' | 'question'>

function normalizeSelectedQuestionText(value: string): string {
  return value.toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim()
}

export function isClickOnlySelectedQuestionPrompt(
  message: string,
  selectedQuestion: SelectedOpenQuestion,
): boolean {
  const normalizedMessage = normalizeSelectedQuestionText(message)
  const normalizedQuestion = normalizeSelectedQuestionText(selectedQuestion.question)
  const currentPrompt = normalizeSelectedQuestionText(
    `Resolve this open question from ${selectedQuestion.section}: "${selectedQuestion.question}"`,
  )
  const legacyPrompt = normalizeSelectedQuestionText(
    `Let's resolve this open question: "${selectedQuestion.question}"`,
  )

  return (
    normalizedMessage === currentPrompt ||
    normalizedMessage === legacyPrompt ||
    (normalizedMessage.startsWith('resolve this open question') &&
      normalizedMessage.includes(normalizedQuestion))
  )
}

function recommendedDefaultForOpenQuestion(question: string): string {
  const normalized = normalizeSelectedQuestionText(question)

  if (normalized.includes('payment') && normalized.includes('fail')) {
    return 'Show the payment error, keep the cart intact, and let the user retry with a different card or payment method.'
  }
  if (normalized.includes('shipping')) {
    return 'Start with one standard shipping option with a fixed flat cost, then add express or overnight once pricing rules are confirmed.'
  }
  if (
    normalized.includes('order') &&
    (normalized.includes('capture') || normalized.includes('store'))
  ) {
    return 'Store the order ID, line items, totals, customer contact, shipping details, payment status, receipt URL, and tracking status when available.'
  }
  if (
    normalized.includes('cart') &&
    (normalized.includes('edit') || normalized.includes('remove'))
  ) {
    return 'Let users edit quantities and remove items until payment is submitted, then keep the paid order locked.'
  }
  if (normalized.includes('coupon') || normalized.includes('discount')) {
    return 'Show a clear error for invalid codes, let users retry, and allow checkout to continue without the discount.'
  }

  return 'Use the simplest customer-friendly default that keeps the flow moving, then capture exceptions only if the client names them.'
}

export function buildSelectedOpenQuestionHelpResponse(question: SelectedOpenQuestion): string {
  return `${question.question}\n\nRecommended answer: ${recommendedDefaultForOpenQuestion(question.question)}`
}
