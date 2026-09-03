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

  if (
    (normalized.includes('account') || normalized.includes('sign up')) &&
    normalized.includes('link')
  ) {
    return 'Use secure passwordless links initially, with optional accounts later for repeat users who want saved history.'
  }
  if (normalized.includes('remind') || normalized.includes('reminder')) {
    return 'Send reminders 48 hours before the deadline and again 24 hours before it, then send one overdue alert to the owner.'
  }
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

function boundedOptionsForOpenQuestion(question: string): string[] | null {
  const normalized = normalizeSelectedQuestionText(question)

  if (
    (normalized.includes('account') || normalized.includes('sign up')) &&
    normalized.includes('link')
  ) {
    return [
      'Use secure passwordless links initially, with optional accounts later for repeat users who want saved history.',
      'Require every user to create an account first.',
      'Let the client choose between a secure link and an account for each user.',
    ]
  }
  if (normalized.includes('remind') || normalized.includes('reminder')) {
    return [
      'Send reminders 48 hours before the deadline and again 24 hours before it, then one overdue alert to the owner.',
      'Send one reminder 24 hours before the deadline.',
      'Send a daily reminder starting three days before the deadline.',
    ]
  }
  if (normalized.includes('payment') && normalized.includes('fail')) {
    return [
      'Keep the cart intact, explain the error, and let the user retry with another payment method.',
      'Cancel the attempt and return the user to checkout.',
      'Stop after one failed attempt and direct the user to support.',
    ]
  }
  if (normalized.includes('shipping')) {
    return [
      'Start with one standard flat-rate shipping option.',
      'Offer standard and express shipping from launch.',
      'Calculate live carrier rates at checkout.',
    ]
  }
  if (
    normalized.includes('cart') &&
    (normalized.includes('edit') || normalized.includes('remove'))
  ) {
    return [
      'Let users edit quantities and remove items until payment is submitted, then lock the paid order.',
      'Lock the cart as soon as checkout starts.',
      'Allow quantity changes during checkout but not item removal.',
    ]
  }
  if (normalized.includes('coupon') || normalized.includes('discount')) {
    return [
      'Show a clear error, let the user retry, and allow checkout without the discount.',
      'Remove the invalid code automatically and continue checkout.',
      'Block checkout until the code is corrected or removed.',
    ]
  }

  return null
}

export function buildSelectedOpenQuestionHelpResponse(question: SelectedOpenQuestion): string {
  const options = boundedOptionsForOpenQuestion(question.question)
  if (!options) {
    return `${question.question}\n\nRecommended answer: ${recommendedDefaultForOpenQuestion(question.question)}`
  }

  return `${question.question}\n\nOptions:\n${options
    .map((option, index) => `${index + 1}. ${option}${index === 0 ? ' (Recommended)' : ''}`)
    .join('\n')}`
}
