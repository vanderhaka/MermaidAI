// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  getProjectModeConfig,
  getSingleCanvasModuleDefaults,
  isSingleCanvasMode,
  PROJECT_MODE_CONFIG,
  PROJECT_MODES,
} from '@/lib/project-modes'
import type { ProjectMode } from '@/types/graph'

describe('project mode config', () => {
  it('defines config for every project mode', () => {
    expect(Object.keys(PROJECT_MODE_CONFIG).sort()).toEqual([...PROJECT_MODES].sort())
  })

  it('marks scope and flowchart as single-canvas modes with chat and module defaults', () => {
    for (const mode of ['scope', 'flowchart'] satisfies ProjectMode[]) {
      const config = getProjectModeConfig(mode)

      expect(isSingleCanvasMode(mode)).toBe(true)
      expect(config.chatMode).toBeTruthy()
      expect(config.defaultModule).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          description: expect.any(String),
          color: expect.stringMatching(/^#/),
        }),
      )
      expect(getSingleCanvasModuleDefaults(mode)).toEqual(config.defaultModule)
    }
  })

  it('keeps architecture out of the single-canvas workspace', () => {
    expect(isSingleCanvasMode('architecture')).toBe(false)
    expect(getProjectModeConfig('architecture').chatMode).toBeUndefined()
    expect(getSingleCanvasModuleDefaults('architecture')).toBeNull()
  })
})
