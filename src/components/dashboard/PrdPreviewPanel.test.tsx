// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PrdPreviewPanel from '@/components/dashboard/PrdPreviewPanel'
import { downloadMarkdown } from '@/lib/prd-download'
import { generateSinglePrd } from '@/lib/services/prd-export-service'
import type { ArchitectureReadinessReport } from '@/lib/services/architecture-readiness'
import type { ArchitecturePlanningView } from '@/types/planning-ui'

vi.mock('@/lib/services/prd-export-service', () => ({
  generateSinglePrd: vi.fn(() => '# Legacy PRD\n\nLegacy flowchart content.'),
  generatePrdFiles: vi.fn(() => []),
}))
vi.mock('@/lib/prd-download', () => ({
  downloadMarkdown: vi.fn(),
  downloadPrdZip: vi.fn(),
}))
vi.mock('@/store/graph-store', () => ({
  useGraphStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      modules: [],
      nodes: [],
      edges: [],
      connections: [],
      openQuestions: [],
    }),
}))

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const VERSION_ID = '22222222-2222-4222-8222-222222222222'

function readiness(
  overrides: Partial<ArchitectureReadinessReport> = {},
): ArchitectureReadinessReport {
  return {
    schemaVersion: 2,
    projectId: PROJECT_ID,
    architectureVersionId: VERSION_ID,
    architectureVersion: 2,
    architectureContentHash: 'hash-v2',
    evaluatedRevision: 8,
    state: 'ready',
    freshness: 'current',
    handoffEligible: true,
    checks: [],
    reasons: [],
    blockingQuestionIds: [],
    nonBlockingQuestionIds: [],
    deferredQuestionIds: [],
    proposedDecisionIds: [],
    acceptedDecisionIds: [],
    supersededDecisionIds: [],
    invalidInputIds: [],
    staleInputIds: [],
    ...overrides,
  }
}

function planning(overrides: Partial<ArchitecturePlanningView> = {}): ArchitecturePlanningView {
  return {
    expectedRevision: 8,
    autoDecideEnabled: true,
    version: {
      id: VERSION_ID,
      artifactId: '33333333-3333-4333-8333-333333333333',
      version: 2,
      contentHash: 'hash-v2',
      contentState: 'complete',
      content: {
        objective: 'Coordinate appointment bookings.',
        outcomes: ['Customers receive a confirmed time.'],
        actors: ['Customer'],
        capabilities: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Booking',
            purpose: 'Own booking confirmation.',
            responsibilities: ['Confirm an available time'],
            boundaries: ['Does not process payment'],
          },
        ],
        connections: [],
        important_flows: [
          {
            id: 'customer-books',
            actor: 'Customer',
            outcome: 'Customers receive a confirmed time.',
            capability_ids: ['44444444-4444-4444-8444-444444444444'],
          },
        ],
        assumptions: [],
        blockers: [],
      },
    },
    readinessReport: readiness(),
    decisions: [],
    ...overrides,
  }
}

describe('PrdPreviewPanel staged Architecture Brief', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the legacy PRD path unchanged when planning data is absent', () => {
    render(
      <PrdPreviewPanel projectName="Bookings" projectDescription={null} isOpen onClose={vi.fn()} />,
    )

    expect(screen.getByRole('dialog', { name: 'PRD Preview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Product Requirements' })).toBeInTheDocument()
    expect(screen.getByText('Legacy flowchart content.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download PRD' })).toBeInTheDocument()
    expect(generateSinglePrd).toHaveBeenCalledTimes(1)
  })

  it('renders and downloads the Brief from the exact handoff-eligible active version', async () => {
    const user = userEvent.setup()
    render(
      <PrdPreviewPanel
        projectName="Bookings"
        projectDescription={null}
        isOpen
        onClose={vi.fn()}
        architecturePlanning={planning()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Architecture Brief Preview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Architecture Brief' })).toBeInTheDocument()
    expect(screen.getAllByText(/Architecture v2/).length).toBeGreaterThan(0)
    expect(screen.getByText('Coordinate appointment bookings.')).toBeInTheDocument()
    expect(screen.queryByText('Legacy flowchart content.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Download Architecture Brief' }))
    expect(downloadMarkdown).toHaveBeenCalledWith(
      expect.stringContaining('Architecture v2'),
      'bookings-architecture-v2.md',
    )
  })

  it('explains an unevaluated draft and does not offer a misleading download', () => {
    render(
      <PrdPreviewPanel
        projectName="Bookings"
        projectDescription={null}
        isOpen
        onClose={vi.fn()}
        architecturePlanning={planning({
          version: {
            id: VERSION_ID,
            artifactId: '33333333-3333-4333-8333-333333333333',
            version: 1,
            contentHash: 'draft',
            contentState: 'draft',
            content: null,
          },
          readinessReport: null,
        })}
      />,
    )

    expect(screen.getByText(/generate the first architecture map/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download architecture brief/i })).toBeNull()
  })

  it('shows exact missing-readiness guidance and withholds download until committed readiness', () => {
    render(
      <PrdPreviewPanel
        projectName="Bookings"
        projectDescription={null}
        isOpen
        onClose={vi.fn()}
        architecturePlanning={planning({
          readinessReport: readiness({
            state: 'needs_input',
            handoffEligible: false,
            reasons: ['Connect Booking to Notifications.', 'Choose the cancellation owner.'],
          }),
        })}
      />,
    )

    expect(screen.getAllByText('Connect Booking to Notifications.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Choose the cancellation owner.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /download architecture brief/i })).toBeNull()
  })

  it('requires refresh when the report is stale instead of exporting it as current', () => {
    render(
      <PrdPreviewPanel
        projectName="Bookings"
        projectDescription={null}
        isOpen
        onClose={vi.fn()}
        architecturePlanning={planning({
          readinessReport: readiness({ freshness: 'stale', handoffEligible: false }),
        })}
      />,
    )

    expect(screen.getByText(/readiness report is stale/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download architecture brief/i })).toBeNull()
  })
})
