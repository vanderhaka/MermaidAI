// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260902050000_add_work_plan_undo.sql',
)

describe('Work Plan undo migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
  })

  it('validates Work Plan version references against the change-set project and artifact kind', () => {
    expect(sql).toMatch(
      /previous_work_plan_version_id[\s\S]*?project_id = new\.project_id[\s\S]*?kind = 'work_plan'/i,
    )
    expect(sql).toMatch(
      /committed_work_plan_version_id[\s\S]*?project_id = new\.project_id[\s\S]*?kind = 'work_plan'/i,
    )
  })

  it('locks the owned staged state, target change set, and active Work Plan', () => {
    expect(sql).toMatch(/projects\.user_id = \(select auth\.uid\(\)\)/i)
    expect(sql).toMatch(/states\.staged_workflow_enabled/i)
    expect(sql).toMatch(/from public\.planning_change_sets[\s\S]*?for update/i)
    expect(sql).toMatch(/from public\.planning_artifacts[\s\S]*?for update/i)
  })

  it('refuses a non-tip change and restores the immutable previous version atomically', () => {
    expect(sql).toMatch(/active_version_id is distinct from[\s\S]*?committed_work_plan_version_id/i)
    expect(sql).toMatch(/Work Plan change set is no longer the current tip/i)
    expect(sql).toMatch(/set active_version_id = target_change_set\.previous_work_plan_version_id/i)
    expect(sql).toMatch(/set state = 'undone'/i)
    expect(sql).toMatch(/'work_plan_undo_receipt', undo_receipt/i)
  })

  it('replays one exact undo identity without duplicating a version or message', () => {
    expect(sql).toMatch(/Undo change-set ID reused with different request content/i)
    expect(sql).toMatch(/jsonb_set\(existing_undo\.receipt, '\{replayed\}'/i)
    expect(sql).not.toMatch(/insert into public\.planning_artifact_versions/i)
  })

  it('exposes only the authenticated RPC', () => {
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/revoke execute on function public\.undo_latest_work_plan_change_set/i)
    expect(sql).toMatch(/grant execute on function public\.undo_latest_work_plan_change_set/i)
  })
})
