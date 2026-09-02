// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260902041500_add_scope_architecture_handoff.sql',
)

describe('Quick Capture Architecture handoff migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
  })

  it('freezes a bounded source snapshot and deduplicates it durably', () => {
    expect(sql).toMatch(/source_snapshot jsonb not null/i)
    expect(sql).toMatch(/unique \(project_id, request_key\)/i)
    expect(sql).toMatch(/unique \(project_id, source_hash\)/i)
    expect(sql).toMatch(/left\(messages\.content, 16000\)/i)
    expect(sql).toMatch(/limit 20/i)
  })

  it('uses an expiring claim so a reload or later request can recover the job', () => {
    expect(sql).toMatch(/state in \('pending', 'running', 'complete', 'failed'\)/i)
    expect(sql).toMatch(/claim_expires_at > claimed_at_value/i)
    expect(sql).toMatch(/least\(greatest\(p_lease_seconds, 15\), 600\)/i)
    expect(sql).toMatch(/'outcome', 'busy'/i)
    expect(sql).toMatch(/'outcome', 'complete'/i)
  })

  it('checks the live source hash before switching or deleting the intake canvas', () => {
    const completeSql = sql.slice(
      sql.indexOf('create or replace function public.complete_scope_architecture_handoff'),
      sql.indexOf('create or replace function public.fail_scope_architecture_handoff'),
    )
    const hashCheck = completeSql.indexOf('current_hash is distinct from job_row.source_hash')
    const deleteCanvas = completeSql.indexOf('delete from public.modules')
    const switchMode = completeSql.indexOf("mode = 'architecture'")

    expect(hashCheck).toBeGreaterThan(0)
    expect(deleteCanvas).toBeGreaterThan(hashCheck)
    expect(switchMode).toBeGreaterThan(hashCheck)
  })

  it('commits mode, staged state, Architecture command, job, and receipt transactionally', () => {
    const completeSql = sql.slice(
      sql.indexOf('create or replace function public.complete_scope_architecture_handoff'),
      sql.indexOf('create or replace function public.fail_scope_architecture_handoff'),
    )
    expect(completeSql).toMatch(/update public\.projects set mode = 'architecture'/i)
    expect(completeSql).toMatch(/initialize_architecture_planning_state/i)
    expect(completeSql).toMatch(/apply_architecture_command/i)
    expect(completeSql).toMatch(/state = 'complete'/i)
    expect(completeSql).toMatch(/insert into public\.chat_messages/i)
  })

  it('allows owned reads while blocking direct job mutation and private snapshots', () => {
    expect(sql).toMatch(/scope_architecture_handoff_jobs_owner_select/i)
    expect(sql).toMatch(
      /revoke insert, update, delete on table public\.scope_architecture_handoff_jobs from authenticated/i,
    )
    expect(sql).toMatch(
      /revoke execute on function public\.capture_scope_handoff_snapshot\(uuid\) from public, anon, authenticated/i,
    )
    for (const fn of [
      'begin_scope_architecture_handoff',
      'claim_scope_architecture_handoff',
      'complete_scope_architecture_handoff',
      'fail_scope_architecture_handoff',
    ]) {
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(`, 'i'))
    }
  })
})
