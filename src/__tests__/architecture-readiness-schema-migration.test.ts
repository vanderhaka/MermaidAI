// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260902053000_version_architecture_readiness_reports.sql',
)

describe('Architecture readiness schema-version migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8')
  })

  it('keeps immutable reports distinct by source revision and evaluator schema', () => {
    expect(sql).toMatch(/add column schema_version integer not null default 1/i)
    expect(sql).toMatch(
      /drop constraint if exists planning_readiness_reports_project_id_architecture_version__key/i,
    )
    expect(sql).toMatch(
      /unique \(project_id, architecture_version_id, evaluated_revision, schema_version\)/i,
    )
    expect(sql).toMatch(/schema_version = requested_schema_version/i)
    expect(sql).toMatch(/requested_schema_version is distinct from 2/i)
  })

  it('validates and persists the complete version-two readiness contract', () => {
    expect(sql).toMatch(/jsonb_array_length\(p_report -> 'checks'\) <> 8/i)
    expect(sql).toMatch(/evaluated_revision, schema_version,[\s\S]*state, report, report_hash/i)
    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/i)
  })
})
