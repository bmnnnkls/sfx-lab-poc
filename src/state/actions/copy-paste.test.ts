import { addTrack, createReturnTrack, setAutomationSlot } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { automationSlotClipboard, clipClipboard, describeActions, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const clipOf = (name: string, scene: number) => {
  const found = track(name)
  return found.kind === 'return' ? null : found.clips[scene] ?? null
}
const clip = (name: string, scene: number): Subject => ({ kind: 'clip', trackId: track(name).id, clipId: clipOf(name, scene)!.id })
const slot = (name: string, scene: number): Subject => ({ kind: 'slot', trackId: track(name).id, scene })
const enabled = (subject: Subject, id: string) => describeActions(subject, fakeContext()).find((item) => item.id === id)?.enabled

beforeEach(() => {
  const volume = { kind: 'mixer' as const, owner: { kind: 'master' as const }, control: 'volume' as const }
  const withSlot = setAutomationSlot(addTrack(loadDemo(), { ...createReturnTrack('Return A'), id: 'ret' }), { kind: 'master' }, 0, {
    id: 'swell', name: 'Swell', lengthBeats: 4, automation: [{ id: 'lane', target: volume, enabled: true, points: [{ id: 'p', beat: 0, value: 1, interpolation: 'linear' }] }],
  })
  useProjectStore.getState().resetProject(withSlot)
  useSelectionStore.getState().reset()
  clipClipboard.set(null)
  automationSlotClipboard.set(null)
})

describe('clips', () => {
  it('copies a clip and pastes it into an empty slot of a track of the same kind', () => {
    expect(enabled(slot('Lead', 1), 'slot.paste')).toBe(false)
    runAction('clip.copy', clip('Bass', 0), fakeContext())
    expect(enabled(slot('Lead', 1), 'slot.paste')).toBe(true)
    expect(enabled(slot('Kick', 1), 'slot.paste')).toBe(false)
    runAction('slot.paste', slot('Lead', 1), fakeContext())
    expect(clipOf('Lead', 1)).toMatchObject({ name: 'Root' })
    expect(clipOf('Lead', 1)!.id).not.toBe(clipOf('Bass', 0)!.id)
    expect(useProjectStore.getState().history.past).toHaveLength(1)
  })

  it('cuts a clip, which still pastes after its track is gone', () => {
    runAction('clip.cut', clip('Pad', 1), fakeContext())
    expect(clipOf('Pad', 1)).toBeNull()
    useProjectStore.getState().removeTrack(track('Pad').id)
    runAction('slot.paste', slot('Lead', 3), fakeContext())
    expect(clipOf('Lead', 3)).toMatchObject({ name: 'Ab' })
  })

  it("doesn't paste an audio clip whose sample is gone", () => {
    runAction('clip.copy', clip('Kick', 0), fakeContext())
    expect(enabled(slot('Kick', 1), 'slot.paste')).toBe(true)
    useProjectStore.getState().removeSample('kick')
    expect(enabled(slot('Kick', 1), 'slot.paste')).toBe(false)
  })

  it('shares the clipboard between session clips and regions', () => {
    const bass = track('Bass')
    runAction('clip.copy', clip('Bass', 1), fakeContext())
    runAction('lane.paste', { kind: 'lane', trackId: bass.id, beat: 6 }, fakeContext())
    const region = project().arrangement![0]!
    expect(region).toMatchObject({ trackId: bass.id, startBeat: 6, content: { name: 'Walk' } })
    expect(region.content.id).not.toBe(clipOf('Bass', 1)!.id)
    expect(enabled({ kind: 'lane', trackId: track('Kick').id, beat: 0 }, 'lane.paste')).toBe(false)

    useProjectStore.getState().addArrangementClip(bass.id, 0, clipOf('Bass', 0)!)
    const placed = project().arrangement!.find((candidate) => candidate.content.name === 'Root')!
    runAction('region.copy', { kind: 'region', regionId: placed.id }, fakeContext())
    runAction('slot.paste', slot('Pad', 2), fakeContext())
    expect(clipOf('Pad', 2)).toMatchObject({ name: 'Root' })
  })

  it("opens a region's session source while it exists", () => {
    const bass = track('Bass')
    useProjectStore.getState().addArrangementClip(bass.id, 0, clipOf('Bass', 0)!)
    const region: Subject = { kind: 'region', regionId: project().arrangement![0]!.id }
    runAction('region.edit-session-clip', region, fakeContext())
    expect(useSelectionStore.getState().clipId).toBe(clipOf('Bass', 0)!.id)
    useProjectStore.getState().deleteClip(bass.id, 0)
    expect(enabled(region, 'region.edit-session-clip')).toBe(false)
  })
})

describe('automation slots', () => {
  const master = (scene: number): Subject => ({ kind: 'automation-slot', owner: { kind: 'master' }, scene })
  const returnSlot = (scene: number): Subject => ({ kind: 'automation-slot', owner: { kind: 'track', trackId: 'ret' }, scene })
  const titles = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => item.title)

  it('offers what a slot or an empty cell can do', () => {
    expect(titles(master(0))).toEqual(['Launch', 'Edit', 'Copy', 'Delete'])
    expect(titles(master(1))).toEqual(['Create', 'Paste'])
  })

  it('copies a slot into an empty cell of a return, its lanes moved there', () => {
    expect(enabled(returnSlot(2), 'automation-slot.paste')).toBe(false)
    runAction('automation-slot.copy', master(0), fakeContext())
    runAction('automation-slot.paste', returnSlot(2), fakeContext())
    const ret = track('Return A')
    const pasted = ret.kind === 'return' ? ret.automationSlots?.[2] : undefined
    expect(pasted).toMatchObject({ name: 'Swell', automation: [{ target: { owner: { kind: 'track', trackId: 'ret' } } }] })
    expect(pasted?.id).not.toBe('swell')
  })

  it('launches, stops, creates and deletes', () => {
    const context = fakeContext()
    runAction('automation-slot.launch', master(0), context)
    expect(context.calls).toEqual(['engine.launchAutomation({"kind":"master"}, "swell")'])
    runAction('automation-slot.create', master(1), context)
    runAction('automation-slot.delete', master(0), context)
    expect(project().master.automationSlots?.map((cell) => cell?.name ?? null)).toEqual([null, 'Automation', null, null])
  })
})
