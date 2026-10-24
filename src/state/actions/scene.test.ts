import { MAX_SCENES } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const bassClips = () => {
  const bass = project().tracks[0]!
  return bass.kind === 'return' ? [] : bass.clips.map((clip) => clip?.name ?? null)
}
const enabled = (subject: Subject, id: string) => describeActions(subject, fakeContext()).find((item) => item.id === id)?.enabled

beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
})

describe('scene', () => {
  it('launches, renames, inserts, duplicates and deletes', () => {
    const subject: Subject = { kind: 'scene', scene: 1 }
    expect(describeActions(subject, fakeContext()).map((item) => item.title)).toEqual(['Launch', 'Rename', 'Insert scene before', 'Duplicate', 'Delete'])
    const context = fakeContext()
    runAction('scene.launch', subject, context)
    expect(context.calls).toEqual(['engine.launchScene(1)'])
    runAction('scene.insert', subject, context)
    expect(bassClips()).toEqual(['Root', null, 'Walk', null, null])
    runAction('scene.duplicate', { kind: 'scene', scene: 2 }, context)
    expect(bassClips()).toEqual(['Root', null, 'Walk', 'Walk', null, null])
    runAction('scene.delete', { kind: 'scene', scene: 1 }, context)
    expect(bassClips()).toEqual(['Root', 'Walk', 'Walk', null, null])
    expect(useProjectStore.getState().history.past).toHaveLength(3)
  })

  it('keeps the automation scene on its row, and resets it when its row goes', () => {
    useSelectionStore.setState({ automationScene: 2 })
    runAction('scene.insert', { kind: 'scene', scene: 0 }, fakeContext())
    expect(useSelectionStore.getState().automationScene).toBe(3)
    runAction('scene.delete', { kind: 'scene', scene: 3 }, fakeContext())
    expect(useSelectionStore.getState().automationScene).toBe(0)
  })

  it('disables Delete on the last scene, and Insert and Duplicate at 64', () => {
    while (project().sceneCount > 1) useProjectStore.getState().removeScene(0)
    expect(enabled({ kind: 'scene', scene: 0 }, 'scene.delete')).toBe(false)
    while (project().sceneCount < MAX_SCENES) useProjectStore.getState().insertScene(0)
    expect(enabled({ kind: 'scene', scene: 0 }, 'scene.insert')).toBe(false)
    expect(enabled({ kind: 'scene', scene: 0 }, 'scene.duplicate')).toBe(false)
  })
})
