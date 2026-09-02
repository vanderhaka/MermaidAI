// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260902011235_add_architecture_readiness_and_decision_evidence.sql',
)

describe('Architecture readiness and decision evidence migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
  })

  it('adds first-class readiness impact, transition evidence, and immutable exact reports', () => {
    expect(sql).toMatch(/add column readiness_impact text not null default 'non_blocking'/i)
    expect(sql).toMatch(/create table public\.planning_decision_events/i)
    expect(sql).toMatch(/actor_type text not null/i)
    expect(sql).toMatch(/reason text not null/i)
    expect(sql).toMatch(/evidence jsonb not null/i)
    expect(sql).toMatch(/create table public\.planning_readiness_reports/i)
    expect(sql).toMatch(/unique \(project_id, architecture_version_id, evaluated_revision\)/i)
    expect(sql).toMatch(/planning_readiness_reports_immutable/i)
  })

  it('keeps review rows owner-readable and mutation RPCs least-privileged', () => {
    for (const table of ['planning_decision_events', 'planning_readiness_reports']) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      )
      expect(sql).toMatch(new RegExp(`on public\\.${table} for select to authenticated`, 'i'))
    }
    expect(sql).toMatch(
      /revoke all on table public\.planning_decision_events, public\.planning_readiness_reports[\s\S]*?from public, anon, authenticated/i,
    )
    expect(sql).toMatch(/revoke insert, update, delete on table public\.planning_decisions/i)
    expect(sql).toMatch(/security definer[\s\S]*?set search_path = ''/i)
  })

  it('wraps the atomic command so provisional captures get exact versioned, reviewable evidence', () => {
    expect(sql).toMatch(/planning_private\.apply_architecture_command_base/i)
    expect(sql).toMatch(/set artifact_version_id = committed_version_id/i)
    expect(sql).toMatch(/set readiness_impact = desired_readiness_impact/i)
    expect(sql).toMatch(/insert into public\.planning_decision_events/i)
    expect(sql).toContain(
      'Inferred during provisional Architecture capture and remains reviewable.',
    )
    expect(sql).toContain('has not been accepted by the user')
    expect(sql).toMatch(/planningInputLinksBefore/i)
  })

  it('restores decision evidence and version links on latest-safe undo', () => {
    expect(sql).toMatch(/planning_private\.undo_latest_architecture_change_set_base/i)
    expect(sql).toMatch(/set readiness_impact = before_row ->> 'readiness_impact'/i)
    expect(sql).toMatch(/set undone_by_change_set_id = p_undo_change_set_id/i)
    expect(sql).toMatch(/target_receipt -> 'planningInputLinksBefore'/i)
  })

  it('persists project Auto-Decide and exact current readiness with revision protection', () => {
    expect(sql).toMatch(/function public\.set_planning_auto_decide/i)
    expect(sql).toMatch(/write_safety_revision = locked_state\.write_safety_revision \+ 1/i)
    expect(sql).toMatch(/function public\.persist_architecture_readiness_report/i)
    expect(sql).toMatch(/for update/i)
    expect(sql).toMatch(/versions\.id = p_architecture_version_id/i)
    expect(sql).toMatch(/p_report ->> 'architectureContentHash'.*active_version\.content_hash/i)
  })
})
