// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { expandConnectionHandlePoints, stripHandleSlotSuffix } from './handleSlots'
import type { ModuleConnection } from '@/types/graph'

function makeConnection(
  overrides: Partial<ModuleConnection> & {
    id: string
    source_module_id: string
    target_module_id: string
  },
): ModuleConnection {
  const { id, source_module_id, target_module_id, ...rest } = overrides
  return {
    id,
    project_id: 'proj-1',
    source_module_id,
    target_module_id,
    source_exit_point: 'output',
    target_entry_point: 'input',
    created_at: '2026-01-01T00:00:00Z',
    ...rest,
  }
}

describe('handleSlots', () => {
  it('stripHandleSlotSuffix removes __sN suffix', () => {
    expect(stripHandleSlotSuffix('return_approved__s0')).toBe('return_approved')
    expect(stripHandleSlotSuffix('login')).toBe('login')
  })

  it('assigns distinct slotted names when several edges share one exit', () => {
    const connections = [
      makeConnection({
        id: 'a',
        source_module_id: 'm1',
        target_module_id: 'm2',
        source_exit_point: 'return_approved',
        target_entry_point: 'a',
      }),
      makeConnection({
        id: 'b',
        source_module_id: 'm1',
        target_module_id: 'm3',
        source_exit_point: 'return_approved',
        target_entry_point: 'b',
      }),
    ]
    const { sourcePointByConnectionId } = expandConnectionHandlePoints(connections)
    expect(sourcePointByConnectionId.get('a')).toBe('return_approved__s0')
    expect(sourcePointByConnectionId.get('b')).toBe('return_approved__s1')
  })

  it('keeps unsuffixed names when only one edge uses that exit', () => {
    const connections = [
      makeConnection({
        id: 'only',
        source_module_id: 'm1',
        target_module_id: 'm2',
        source_exit_point: 'done',
        target_entry_point: 'in',
      }),
    ]
    const { sourcePointByConnectionId } = expandConnectionHandlePoints(connections)
    expect(sourcePointByConnectionId.get('only')).toBe('done')
  })
})
