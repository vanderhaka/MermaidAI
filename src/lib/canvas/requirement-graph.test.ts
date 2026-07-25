// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildRequirementGraph,
  findConflicts,
  REQUIREMENT_LINK_STYLE,
  REQUIREMENT_STATUS_COLOR,
} from '@/lib/canvas/requirement-graph'
import type { Module, Requirement, RequirementLink, RequirementNode } from '@/types/graph'

const timestamp = '2026-07-25T00:00:00Z'

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    project_id: 'project-1',
    module_id: 'checkout-module',
    statement: 'Guest checkout is supported.',
    kind: 'functional',
    status: 'agreed',
    coverage_area: 'Core transaction',
    source_question_id: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'checkout-module',
    project_id: 'project-1',
    domain: null,
    name: 'Checkout',
    description: null,
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#111827',
    entry_points: [],
    exit_points: [],
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function makeLink(overrides: Partial<RequirementLink> = {}): RequirementLink {
  return {
    id: 'link-1',
    source_requirement_id: 'req-1',
    target_requirement_id: 'req-2',
    kind: 'depends_on',
    created_at: timestamp,
    ...overrides,
  }
}

function makeRequirementNode(overrides: Partial<RequirementNode> = {}): RequirementNode {
  return {
    id: 'rn-1',
    requirement_id: 'req-1',
    node_id: 'screen-1',
    created_at: timestamp,
    ...overrides,
  }
}

describe('buildRequirementGraph', () => {
  it('groups requirements into columns by module', () => {
    const graph = buildRequirementGraph({
      requirements: [
        makeRequirement({ id: 'req-1' }),
        makeRequirement({ id: 'req-2' }),
        makeRequirement({ id: 'req-3', module_id: 'fulfilment-module' }),
      ],
      links: [],
      modules: [makeModule(), makeModule({ id: 'fulfilment-module', name: 'Fulfilment' })],
    })

    const checkout = graph.nodes.filter((n) => n.groupLabel === 'Checkout')
    const fulfilment = graph.nodes.filter((n) => n.groupLabel === 'Fulfilment')

    expect(checkout).toHaveLength(2)
    expect(fulfilment).toHaveLength(1)
    // Same group shares a column, different groups do not
    expect(checkout[0].position.x).toBe(checkout[1].position.x)
    expect(fulfilment[0].position.x).not.toBe(checkout[0].position.x)
    // Same group stacks vertically
    expect(checkout[0].position.y).not.toBe(checkout[1].position.y)
  })

  it('falls back to coverage area when a requirement has no module', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement({ module_id: null, coverage_area: 'Liability & compliance' })],
      links: [],
    })

    expect(graph.nodes[0].groupLabel).toBe('Liability & compliance')
  })

  it('falls back to Unassigned when there is neither', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement({ module_id: null, coverage_area: null })],
      links: [],
    })

    expect(graph.nodes[0].groupLabel).toBe('Unassigned')
  })

  it('carries traceability onto each requirement', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement()],
      links: [],
      requirementNodes: [
        makeRequirementNode(),
        makeRequirementNode({ id: 'rn-2', node_id: 'screen-2' }),
      ],
    })

    expect(graph.nodes[0].governs).toEqual(['screen-1', 'screen-2'])
  })

  it('carries blocking question counts', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement()],
      links: [],
      blockingQuestionCounts: { 'req-1': 3 },
    })

    expect(graph.nodes[0].blockedBy).toBe(3)
  })

  it('keeps links between present requirements', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement({ id: 'req-1' }), makeRequirement({ id: 'req-2' })],
      links: [makeLink()],
    })

    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toMatchObject({ source: 'req-1', target: 'req-2', kind: 'depends_on' })
  })

  it('drops links whose endpoint no longer exists, so no edge dangles', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement({ id: 'req-1' })],
      links: [makeLink()],
    })

    expect(graph.edges).toHaveLength(0)
  })

  it('returns an empty graph for no requirements', () => {
    expect(buildRequirementGraph({ requirements: [], links: [] })).toEqual({ nodes: [], edges: [] })
  })
})

describe('findConflicts', () => {
  it('surfaces both ends of a conflict', () => {
    const graph = buildRequirementGraph({
      requirements: [
        makeRequirement({ id: 'req-1', statement: 'Refunds within 14 days.' }),
        makeRequirement({ id: 'req-2', statement: 'Refunds within 30 days.' }),
        makeRequirement({ id: 'req-3', statement: 'Guest checkout supported.' }),
      ],
      links: [makeLink({ kind: 'conflicts_with' })],
    })

    const conflicts = findConflicts(graph).map((n) => n.id)

    expect(conflicts).toEqual(['req-1', 'req-2'])
  })

  it('ignores non-conflict links', () => {
    const graph = buildRequirementGraph({
      requirements: [makeRequirement({ id: 'req-1' }), makeRequirement({ id: 'req-2' })],
      links: [makeLink({ kind: 'depends_on' })],
    })

    expect(findConflicts(graph)).toEqual([])
  })
})

describe('visual vocabulary', () => {
  it('gives every status a distinct colour', () => {
    const colors = Object.values(REQUIREMENT_STATUS_COLOR)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('renders conflicts distinctly from dependencies', () => {
    expect(REQUIREMENT_LINK_STYLE.conflicts_with.stroke).not.toBe(
      REQUIREMENT_LINK_STYLE.depends_on.stroke,
    )
    expect(REQUIREMENT_LINK_STYLE.conflicts_with.dashed).toBe(true)
  })
})
