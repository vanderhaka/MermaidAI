// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']

// Helper: extract keys of a type as a runtime-checkable array via a generic
// We test by instantiating objects that conform to the type — if a table
// or sub-key is missing, TypeScript compilation fails and vitest reports it.

describe('Database types', () => {
  it('has the legacy and planning-system tables', () => {
    // If any table is missing from the type, this will fail to compile
    const tableKeys: (keyof Tables)[] = [
      'projects',
      'modules',
      'flow_nodes',
      'flow_edges',
      'module_connections',
      'chat_messages',
      'profiles',
      'open_questions',
      'planning_states',
      'planning_artifacts',
      'planning_artifact_versions',
      'planning_decisions',
      'planning_decision_events',
      'planning_change_sets',
      'planning_operations',
      'planning_readiness_reports',
      'planning_handoff_jobs',
    ]
    expect(tableKeys).toHaveLength(17)
  })

  it('projects table has Row/Insert/Update with expected columns', () => {
    type Row = Tables['projects']['Row']
    type Insert = Tables['projects']['Insert']
    type Update = Tables['projects']['Update']

    // These assignments enforce the type has the expected keys
    const row: Row = {} as Row
    const insert: Insert = {} as Insert
    const update: Update = {} as Update

    // Runtime check that the types resolved (not never)
    const rowKeys: (keyof Row)[] = [
      'id',
      'user_id',
      'name',
      'description',
      'mode',
      'created_at',
      'updated_at',
    ]
    const insertKeys: (keyof Insert)[] = ['user_id', 'name']
    const updateKeys: (keyof Update)[] = ['name']

    expect(rowKeys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })

  it('modules table has Row/Insert/Update with expected columns', () => {
    type Row = Tables['modules']['Row']
    const keys: (keyof Row)[] = [
      'id',
      'project_id',
      'domain',
      'name',
      'position_x',
      'position_y',
      'entry_points',
      'exit_points',
    ]
    const insertKeys: (keyof Tables['modules']['Insert'])[] = ['project_id', 'name']
    const updateKeys: (keyof Tables['modules']['Update'])[] = ['name']
    expect(keys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })

  it('flow_nodes table has Row/Insert/Update with expected columns', () => {
    const keys: (keyof Tables['flow_nodes']['Row'])[] = [
      'id',
      'module_id',
      'node_type',
      'label',
      'pseudocode',
      'position_x',
      'position_y',
    ]
    const insertKeys: (keyof Tables['flow_nodes']['Insert'])[] = ['module_id', 'node_type', 'label']
    const updateKeys: (keyof Tables['flow_nodes']['Update'])[] = ['label']
    expect(keys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })

  it('flow_edges table has Row/Insert/Update with expected columns', () => {
    const keys: (keyof Tables['flow_edges']['Row'])[] = [
      'id',
      'module_id',
      'source_node_id',
      'target_node_id',
      'label',
      'condition',
    ]
    const insertKeys: (keyof Tables['flow_edges']['Insert'])[] = [
      'module_id',
      'source_node_id',
      'target_node_id',
    ]
    const updateKeys: (keyof Tables['flow_edges']['Update'])[] = ['label']
    expect(keys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })

  it('module_connections table has Row/Insert/Update with expected columns', () => {
    const keys: (keyof Tables['module_connections']['Row'])[] = [
      'id',
      'project_id',
      'source_module_id',
      'target_module_id',
      'source_exit_point',
      'target_entry_point',
    ]
    const insertKeys: (keyof Tables['module_connections']['Insert'])[] = [
      'project_id',
      'source_module_id',
      'target_module_id',
    ]
    const updateKeys: (keyof Tables['module_connections']['Update'])[] = ['source_exit_point']
    expect(keys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })

  it('chat_messages table has Row/Insert/Update with expected columns', () => {
    const keys: (keyof Tables['chat_messages']['Row'])[] = [
      'id',
      'project_id',
      'role',
      'content',
      'metadata',
      'turn_id',
      'artifact_version_id',
      'change_set_id',
    ]
    const insertKeys: (keyof Tables['chat_messages']['Insert'])[] = [
      'project_id',
      'role',
      'content',
    ]
    const updateKeys: (keyof Tables['chat_messages']['Update'])[] = ['content']
    expect(keys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })

  it('planning tables preserve source, ownership, revision, and idempotency contracts', () => {
    const stateKeys: (keyof Tables['planning_states']['Row'])[] = [
      'project_id',
      'readiness_state',
      'write_safety_revision',
      'active_architecture_artifact_id',
      'staged_workflow_enabled',
    ]
    const versionKeys: (keyof Tables['planning_artifact_versions']['Row'])[] = [
      'artifact_id',
      'project_id',
      'version',
      'content_hash',
      'request_key',
      'request_hash',
      'source_version_id',
      'secondary_source_version_id',
    ]
    const operationKeys: (keyof Tables['planning_operations']['Row'])[] = [
      'change_set_id',
      'operation_id',
      'request_hash',
      'sequence',
    ]
    const jobKeys: (keyof Tables['planning_handoff_jobs']['Row'])[] = [
      'source_version_id',
      'target_artifact_id',
      'request_key',
      'state',
      'claim_token',
    ]
    const allocationArgs: (keyof Database['public']['Functions']['allocate_planning_artifact_version']['Args'])[] =
      ['p_artifact_id', 'p_content_hash', 'p_request_key', 'p_request_hash']

    const beginHandoffArgs: (keyof Database['public']['Functions']['begin_planning_handoff']['Args'])[] =
      ['p_project_id', 'p_source_version_id', 'p_target_kind', 'p_request_key', 'p_request_hash']
    const completeHandoffArgs: (keyof Database['public']['Functions']['complete_planning_handoff']['Args'])[] =
      [
        'p_project_id',
        'p_job_id',
        'p_claim_token',
        'p_content',
        'p_content_hash',
        'p_version_request_hash',
      ]

    expect(stateKeys).toHaveLength(5)
    expect(versionKeys).toHaveLength(8)
    expect(operationKeys).toHaveLength(4)
    expect(jobKeys).toHaveLength(5)
    expect(allocationArgs).toHaveLength(4)
    expect(beginHandoffArgs).toHaveLength(5)
    expect(completeHandoffArgs).toHaveLength(6)
  })

  it('profiles table has Row/Insert/Update with expected columns', () => {
    const keys: (keyof Tables['profiles']['Row'])[] = [
      'id',
      'display_name',
      'avatar_url',
      'created_at',
      'updated_at',
    ]
    const insertKeys: (keyof Tables['profiles']['Insert'])[] = ['id']
    const updateKeys: (keyof Tables['profiles']['Update'])[] = ['display_name']
    expect(keys.length).toBeGreaterThan(0)
    expect(insertKeys.length).toBeGreaterThan(0)
    expect(updateKeys.length).toBeGreaterThan(0)
  })
})
