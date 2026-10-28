import { addTrack, createReturnTrack, MAX_TRACKS } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAutomationEditor } from '../automation-store'
import { useLayoutStore } from '../layout-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const titles = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => item.title)
const undoSteps = () => useProjectStore.getState().history.past.length

beforeEach(() => {
  const demo = loadDemo()
  useProjectStore.getState().resetProject(addTrack(demo, { ...createReturnTrack('Return A'), id: 'ret' }))
  useSelectionStore.getState().reset()
})

describe('track', () => {
  it("offers what applies to the track's kind", () => {
    const edits = ['Rename', 'Duplicate', 'Group', 'Move to group', 'Move up', 'Move down', 'Hide', 'Mute', 'Solo']
    expect(titles({ kind: 'track', trackId: track('Bass').id })).toEqual(['Stop', 'Open instrument', 'Open effects', 'Open notes', 'Show automation', ...edits, 'Delete'])
    expect(titles({ kind: 'track', trackId: track('Kick').id })).toEqual(['Stop', 'Open effects', 'Show automation', ...edits, 'Delete'])
    expect(titles({ kind: 'track', trackId: 'ret' })).toEqual(['Open effects', 'Show automation', 'Rename', 'Duplicate', 'Move up', 'Move down', 'Hide', 'Mute', 'Solo', 'Delete'])
  })

  it('stops the track and opens its views', () => {
    const bass = track('Bass'), subject: Subject = { kind: 'track', trackId: bass.id }
    const context = fakeContext()
    runAction('track.stop', subject, context)
    expect(context.calls).toEqual([`engine.stopTrack("${bass.id}")`])
    runAction('track.open-notes', subject, context)
    expect(useSelectionStore.getState().trackId).toBe(bass.id)
    expect(useLayoutStore.getState().visible).toContain('notes')
  })

  it("shows a return's volume lane in a slot it creates", () => {
    runAction('track.show-automation', { kind: 'track', trackId: 'ret' }, fakeContext())
    expect(useAutomationEditor.getState().target).toMatchObject({ owner: { kind: 'track', trackId: 'ret' }, control: 'volume' })
    const ret = track('Return A')
    expect(ret.kind === 'return' && ret.automationSlots?.[0]).toBeTruthy()
  })

  it('duplicates the track after itself and selects the copy, one undo step', () => {
    runAction('track.duplicate', { kind: 'track', trackId: track('Bass').id }, fakeContext())
    expect(project().tracks.map((candidate) => candidate.name)).toEqual(['Bass', 'Bass copy', 'Lead', 'Pad', 'Kick', 'Return A'])
    expect(useSelectionStore.getState().trackId).toBe(track('Bass copy').id)
    expect(undoSteps()).toBe(1)
  })

  it('disables Duplicate at the track limit', () => {
    const bass = track('Bass')
    while (project().tracks.length < MAX_TRACKS) useProjectStore.getState().duplicateTrack(bass.id)
    expect(describeActions({ kind: 'track', trackId: bass.id }, fakeContext()).find((item) => item.id === 'track.duplicate')?.enabled).toBe(false)
  })

  it('mutes, solos and deletes', () => {
    const lead: Subject = { kind: 'track', trackId: track('Lead').id }
    runAction('track.mute', lead, fakeContext())
    runAction('track.solo', lead, fakeContext())
    expect(titles(lead)).toContain('Unmute')
    expect(titles(lead)).toContain('Unsolo')
    expect(track('Lead')).toMatchObject({ muted: true, soloed: true })
    runAction('track.delete', lead, fakeContext())
    expect(project().tracks.some((candidate) => candidate.name === 'Lead')).toBe(false)
    expect(undoSteps()).toBe(3)
  })
})

describe('master', () => {
  it('opens its effects and shows its automation', () => {
    expect(titles({ kind: 'master' })).toEqual(['Open effects', 'Show automation'])
    runAction('master.open-effects', { kind: 'master' }, fakeContext())
    expect(useSelectionStore.getState().master).toBe(true)
    runAction('master.show-automation', { kind: 'master' }, fakeContext())
    expect(useAutomationEditor.getState().target).toMatchObject({ owner: { kind: 'master' }, control: 'volume' })
  })
})
