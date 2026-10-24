import { afterEach, describe, expect, it } from 'vitest'
import { type ControlOwner, createEmptyProject, createReturnTrack, parseProject, serializeProject } from '@core'
import { editAutomationSlot, useAutomationEditor } from './automation-store'
import { useProjectStore } from './project-store'
import { useSelectionStore } from './selection-store'

afterEach(() => { useSelectionStore.getState().reset(); useAutomationEditor.getState().hide() })
describe('automation slot history and selection', () => {
  it.each([{ kind: 'master' }, { kind: 'track', trackId: 'return' }] as ControlOwner[])('creates, resizes, deletes, undoes and reloads %j', (owner) => {
    const initial = createEmptyProject()
    useProjectStore.getState().resetProject({ ...initial, tracks: [...initial.tracks, { ...createReturnTrack('Return'), id: 'return' }] })
    const target = { kind: 'mixer' as const, owner, control: 'volume' as const }
    useAutomationEditor.getState().show(target)
    expect(useSelectionStore.getState().tab).toBe('clip')
    expect(useSelectionStore.getState().master).toBe(owner.kind === 'master')
    const getSlot = () => owner.kind === 'master' ? useProjectStore.getState().project.master.automationSlots?.[0] : useProjectStore.getState().project.tracks.filter((t) => t.kind === 'return')[0]?.automationSlots?.[0]
    expect(getSlot()?.lengthBeats).toBe(4)
    const slot = getSlot()!
    editAutomationSlot(owner, 0, { ...slot, lengthBeats: 3 })
    expect(getSlot()?.lengthBeats).toBe(3)
    editAutomationSlot(owner, 0, null)
    expect(getSlot()).toBeNull()
    useProjectStore.getState().undo()
    expect(getSlot()?.lengthBeats).toBe(3)
    const saved = serializeProject(useProjectStore.getState().project), parsed = parseProject(saved)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) { useProjectStore.getState().resetProject(parsed.project); expect(getSlot()?.lengthBeats).toBe(3) }
  })
})
