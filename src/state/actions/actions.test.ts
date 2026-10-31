import { type AudioClip, type ControlTarget, type InstrumentTrack, type Track, createArrangementClip, originOf, savedFrameCount } from '@core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAutomationEditor } from '../automation-store'
import { useLayoutStore } from '../layout-store'
import { useMidiStore } from '../midi-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { useStatusStore } from '../status-store'
import { useWaveEditorStore, waveViewOf } from '../wave-editor-store'
import { waveViewKey } from '../wave-panes'
import { actionsFor, describeActions, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name) as Track & { kind: 'instrument' | 'audio' }
const clipOf = (name: string, scene: number) => track(name).clips[scene]!
const titles = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => item.title)
const undoSteps = () => useProjectStore.getState().history.past.length

const ORDER = ['open', 'edit', 'clipboard', 'delete', 'process', 'marks', 'view']
/** One subject of every kind; the lists don't depend on the ids. */
const SUBJECTS: readonly Subject[] = [
  { kind: 'track', trackId: '' },
  { kind: 'master' },
  { kind: 'clip', trackId: '', clipId: '' },
  { kind: 'slot', trackId: '', scene: 0 },
  { kind: 'automation-slot', owner: { kind: 'master' }, scene: 0 },
  { kind: 'scene', scene: 0 },
  { kind: 'sample', sampleId: '' },
  { kind: 'library-item', itemId: '' },
  { kind: 'library-folder', folderId: '' },
  { kind: 'nodes', target: { master: true }, path: [], nodeIds: [] },
  { kind: 'canvas', target: { master: true }, path: [], at: { x: 0, y: 0 } },
  { kind: 'module', moduleId: '' },
  { kind: 'region', regionId: '' },
  { kind: 'lane', trackId: '', beat: 0 },
  { kind: 'control', targets: [] },
  { kind: 'sound', soundId: '', preset: false },
  { kind: 'sample-selection', sampleId: '', pane: 'main' },
  { kind: 'sample-marker', sampleId: '', pane: 'main', markerId: '' },
  { kind: 'sample-region', sampleId: '', pane: 'main', regionId: '' },
  { kind: 'sample-loop', sampleId: '', pane: 'main' },
]

beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
})
afterEach(() => useStatusStore.setState({ status: null }))

describe('action lists', () => {
  it('have unique ids named after their kind, in group order', () => {
    for (const subject of SUBJECTS) {
      const actions = actionsFor(subject)
      expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length)
      expect(actions.every((action) => action.id.startsWith(`${subject.kind}.`))).toBe(true)
      const groups = actions.map((action) => ORDER.indexOf(action.group))
      expect(groups).toEqual([...groups].sort((a, b) => a - b))
    }
  })

  it("doesn't run an action that is disabled or doesn't apply", () => {
    const bass = track('Bass')
    runAction('slot.create-clip', { kind: 'slot', trackId: track('Kick').id, scene: 1 }, fakeContext())
    runAction('lane.clear', { kind: 'lane', trackId: bass.id, beat: 0 }, fakeContext())
    runAction('clip.nothing', { kind: 'clip', trackId: bass.id, clipId: clipOf('Bass', 0).id }, fakeContext())
    expect(undoSteps()).toBe(0)
  })

  it('reports what an asynchronous action resolves with or throws', async () => {
    const reported: string[] = []
    const action = { id: 'slot.async', title: 'Async', group: 'edit' as const, run: async (_: Subject, __: unknown, choice?: string) => { if (choice === 'fail') throw new Error('Nope'); return 'Done' } }
    const list = actionsFor({ kind: 'slot', trackId: '', scene: 0 }) as unknown as unknown[]
    list.push(action)
    try {
      runAction('slot.async', { kind: 'slot', trackId: '', scene: 0 }, fakeContext(), { report: (kind, message) => reported.push(`${kind}: ${message}`) })
      runAction('slot.async', { kind: 'slot', trackId: '', scene: 0 }, fakeContext(), { choice: 'fail', report: (kind, message) => reported.push(`${kind}: ${message}`) })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(reported).toEqual(['info: Done', 'error: Nope'])
    } finally {
      list.pop()
    }
  })
})

describe('session clip', () => {
  it('offers the same entries for MIDI and audio clips, naming the editor, and Edit sample on audio clips', () => {
    const midi: Subject = { kind: 'clip', trackId: track('Bass').id, clipId: clipOf('Bass', 0).id }
    const audio: Subject = { kind: 'clip', trackId: track('Kick').id, clipId: clipOf('Kick', 0).id }
    expect(titles(midi)).toEqual(['Launch', 'Edit notes', 'Edit automation', 'Rename', 'Duplicate to empty slot', 'Place on arrangement', 'Copy', 'Cut', 'Delete'])
    expect(titles(audio)).toEqual(['Launch', 'Edit clip', 'Edit sample', 'Edit automation', 'Rename', 'Duplicate to empty slot', 'Place on arrangement', 'Copy', 'Cut', 'Delete'])
    expect(describeActions(midi, fakeContext()).find((item) => item.id === 'clip.delete')).toMatchObject({ group: 'delete', danger: true })
  })

  it("opens an audio clip's sample in the Wave editor at its trim, while the sample is in the library", () => {
    const kick = track('Kick'), clip = clipOf('Kick', 0) as AudioClip
    const sample = project().samples.find((candidate) => candidate.id === clip.sampleId)!
    useProjectStore.getState().updateAudioClip({ kind: 'session', trackId: kick.id, clipId: clip.id }, { start: 0.25, end: 0.5 })
    const subject: Subject = { kind: 'clip', trackId: kick.id, clipId: clip.id }
    runAction('clip.edit-sample', subject, fakeContext())
    expect(useSelectionStore.getState().sampleId).toBe(sample.id)
    expect(useLayoutStore.getState().visible).toContain('wave')
    const frames = savedFrameCount(sample)
    expect(waveViewOf(useWaveEditorStore.getState().views, waveViewKey('main', originOf(sample)))).toMatchObject({
      selection: { from: Math.round(frames * 0.25), to: Math.round(frames * 0.5), channels: 'both' },
      zoomTo: { from: Math.round(frames * 0.25), to: Math.round(frames * 0.5) },
    })
    // A clip whose sample left the library can't open it.
    useProjectStore.getState().resetProject({ ...project(), samples: [] })
    expect(describeActions(subject, fakeContext()).find((item) => item.id === 'clip.edit-sample')).toMatchObject({ enabled: false })
  })

  it("opens an audio region's sample at its trim, and doesn't apply to MIDI regions", () => {
    const kick = track('Kick'), clip = { ...(clipOf('Kick', 0) as AudioClip), start: 0.5, end: 1 }
    useProjectStore.getState().resetProject({ ...project(), arrangement: [createArrangementClip(kick.id, 0, clip)] })
    const region = project().arrangement![0]!
    runAction('region.edit-sample', { kind: 'region', regionId: region.id }, fakeContext())
    const sample = project().samples[0]!
    expect(useSelectionStore.getState().sampleId).toBe(sample.id)
    expect(waveViewOf(useWaveEditorStore.getState().views, waveViewKey('main', originOf(sample))).selection).toMatchObject({ from: Math.round(savedFrameCount(sample) / 2), to: savedFrameCount(sample) })
  })

  it('launches, or restarts while playing', () => {
    const bass = track('Bass'), root = clipOf('Bass', 0)
    const subject: Subject = { kind: 'clip', trackId: bass.id, clipId: root.id }
    const context = fakeContext()
    runAction('clip.launch', subject, context)
    expect(context.calls).toEqual([`engine.launchClip("${bass.id}", "${root.id}")`])
    useStatusStore.setState({ status: { tracks: { [bass.id]: { playingClipId: root.id, startBeat: 0, queued: null } } } as never })
    expect(titles(subject)[0]).toBe('Restart')
  })

  it('opens the clip editor, and the automation editor', () => {
    const bass = track('Bass'), walk = clipOf('Bass', 1)
    runAction('clip.edit-automation', { kind: 'clip', trackId: bass.id, clipId: walk.id }, fakeContext())
    expect(useSelectionStore.getState()).toMatchObject({ trackId: bass.id, clipId: walk.id })
    expect(useAutomationEditor.getState().visible).toBe(true)
    expect(useLayoutStore.getState().visible).toContain('clip')
  })

  it('duplicates into the first empty slot, disabled when the track has none', () => {
    const lead = track('Lead'), arp = clipOf('Lead', 0)
    const subject: Subject = { kind: 'clip', trackId: lead.id, clipId: arp.id }
    runAction('clip.duplicate', subject, fakeContext())
    expect(clipOf('Lead', 1)).toMatchObject({ name: 'Arp' })
    expect(clipOf('Lead', 1).id).not.toBe(arp.id)
    runAction('clip.duplicate', subject, fakeContext())
    expect(describeActions(subject, fakeContext()).find((item) => item.id === 'clip.duplicate')?.enabled).toBe(false)
    expect(undoSteps()).toBe(2)
  })

  it('places a copy after the last region of its track', () => {
    const bass = track('Bass'), root = clipOf('Bass', 0)
    const subject: Subject = { kind: 'clip', trackId: bass.id, clipId: root.id }
    runAction('clip.place-on-arrangement', subject, fakeContext())
    runAction('clip.place-on-arrangement', subject, fakeContext())
    expect(project().arrangement?.map((region) => [region.trackId, region.startBeat])).toEqual([[bass.id, 0], [bass.id, root.lengthBeats]])
  })

  it('deletes MIDI and audio clips, one undo step each', () => {
    runAction('clip.delete', { kind: 'clip', trackId: track('Pad').id, clipId: clipOf('Pad', 1).id }, fakeContext())
    runAction('clip.delete', { kind: 'clip', trackId: track('Kick').id, clipId: clipOf('Kick', 0).id }, fakeContext())
    expect(track('Pad').clips[1]).toBeNull()
    expect(track('Kick').clips[0]).toBeNull()
    expect(undoSteps()).toBe(2)
  })
})

describe('empty slot', () => {
  it('creates a MIDI clip and opens it', () => {
    const lead = track('Lead')
    expect(titles({ kind: 'slot', trackId: lead.id, scene: 1 })).toEqual(['Create clip', 'Paste'])
    runAction('slot.create-clip', { kind: 'slot', trackId: lead.id, scene: 1 }, fakeContext())
    expect(useSelectionStore.getState().clipId).toBe(clipOf('Lead', 1).id)
    expect(titles({ kind: 'slot', trackId: lead.id, scene: 1 })).toEqual([])
  })

  it('adds an audio clip of a sample from a submenu, or offers to import samples', () => {
    const kick = track('Kick'), slot: Subject = { kind: 'slot', trackId: kick.id, scene: 1 }
    const [add] = describeActions(slot, fakeContext())
    expect(add).toMatchObject({ title: 'Add audio clip', inline: false, choices: [{ id: 'kick', title: 'Kick' }] })
    runAction('slot.add-audio-clip', slot, fakeContext(), { choice: 'kick' })
    expect(clipOf('Kick', 1)).toMatchObject({ sampleId: 'kick' })
    expect(useSelectionStore.getState().clipId).toBe(clipOf('Kick', 1).id)
    useProjectStore.getState().removeSample('kick')
    expect(describeActions({ ...slot, scene: 2 }, fakeContext())[0]?.choices).toEqual([{ id: '', title: 'Import samples…' }])
  })
})

describe('arrangement region and lane', () => {
  const placeRoot = () => {
    const bass = track('Bass')
    useProjectStore.getState().addArrangementClip(bass.id, 4, clipOf('Bass', 0))
    return project().arrangement![0]!
  }

  it('duplicates a region after itself, loops it and deletes it', () => {
    const region = placeRoot()
    const subject: Subject = { kind: 'region', regionId: region.id }
    expect(titles(subject)).toEqual(['Edit', 'Edit session clip', 'Duplicate', 'Loop until next region', 'Copy', 'Delete'])
    runAction('region.duplicate', subject, fakeContext())
    expect(project().arrangement?.map((placed) => placed.startBeat)).toEqual([4, 4 + region.content.lengthBeats])
    runAction('region.loop', subject, fakeContext())
    expect(titles(subject)[3]).toBe('Stop looping')
    runAction('region.delete', subject, fakeContext())
    expect(project().arrangement).toHaveLength(1)
  })

  it("adds the track's session clips at the clicked beat, and clears the track", () => {
    const bass = track('Bass')
    const lane: Subject = { kind: 'lane', trackId: bass.id, beat: 8 }
    const [add, paste, clear] = describeActions(lane, fakeContext())
    expect(add).toMatchObject({ title: 'Add clip', inline: false })
    expect(add?.choices?.map((choice) => choice.title)).toEqual(['Root', 'Walk'])
    expect(paste).toMatchObject({ title: 'Paste', enabled: false })
    expect(clear).toMatchObject({ title: 'Clear this track', enabled: false, danger: true })
    runAction('lane.add-clip', lane, fakeContext(), { choice: clipOf('Bass', 1).id })
    expect(project().arrangement?.map((region) => [region.startBeat, region.content.name])).toEqual([[8, 'Walk']])
    runAction('lane.clear', lane, fakeContext())
    expect(project().arrangement).toEqual([])
  })
})

describe('control', () => {
  const owner = () => ({ kind: 'track' as const, trackId: track('Bass').id })
  const volume = (): ControlTarget => ({ kind: 'mixer', owner: owner(), control: 'volume' })

  it('learns MIDI and shows automation for one target', () => {
    const subject: Subject = { kind: 'control', targets: [volume()] }
    expect(describeActions(subject, fakeContext()).flatMap((item) => item.choices!.map((choice) => choice.title))).toEqual(['MIDI learn', 'Show automation'])
    runAction('control.midi-learn', subject, fakeContext(), { choice: '0' })
    expect(useMidiStore.getState().learning?.target).toEqual(volume())
    runAction('control.show-automation', subject, fakeContext(), { choice: '0' })
    expect(useAutomationEditor.getState().target).toEqual(volume())
    expect(useSelectionStore.getState().clipId).toBe(clipOf('Bass', 0).id)
  })

  it('has one entry per axis of an XY pad', () => {
    const bass = project().tracks.find((candidate) => candidate.name === 'Bass') as InstrumentTrack
    const node = bass.patch.nodes.find((candidate) => candidate.type !== 'output')!
    const axes = ['x', 'y'].map((paramId): ControlTarget => ({ kind: 'graph', owner: owner(), domain: 'instrument', path: [], nodeId: node.id, paramId } as unknown as ControlTarget))
    const entries = describeActions({ kind: 'control', targets: axes }, fakeContext()).flatMap((item) => item.choices!.map((choice) => choice.title.split(' — ')[0]))
    expect(entries).toEqual(['MIDI learn X', 'MIDI learn Y', 'Show automation X', 'Show automation Y'])
  })

  it('disables Show automation on a track without clips', () => {
    const lead = track('Lead')
    for (const scene of [0, 2]) useProjectStore.getState().deleteClip(lead.id, scene)
    const target: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: lead.id }, control: 'volume' }
    const show = describeActions({ kind: 'control', targets: [target] }, fakeContext()).find((item) => item.id === 'control.show-automation')
    expect(show?.choices?.[0]?.enabled).toBe(false)
  })
})
