// @vitest-environment node
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260406000000_create_core_tables.sql',
)

const TABLES = [
  'profiles',
  'projects',
  'modules',
  'flow_nodes',
  'flow_edges',
  'module_connections',
  'chat_messages',
] as const

describe('Core tables migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(MIGRATION_PATH, 'utf-8')
  })

  describe('CREATE TABLE statements', () => {
    it.each(TABLES)('creates the %s table', (table) => {
      const pattern = new RegExp(
        `create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${table}`,
        'i',
      )
      expect(sql).toMatch(pattern)
    })
  })

  describe('Foreign keys', () => {
    it('projects.user_id references auth.users', () => {
      expect(sql).toMatch(/user_id\s+uuid\s+.*references\s+auth\.users/is)
    })

    it('modules.project_id references projects with CASCADE', () => {
      expect(sql).toMatch(
        /project_id\s+uuid\s+.*references\s+(public\.)?projects.*on\s+delete\s+cascade/is,
      )
    })

    it('flow_nodes.module_id references modules with CASCADE', () => {
      expect(sql).toMatch(
        /module_id\s+uuid\s+.*references\s+(public\.)?modules.*on\s+delete\s+cascade/is,
      )
    })

    it('flow_edges.module_id references modules with CASCADE', () => {
      // flow_edges has module_id, source_node_id, target_node_id
      const edgesSection = sql
        .substring(sql.search(/create\s+table.*flow_edges/i))
        .substring(0, sql.substring(sql.search(/create\s+table.*flow_edges/i)).indexOf(');') + 2)

      expect(edgesSection).toMatch(
        /module_id\s+uuid\s+.*references\s+(public\.)?modules.*on\s+delete\s+cascade/is,
      )
    })

    it('flow_edges.source_node_id references flow_nodes with CASCADE', () => {
      expect(sql).toMatch(
        /source_node_id\s+uuid\s+.*references\s+(public\.)?flow_nodes.*on\s+delete\s+cascade/is,
      )
    })

    it('flow_edges.target_node_id references flow_nodes with CASCADE', () => {
      expect(sql).toMatch(
        /target_node_id\s+uuid\s+.*references\s+(public\.)?flow_nodes.*on\s+delete\s+cascade/is,
      )
    })

    it('module_connections.project_id references projects with CASCADE', () => {
      const mcSection = sql
        .substring(sql.search(/create\s+table.*module_connections/i))
        .substring(
          0,
          sql.substring(sql.search(/create\s+table.*module_connections/i)).indexOf(');') + 2,
        )

      expect(mcSection).toMatch(
        /project_id\s+uuid\s+.*references\s+(public\.)?projects.*on\s+delete\s+cascade/is,
      )
    })

    it('module_connections references source and target modules', () => {
      expect(sql).toMatch(/source_module_id\s+uuid\s+.*references\s+(public\.)?modules/is)
      expect(sql).toMatch(/target_module_id\s+uuid\s+.*references\s+(public\.)?modules/is)
    })

    it('chat_messages.project_id references projects with CASCADE', () => {
      const cmSection = sql
        .substring(sql.search(/create\s+table.*chat_messages/i))
        .substring(0, sql.substring(sql.search(/create\s+table.*chat_messages/i)).indexOf(');') + 2)

      expect(cmSection).toMatch(
        /project_id\s+uuid\s+.*references\s+(public\.)?projects.*on\s+delete\s+cascade/is,
      )
    })

    it('profiles.id references auth.users with CASCADE', () => {
      expect(sql).toMatch(
        /profiles[\s\S]*?id\s+uuid\s+.*references\s+auth\.users.*on\s+delete\s+cascade/is,
      )
    })
  })

  describe('RLS policies', () => {
    it.each(TABLES)('enables RLS on %s', (table) => {
      const pattern = new RegExp(
        `alter\\s+table\\s+(public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`,
        'i',
      )
      expect(sql).toMatch(pattern)
    })

    it('creates at least one policy per table', () => {
      for (const table of TABLES) {
        const pattern = new RegExp(`create\\s+policy\\s+[\\s\\S]*?on\\s+(public\\.)?${table}`, 'i')
        expect(sql).toMatch(pattern)
      }
    })
  })

  describe('Profile trigger', () => {
    it('defines the handle_new_user trigger function', () => {
      expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+.*handle_new_user/i)
    })

    it('creates a trigger on auth.users for profile creation', () => {
      expect(sql).toMatch(/create\s+trigger\s+[\s\S]*?on\s+auth\.users/i)
    })

    it('trigger fires on INSERT', () => {
      expect(sql).toMatch(/after\s+insert\s+on\s+auth\.users/i)
    })
  })

  describe('updated_at trigger', () => {
    it('defines a set_updated_at function', () => {
      expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+.*set_updated_at/i)
    })

    it('attaches updated_at triggers to tables with updated_at columns', () => {
      const tablesWithUpdatedAt = ['profiles', 'projects', 'modules', 'flow_nodes']
      for (const table of tablesWithUpdatedAt) {
        const pattern = new RegExp(
          `create\\s+trigger\\s+.*updated_at.*on\\s+(public\\.)?${table}`,
          'i',
        )
        expect(sql).toMatch(pattern)
      }
    })
  })
})
