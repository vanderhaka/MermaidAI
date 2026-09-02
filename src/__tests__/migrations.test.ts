// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260406000000_create_core_tables.sql',
)
const FLOWCHART_MODE_MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260430000000_add_flowchart_project_mode.sql',
)
const PLANNING_MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260901230157_add_planning_schema_and_rls.sql',
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

describe('Flowchart project mode migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(FLOWCHART_MODE_MIGRATION_PATH, 'utf-8')
  })

  it('replaces the projects mode check constraint', () => {
    expect(sql).toMatch(
      /alter\s+table\s+(public\.)?projects\s+drop\s+constraint\s+if\s+exists\s+projects_mode_check/is,
    )
    expect(sql).toMatch(
      /alter\s+table\s+(public\.)?projects\s+add\s+constraint\s+projects_mode_check/is,
    )
  })

  it('allows scope, architecture, and flowchart modes', () => {
    expect(sql).toMatch(/mode\s+in\s*\(\s*'scope'\s*,\s*'architecture'\s*,\s*'flowchart'\s*\)/is)
  })
})

describe('Planning schema migration', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(PLANNING_MIGRATION_PATH, 'utf-8')
  })

  it.each([
    'planning_states',
    'planning_artifacts',
    'planning_artifact_versions',
    'planning_decisions',
    'planning_change_sets',
    'planning_operations',
    'planning_handoff_jobs',
  ])('creates and enables RLS for %s', (table) => {
    expect(sql).toMatch(new RegExp(`create\\s+table\\s+public\\.${table}`, 'i'))
    expect(sql).toMatch(
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
    )
  })

  it('keeps legacy rows additive and protects immutable versions', () => {
    expect(sql).toMatch(
      /alter\s+table\s+public\.open_questions\s+add\s+column\s+if\s+not\s+exists/is,
    )
    expect(sql).toMatch(
      /alter\s+table\s+public\.chat_messages\s+add\s+column\s+if\s+not\s+exists/is,
    )
    expect(sql).not.toMatch(/alter\s+table\s+public\.modules\s+.*prd_content/is)
    expect(sql).toMatch(/planning_artifact_versions_immutable/is)
    expect(sql).toMatch(/before\s+update\s+on\s+public\.planning_artifact_versions/is)
    expect(sql).toMatch(
      /active_version_id\)\s+references\s+public\.planning_artifact_versions\(id\)\s+on\s+delete\s+set\s+null/is,
    )
  })

  it('uses ownership RLS and narrowly grants authenticated access', () => {
    expect(sql).toMatch(/to\s+authenticated\s+using\s*\(\s*public\.owns_project/is)
    expect(sql).toMatch(/with\s+check\s*\(\s*public\.owns_project/is)
    expect(sql).toMatch(
      /grant\s+select.*on\s+table\s+public\.planning_states\s+to\s+authenticated/is,
    )
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.initialize_architecture_planning_state\(uuid\)\s+from\s+public/is,
    )
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.owns_project\(uuid\)\s+to\s+authenticated/is,
    )
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+table\s+public\.planning_states[\s\S]*?from\s+public,\s*anon,\s*authenticated/is,
    )
    const planningTableGrants = [
      ...sql.matchAll(
        /^grant\s+([^;]+)\s+on\s+table\s+public\.(planning_\w+)\s+to\s+authenticated;/gim,
      ),
    ]
    expect(planningTableGrants).toHaveLength(7)
    for (const [, privileges] of planningTableGrants) {
      expect(privileges).not.toMatch(/truncate|delete/i)
    }
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.initialize_architecture_planning_state\(uuid\)\s+to\s+authenticated/is,
    )
  })

  it('restores only the authenticated base-table operations used by application services', () => {
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+table\s+public\.profiles,\s*public\.projects,\s*public\.modules,\s*public\.flow_nodes,\s*public\.flow_edges,\s*public\.module_connections,\s*public\.chat_messages,\s*public\.open_questions\s+from\s+public,\s*anon,\s*authenticated/is,
    )

    const expectedGrants: Record<string, string[]> = {
      profiles: ['insert', 'select', 'update'],
      projects: ['delete', 'insert', 'select', 'update'],
      modules: ['delete', 'insert', 'select', 'update'],
      flow_nodes: ['delete', 'insert', 'select', 'update'],
      flow_edges: ['delete', 'insert', 'select', 'update'],
      module_connections: ['delete', 'insert', 'select', 'update'],
      chat_messages: ['insert', 'select'],
      open_questions: ['delete', 'insert', 'select', 'update'],
    }

    const baseTableGrants = [
      ...sql.matchAll(
        /^grant\s+([^;]+)\s+on\s+table\s+public\.(profiles|projects|modules|flow_nodes|flow_edges|module_connections|chat_messages|open_questions)\s+to\s+authenticated;/gim,
      ),
    ]

    expect(baseTableGrants).toHaveLength(Object.keys(expectedGrants).length)
    for (const [, privileges, table] of baseTableGrants) {
      const actual = privileges
        .split(',')
        .map((privilege) => privilege.trim().toLowerCase())
        .sort()
      expect(actual, table).toEqual(expectedGrants[table])
      expect(actual).not.toContain('truncate')
    }
  })

  it('provides lock, monotonic allocation, and Architecture-only lazy initialization', () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.lock_planning_state/is)
    expect(sql).toMatch(/for\s+update/is)
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.allocate_planning_artifact_version/is,
    )
    expect(sql).toMatch(/coalesce\(max\(version\),\s*0\)\s*\+\s*1/is)
    expect(sql).toMatch(/mode\s*=\s*'architecture'/is)
    expect(sql).toMatch(
      /content_state,\s*content,\s*content_hash\)\s*values\s*\(architecture_artifact_id,\s*p_project_id,\s*1,\s*'draft'/is,
    )
  })

  it('makes complete version retries race-safe without deduplicating intentional reverts', () => {
    expect(sql).toMatch(/request_key\s+uuid/is)
    expect(sql).toMatch(/request_hash\s+text/is)
    expect(sql).toMatch(
      /content_state\s*=\s*'complete'[\s\S]*?request_key\s+is\s+not\s+null[\s\S]*?request_hash\s+is\s+not\s+null/is,
    )
    expect(sql).toMatch(/unique\s*\(artifact_id,\s*request_key\)/is)
    expect(sql).not.toMatch(/unique\s*\(artifact_id,\s*content_hash\)/is)
    expect(sql).toMatch(
      /select\s+\*\s+into\s+artifact_row\s+from\s+public\.planning_artifacts\s+where\s+id\s*=\s*p_artifact_id\s+for\s+update/is,
    )
    expect(sql).toMatch(/existing_version\.request_hash\s+is\s+distinct\s+from\s+p_request_hash/is)
    expect(sql).toMatch(/existing_version\.content\s+is\s+distinct\s+from\s+p_content/is)
    expect(sql).toMatch(
      /raise\s+exception\s+'Idempotency key reused with different request content'/is,
    )
    expect(sql).toMatch(/set\s+active_version_id\s*=\s*allocated_version\.id/is)
    expect(sql).toMatch(/set\s+active_work_plan_artifact_id\s*=\s*artifact_row\.id/is)
    expect(sql).toMatch(/set\s+active_execution_handoff_artifact_id\s*=\s*artifact_row\.id/is)
  })
})
