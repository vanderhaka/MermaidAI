// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260902033000_add_work_plan_refinement.sql',
)

describe('Work Plan refinement migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
  })

  it('records the previous and committed immutable Work Plan versions', () => {
    expect(sql).toMatch(/add column previous_work_plan_version_id uuid/i)
    expect(sql).toMatch(/add column committed_work_plan_version_id uuid/i)
    expect(sql).toMatch(/previous_work_plan_version_id, committed_work_plan_version_id/i)
  })

  it('locks and rejects a stale active Work Plan or Architecture source', () => {
    expect(sql).toMatch(/from public\.planning_states[\s\S]*for update/i)
    expect(sql).toMatch(/from public\.planning_artifacts[\s\S]*for update/i)
    expect(sql).toMatch(/Work Plan changed while this refinement was running/i)
    expect(sql).toMatch(/Work Plan Architecture source is no longer current/i)
  })

  it('commits version, active pointer, change set, and assistant receipt together', () => {
    const functionSql = sql.slice(sql.indexOf('create or replace function'))
    expect(functionSql).toMatch(/insert into public\.planning_artifact_versions/i)
    expect(functionSql).toMatch(/set active_version_id = committed_version\.id/i)
    expect(functionSql).toMatch(/insert into public\.planning_change_sets/i)
    expect(functionSql).toMatch(/insert into public\.chat_messages/i)
    expect(functionSql).toMatch(/'work_plan_receipt', receipt/i)
  })

  it('replays an identical committed change set without another insert', () => {
    expect(sql).toMatch(/existing_change_set\.request_hash is distinct from p_request_hash/i)
    expect(sql).toMatch(/existing_change_set\.request_payload is distinct from p_request_payload/i)
    expect(sql).toMatch(/jsonb_set\(existing_change_set\.receipt, '\{replayed\}'/i)
  })

  it('exposes only the owned RPC', () => {
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/user_id = \(select auth\.uid\(\)\)/i)
    expect(sql).toMatch(/revoke execute on function public\.commit_work_plan_revision/i)
    expect(sql).toMatch(/grant execute on function public\.commit_work_plan_revision/i)
  })
})
