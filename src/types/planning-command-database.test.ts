// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Database } from '@/types/database'

describe('Architecture command database types', () => {
  it('includes command receipt, undo, version, and viewport columns', () => {
    type ChangeSet = Database['public']['Tables']['planning_change_sets']['Row']
    type PlanningState = Database['public']['Tables']['planning_states']['Row']

    const changeSetKeys: (keyof ChangeSet)[] = [
      'request_hash',
      'request_payload',
      'receipt',
      'previous_architecture_version_id',
      'committed_architecture_version_id',
      'undo_target_change_set_id',
      'undone_by_change_set_id',
      'undone_at',
    ]
    const stateKeys: (keyof PlanningState)[] = ['architecture_viewport']

    expect(changeSetKeys).toHaveLength(8)
    expect(stateKeys).toEqual(['architecture_viewport'])
  })

  it('types the atomic command and latest-safe undo RPCs', () => {
    type Functions = Database['public']['Functions']
    const applyArgs: (keyof Functions['apply_architecture_command']['Args'])[] = [
      'p_project_id',
      'p_change_set_id',
      'p_turn_id',
      'p_expected_revision',
      'p_request_hash',
      'p_operations',
      'p_architecture_content',
      'p_architecture_content_hash',
    ]
    const undoArgs: (keyof Functions['undo_latest_architecture_change_set']['Args'])[] = [
      'p_project_id',
      'p_target_change_set_id',
      'p_undo_change_set_id',
      'p_request_hash',
    ]

    expect(applyArgs).toHaveLength(8)
    expect(undoArgs).toHaveLength(4)
  })
})
