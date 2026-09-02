// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Database } from '@/types/database'

describe('Planning review database types', () => {
  it('includes immutable readiness and decision-event evidence shapes', () => {
    type Tables = Database['public']['Tables']
    const decisionKeys: (keyof Tables['planning_decisions']['Row'])[] = ['readiness_impact']
    const eventKeys: (keyof Tables['planning_decision_events']['Row'])[] = [
      'decision_id',
      'architecture_version_id',
      'change_set_id',
      'from_state',
      'to_state',
      'actor_type',
      'actor_user_id',
      'actor_label',
      'reason',
      'evidence',
      'undone_by_change_set_id',
    ]
    const reportKeys: (keyof Tables['planning_readiness_reports']['Row'])[] = [
      'architecture_version_id',
      'evaluated_revision',
      'schema_version',
      'state',
      'report',
      'report_hash',
    ]

    expect(decisionKeys).toEqual(['readiness_impact'])
    expect(eventKeys).toHaveLength(11)
    expect(reportKeys).toHaveLength(6)
  })

  it('types revision-protected Auto-Decide and readiness persistence RPCs', () => {
    type Functions = Database['public']['Functions']
    const autoDecideArgs: (keyof Functions['set_planning_auto_decide']['Args'])[] = [
      'p_project_id',
      'p_enabled',
      'p_expected_revision',
    ]
    const readinessArgs: (keyof Functions['persist_architecture_readiness_report']['Args'])[] = [
      'p_project_id',
      'p_architecture_version_id',
      'p_evaluated_revision',
      'p_report',
    ]

    expect(autoDecideArgs).toHaveLength(3)
    expect(readinessArgs).toHaveLength(4)
  })
})
