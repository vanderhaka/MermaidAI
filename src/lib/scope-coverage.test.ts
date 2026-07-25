// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  computeCoverage,
  coverageProgress,
  renderCoverageAreasForPrompt,
  SCOPE_COVERAGE_AREAS,
} from '@/lib/scope-coverage'
import type { OpenQuestion, Requirement } from '@/types/graph'

const timestamp = '2026-07-25T00:00:00Z'

function makeQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'oq-1',
    project_id: 'project-1',
    module_id: 'module-1',
    node_id: 'node-1',
    section: 'Money',
    question: 'When is payment captured?',
    status: 'open',
    resolution: null,
    coverage_area: 'Money',
    created_at: timestamp,
    resolved_at: null,
    ...overrides,
  }
}

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    project_id: 'project-1',
    module_id: 'module-1',
    statement: 'Payment is captured at booking.',
    kind: 'rule',
    status: 'agreed',
    coverage_area: 'Money',
    source_question_id: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

describe('SCOPE_COVERAGE_AREAS', () => {
  it('is the single source of truth for the eleven areas', () => {
    expect(SCOPE_COVERAGE_AREAS).toHaveLength(11)
  })

  it('renders for the prompt with names and hints', () => {
    const rendered = renderCoverageAreasForPrompt()

    expect(rendered).toContain(
      '1. **Actors & roles** — every user/system type and what each can do',
    )
    expect(rendered).toContain('11. **Liability & compliance**')
    expect(rendered.split('\n')).toHaveLength(11)
  })
})

describe('computeCoverage', () => {
  it('starts every area untouched', () => {
    const segments = computeCoverage([], [])

    expect(segments).toHaveLength(11)
    expect(segments.every((s) => s.status === 'untouched')).toBe(true)
  })

  it('marks an area with open questions as open, with a count', () => {
    const segments = computeCoverage(
      [makeQuestion(), makeQuestion({ id: 'oq-2', question: 'Refund window?' })],
      [],
    )
    const money = segments.find((s) => s.name === 'Money')!

    expect(money.status).toBe('open')
    expect(money.openCount).toBe(2)
  })

  it('marks an area with agreed requirements and no open questions as covered', () => {
    const segments = computeCoverage([], [makeRequirement()])
    const money = segments.find((s) => s.name === 'Money')!

    expect(money.status).toBe('covered')
    expect(money.requirementCount).toBe(1)
  })

  it('marks an area covered once its questions are resolved', () => {
    const segments = computeCoverage([makeQuestion({ status: 'resolved' })], [])

    expect(segments.find((s) => s.name === 'Money')!.status).toBe('covered')
  })

  it('keeps an area open while any question is unresolved, even with requirements', () => {
    const segments = computeCoverage([makeQuestion()], [makeRequirement()])

    expect(segments.find((s) => s.name === 'Money')!.status).toBe('open')
  })

  it('falls back to section when coverage_area is not set', () => {
    const segments = computeCoverage(
      [makeQuestion({ coverage_area: null, section: 'Failure modes' })],
      [],
    )

    expect(segments.find((s) => s.name === 'Failure modes')!.status).toBe('open')
    expect(segments.find((s) => s.name === 'Money')!.status).toBe('untouched')
  })

  it('matches area names case-insensitively', () => {
    const segments = computeCoverage([makeQuestion({ coverage_area: 'money' })], [])

    expect(segments.find((s) => s.name === 'Money')!.status).toBe('open')
  })

  it('ignores records whose area matches nothing', () => {
    const segments = computeCoverage([makeQuestion({ coverage_area: 'Nonsense' })], [])

    expect(segments.every((s) => s.status === 'untouched')).toBe(true)
  })
})

describe('coverageProgress', () => {
  it('reports covered out of total', () => {
    const segments = computeCoverage([], [makeRequirement()])

    expect(coverageProgress(segments)).toEqual({ covered: 1, total: 11 })
  })

  it('does not count open areas as covered', () => {
    const segments = computeCoverage([makeQuestion()], [])

    expect(coverageProgress(segments).covered).toBe(0)
  })
})
