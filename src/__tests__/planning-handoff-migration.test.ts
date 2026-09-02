// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260902024500_add_planning_handoff_lifecycle.sql',
)

describe('planning handoff lifecycle migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
  })

  it('persists the rollout discriminator and marks initializer calls durably staged', () => {
    expect(sql).toMatch(
      /add column if not exists staged_workflow_enabled boolean not null default false/i,
    )
    expect(sql).toMatch(
      /insert into public\.planning_states \(project_id, staged_workflow_enabled\)/i,
    )
    expect(sql).toMatch(
      /on conflict \(project_id\) do update[\s\S]*staged_workflow_enabled = true/i,
    )
  })

  it('deduplicates one target per immutable source even across different retries', () => {
    expect(sql).toMatch(
      /create unique index if not exists planning_handoff_jobs_source_target_unique[\s\S]*project_id, source_version_id, target_artifact_id/i,
    )
    expect(sql).toMatch(
      /on conflict \(project_id, source_version_id, target_artifact_id\) do update/i,
    )
    expect(sql).toMatch(/existing_job\.request_hash is distinct from p_request_hash/i)
  })

  it('requires an owned complete active source and a valid stage transition', () => {
    expect(sql).toMatch(/projects[\s\S]*user_id = \(select auth\.uid\(\)\)/i)
    expect(sql).toMatch(/source_state <> 'complete'/i)
    expect(sql).toMatch(/Invalid planning handoff source and target/i)
    expect(sql).toMatch(/states\.staged_workflow_enabled/i)
    expect(sql).toMatch(/active_source\.active_version_id = p_source_version_id/i)
  })

  it('uses bounded expiring claims and does not disclose another worker lease token', () => {
    expect(sql).toMatch(/claim_expires_at > claimed_at_value/i)
    expect(sql).toMatch(/least\(greatest\(p_lease_seconds, 15\), 600\)/i)
    expect(sql).toMatch(/'outcome', 'busy'[\s\S]*jsonb_build_object\('claim_token', null\)/i)
    expect(sql).toMatch(/'outcome', 'claimed'/i)
  })

  it('commits the immutable version, active pointer, stage, and job in one RPC', () => {
    const completeStart = sql.indexOf('create or replace function public.complete_planning_handoff')
    const failStart = sql.indexOf('create or replace function public.fail_planning_handoff')
    const completeSql = sql.slice(completeStart, failStart)

    expect(completeSql).toMatch(/for update/i)
    expect(completeSql).toMatch(/insert into public\.planning_artifact_versions/i)
    expect(completeSql).toMatch(/set active_version_id = completed_version\.id/i)
    expect(completeSql).toMatch(/set[\s\S]*stage = 'work_plan'/i)
    expect(completeSql).toMatch(/set[\s\S]*stage = 'execution_handoff'/i)
    expect(completeSql).toMatch(/state = 'complete'/i)
    expect(completeSql).toMatch(/claim_token = null/i)
  })

  it('exposes only owned lifecycle RPCs and blocks direct job mutation', () => {
    for (const fn of [
      'begin_planning_handoff',
      'claim_planning_handoff',
      'complete_planning_handoff',
      'fail_planning_handoff',
    ]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\(`, 'i'))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(`, 'i'))
    }
    expect(sql).toMatch(
      /revoke insert, update on table public\.planning_handoff_jobs from authenticated/i,
    )
  })
})
