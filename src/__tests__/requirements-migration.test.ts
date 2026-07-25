// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260725000000_add_requirements_and_decouple_questions.sql',
)

describe('requirements migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(MIGRATION_PATH, 'utf-8')
  })

  describe('decoupling open_questions from its marker node', () => {
    it('drops the NOT NULL constraint on node_id', () => {
      expect(sql).toMatch(/alter\s+column\s+node_id\s+drop\s+not\s+null/i)
    })

    it('replaces the cascading node FK with ON DELETE SET NULL', () => {
      expect(sql).toMatch(/drop\s+constraint\s+if\s+exists\s+open_questions_node_id_fkey/i)
      expect(sql).toMatch(
        /foreign\s+key\s+\(node_id\)\s+references\s+public\.flow_nodes\(id\)\s+on\s+delete\s+set\s+null/i,
      )
    })

    it('never re-introduces a cascade from flow_nodes onto open_questions', () => {
      const nodeFkClause = sql.match(/foreign\s+key\s+\(node_id\)[^;]*/i)?.[0] ?? ''
      expect(nodeFkClause.toLowerCase()).not.toContain('cascade')
    })

    it('adds module_id so a question survives its marker', () => {
      expect(sql).toMatch(
        /add\s+column\s+if\s+not\s+exists\s+module_id\s+uuid\s+references\s+public\.modules\(id\)/i,
      )
    })

    it('backfills module_id from the marker node before the constraint changes', () => {
      const backfillIndex = sql.search(/update\s+open_questions\s+set\s+module_id/i)
      const dropIndex = sql.search(/alter\s+column\s+node_id\s+drop\s+not\s+null/i)
      expect(backfillIndex).toBeGreaterThan(-1)
      expect(backfillIndex).toBeLessThan(dropIndex)
    })
  })

  describe('requirements table', () => {
    it('creates the table', () => {
      expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.requirements/i)
    })

    it('cascades from projects and modules', () => {
      expect(sql).toMatch(
        /project_id\s+uuid\s+not\s+null\s+references\s+public\.projects\(id\)\s+on\s+delete\s+cascade/i,
      )
      expect(sql).toMatch(
        /module_id\s+uuid\s+references\s+public\.modules\(id\)\s+on\s+delete\s+cascade/i,
      )
    })

    it('keeps the source question link nullable and non-cascading', () => {
      expect(sql).toMatch(
        /source_question_id\s+uuid\s+references\s+public\.open_questions\(id\)\s+on\s+delete\s+set\s+null/i,
      )
    })

    it('constrains kind and status', () => {
      expect(sql).toMatch(
        /check\s*\(kind\s+in\s*\('functional',\s*'rule',\s*'constraint',\s*'non_functional'\)\)/i,
      )
      expect(sql).toMatch(
        /check\s*\(status\s+in\s*\('proposed',\s*'agreed',\s*'disputed',\s*'out_of_scope'\)\)/i,
      )
    })

    it('enables RLS with a policy for every operation', () => {
      expect(sql).toMatch(/alter\s+table\s+public\.requirements\s+enable\s+row\s+level\s+security/i)
      for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(sql).toMatch(new RegExp(`on\\s+public\\.requirements\\s+for\\s+${op}`, 'i'))
      }
    })

    it('scopes every policy to the owning user', () => {
      const policies = sql.match(/create\s+policy[\s\S]*?;/gi) ?? []
      expect(policies.length).toBeGreaterThanOrEqual(4)
      for (const policy of policies) {
        expect(policy).toMatch(/projects\.user_id::text\s*=\s*auth\.uid\(\)::text/i)
      }
    })

    it('uses the existing updated_at trigger function', () => {
      expect(sql).toMatch(/execute\s+function\s+public\.set_updated_at\(\)/i)
    })
  })
})
