// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260901233254_add_architecture_command_boundary.sql',
)

describe('Architecture command migration', () => {
  let sql: string
  let applySql: string
  let undoSql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
    const applyStart = sql.indexOf('create or replace function public.apply_architecture_command')
    const undoStart = sql.indexOf(
      'create or replace function public.undo_latest_architecture_change_set',
    )
    const grantsStart = sql.indexOf(
      'revoke execute on function public.validate_architecture_change_set_references',
    )
    applySql = sql.slice(applyStart, undoStart)
    undoSql = sql.slice(undoStart, grantsStart)
  })

  it('adds persisted command identity, receipts, undo links, and viewport state', () => {
    expect(sql).toMatch(/add column architecture_viewport jsonb not null/i)
    for (const column of [
      'request_hash',
      'request_payload',
      'receipt',
      'previous_architecture_version_id',
      'committed_architecture_version_id',
      'undo_target_change_set_id',
      'undone_by_change_set_id',
      'undone_at',
    ]) {
      expect(sql).toMatch(new RegExp(`add column ${column}\\b`, 'i'))
    }
  })

  it('locks one owned Architecture state before checking idempotency and revision', () => {
    expect(applySql).toMatch(/projects\.user_id\s*=\s*\(select auth\.uid\(\)\)/i)
    expect(applySql).toMatch(/projects\.mode\s*=\s*'architecture'/i)
    expect(applySql).toMatch(/for update of states/i)
    expect(applySql.indexOf('for update of states')).toBeLessThan(
      applySql.indexOf('select * into existing_change_set'),
    )
    expect(applySql.indexOf('select * into existing_change_set')).toBeLessThan(
      applySql.indexOf('locked_state.write_safety_revision <> p_expected_revision'),
    )
  })

  it('derives semantic classification from the finite operation type only', () => {
    expect(sql).toMatch(/planning_operations_architecture_type_check/i)
    expect(applySql).toMatch(/operation_is_semantic := operation_type in/i)
    expect(applySql).toMatch(/select exists[\s\S]*?into has_semantic_operation/i)
    expect(applySql).not.toMatch(/(?:operation|supplied)\s*->>\s*'semantic'/i)
  })

  it('stores cascade-safe snapshots and fails closed when a target is missing', () => {
    expect(applySql).toMatch(
      /'modules',[\s\S]*?'flow_nodes',[\s\S]*?'flow_edges',[\s\S]*?'module_connections',[\s\S]*?'open_questions'/i,
    )
    expect(applySql).toMatch(/coalesce\(jsonb_agg\(to_jsonb\(modules\)\),\s*'\[\]'::jsonb\)/i)
    expect(applySql).toMatch(/jsonb_array_length\(before_snapshot -> 'modules'\) = 0/i)
    expect(applySql).toMatch(/Module not found for %/i)
  })

  it('advances the write revision once and versions semantic work only', () => {
    expect(applySql.match(/set write_safety_revision\s*=/gi)).toHaveLength(1)
    expect(applySql).toMatch(
      /if has_semantic_operation then[\s\S]*?insert into public\.planning_artifact_versions/i,
    )
    expect(applySql).toMatch(
      /else[\s\S]*?from public\.planning_artifact_versions[\s\S]*?where id = previous_architecture_version_id/i,
    )
    expect(applySql).toMatch(/receipt = committed_receipt/i)
    expect(applySql).toMatch(/return committed_receipt/i)
  })

  it('undoes only the current tip in reverse operation order and restores its prior version', () => {
    expect(undoSql).toMatch(
      /target_change_set\.committed_revision <> locked_state\.write_safety_revision/i,
    )
    expect(undoSql).toMatch(/order by sequence desc/i)
    expect(undoSql).toMatch(
      /set active_version_id = target_change_set\.previous_architecture_version_id/i,
    )
    expect(undoSql.match(/set write_safety_revision\s*=/gi)).toHaveLength(1)
    expect(undoSql).toMatch(/state = 'undone'/i)
    expect(undoSql).toMatch(/return undo_receipt/i)
  })

  it('exposes only the two authenticated RPCs and the exact invoker delete needed by undo', () => {
    expect(sql).toMatch(
      /revoke execute on function public\.apply_architecture_command\([\s\S]*?\) from public, anon;/i,
    )
    expect(sql).toMatch(
      /revoke execute on function public\.undo_latest_architecture_change_set\([\s\S]*?\) from public, anon;/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.apply_architecture_command\([\s\S]*?\) to authenticated;/i,
    )
    expect(sql).toMatch(/grant delete on table public\.planning_decisions to authenticated;/i)
  })
})
