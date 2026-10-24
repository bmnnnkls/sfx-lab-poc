import { type LibraryCatalog, captureLibraryAsset, captureLibraryClip, captureSnapshot, editControlBase, editPatchAt, emptyLibrary, putSnapshot, saveProjectPreset } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { usePersistenceStore } from '../persistence-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { type DragPayload, type DropTarget, dropFor, runDrop } from './drops'
import { fakeContext, kick, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const clipOf = (name: string, scene: number) => {
  const found = track(name)
  return found.kind === 'return' ? null : found.clips[scene] ?? null
}
const clip = (name: string, scene: number): DragPayload => ({ kind: 'clip', trackId: track(name).id, clipId: clipOf(name, scene)!.id })
const slot = (name: string, scene: number): DropTarget => ({ kind: 'slot', trackId: track(name).id, scene })
const lane = (name: string, beat: number): DropTarget => ({ kind: 'lane', trackId: track(name).id, beat })
const onTrack = (name: string): DropTarget => ({ kind: 'track', trackId: track(name).id })
const master: DropTarget = { kind: 'master' }
const canvas = (name: string, graph?: 'fx' | 'notes', path: readonly string[] = []): DropTarget => ({ kind: 'canvas', target: { trackId: track(name).id, graph }, path, at: { x: 0, y: 0 } })
const undoSteps = () => useProjectStore.getState().history.past.length
const accepted = (payload: DragPayload, target: DropTarget) => dropFor(payload, target, fakeContext())?.id
const NONE = { alt: false }
const ALT = { alt: true }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
  usePersistenceStore.setState({ notices: [] })
})

describe('session clips', () => {
  it('move to an empty slot of a track of their kind, keeping their id, as one undo step', () => {
    const root = clipOf('Bass', 0)!
    expect(dropFor(clip('Bass', 0), slot('Lead', 1), fakeContext())?.effect(clip('Bass', 0), slot('Lead', 1), NONE)).toBe('move')
    runDrop(clip('Bass', 0), slot('Lead', 1), fakeContext(), NONE)
    expect(clipOf('Lead', 1)?.id).toBe(root.id)
    expect(clipOf('Bass', 0)).toBeNull()
    expect(undoSteps()).toBe(1)
    useProjectStore.getState().undo()
    expect(clipOf('Bass', 0)?.id).toBe(root.id)
    expect(clipOf('Lead', 1)).toBeNull()
  })

  it('copy with Alt, with fresh ids', () => {
    expect(dropFor(clip('Bass', 0), slot('Lead', 1), fakeContext())?.effect(clip('Bass', 0), slot('Lead', 1), ALT)).toBe('copy')
    runDrop(clip('Bass', 0), slot('Lead', 1), fakeContext(), ALT)
    expect(clipOf('Lead', 1)).toMatchObject({ name: 'Root' })
    expect(clipOf('Lead', 1)!.id).not.toBe(clipOf('Bass', 0)!.id)
    expect(undoSteps()).toBe(1)
  })

  it('take the selection along when the moved clip is selected', () => {
    const root = clipOf('Bass', 0)!
    useSelectionStore.getState().selectClip(track('Bass').id, root.id)
    runDrop(clip('Bass', 0), slot('Pad', 3), fakeContext(), NONE)
    expect(useSelectionStore.getState()).toMatchObject({ trackId: track('Pad').id, clipId: root.id })
  })

  it('refuse an occupied slot, a track of the other kind, and tracks, the master and canvases', () => {
    expect(accepted(clip('Bass', 0), slot('Lead', 0))).toBeUndefined()
    expect(accepted(clip('Bass', 0), slot('Kick', 1))).toBeUndefined()
    expect(accepted(clip('Kick', 0), slot('Bass', 2))).toBeUndefined()
    expect(accepted(clip('Bass', 0), onTrack('Lead'))).toBeUndefined()
    expect(accepted(clip('Bass', 0), master)).toBeUndefined()
    expect(accepted(clip('Bass', 0), canvas('Bass'))).toBeUndefined()
    runDrop(clip('Bass', 0), slot('Lead', 0), fakeContext(), NONE)
    expect(undoSteps()).toBe(0)
  })

  it('copy onto their own lane linked to their source, and onto another lane of their kind with fresh ids', () => {
    const root = clipOf('Bass', 0)!
    expect(dropFor(clip('Bass', 0), lane('Bass', 8), fakeContext())?.effect(clip('Bass', 0), lane('Bass', 8), NONE)).toBe('copy')
    runDrop(clip('Bass', 0), lane('Bass', 8), fakeContext(), NONE)
    expect(project().arrangement?.[0]).toMatchObject({ trackId: track('Bass').id, startBeat: 8, content: { id: root.id } })
    runDrop(clip('Bass', 0), lane('Lead', 4), fakeContext(), NONE)
    const pasted = project().arrangement?.find((region) => region.trackId === track('Lead').id)
    expect(pasted).toMatchObject({ startBeat: 4, content: { name: 'Root' } })
    expect(pasted?.content.id).not.toBe(root.id)
    expect(clipOf('Bass', 0)?.id).toBe(root.id)
    expect(undoSteps()).toBe(2)
    expect(accepted(clip('Bass', 0), lane('Kick', 0))).toBeUndefined()
    expect(accepted(clip('Kick', 0), lane('Kick', 4))).toBe('drop.clip-on-lane')
  })

  it('do nothing once deleted mid-drag', () => {
    const dragged = clip('Bass', 0)
    useProjectStore.getState().deleteClip(track('Bass').id, 0)
    expect(accepted(dragged, slot('Lead', 1))).toBeUndefined()
    expect(accepted(dragged, lane('Bass', 0))).toBeUndefined()
  })
})

describe('samples', () => {
  const sample: DragPayload = { kind: 'sample', sampleId: kick.id }

  it('make an audio clip in an empty audio slot and open it, as Add audio clip does', () => {
    runDrop(sample, slot('Kick', 2), fakeContext(), NONE)
    expect(clipOf('Kick', 2)).toMatchObject({ sampleId: kick.id })
    expect(useSelectionStore.getState().clipId).toBe(clipOf('Kick', 2)!.id)
    expect(undoSteps()).toBe(1)
  })

  it('refuse an instrument slot, an occupied slot, tracks and a sample that is gone', () => {
    expect(accepted(sample, slot('Bass', 2))).toBeUndefined()
    expect(accepted(sample, slot('Kick', 0))).toBeUndefined()
    expect(accepted(sample, onTrack('Kick'))).toBeUndefined()
    expect(accepted({ kind: 'sample', sampleId: 'gone' }, slot('Kick', 2))).toBeUndefined()
  })
})

describe('presets', () => {
  const preset = (): DragPayload => ({ kind: 'sound', soundId: project().presets![0]!.id, preset: true })

  beforeEach(() => {
    const bass = track('Bass')
    useProjectStore.getState().resetProject(saveProjectPreset(project(), { owner: { kind: 'track', trackId: bass.id }, domain: 'patch' }, 'Warm'))
  })

  it('recall onto a track whose graph matches, as one undo step reported to the toasts', async () => {
    // A copy of the track has the same nodes and wires.
    const copy = useProjectStore.getState().duplicateTrack(track('Bass').id)!
    useProjectStore.getState().resetProject(project())
    expect(accepted(preset(), onTrack('Bass'))).toBe('drop.sound-on-track')
    expect(accepted(preset(), { kind: 'track', trackId: copy })).toBe('drop.sound-on-track')
    // Turned away from the preset, so the recall changes something.
    const saved = project().presets![0]!.values[0]!
    useProjectStore.getState().resetProject(editControlBase(project(), { ...saved.target, owner: { kind: 'track', trackId: copy } }, saved.value === 0 ? 1 : 0).project)
    await runDrop(preset(), { kind: 'track', trackId: copy }, fakeContext(), NONE)
    expect(usePersistenceStore.getState().notices.at(-1)?.message).toMatch(/controls recalled/)
    expect(undoSteps()).toBe(1)
  })

  it('refuse a track with another graph, an audio track, the master, and snapshots', () => {
    expect(accepted(preset(), onTrack('Lead'))).toBeUndefined()
    useProjectStore.getState().resetProject(editPatchAt(project(), { trackId: track('Bass').id }, (patch) => ({ ...patch, nodes: patch.nodes.slice(1) })))
    expect(accepted(preset(), onTrack('Bass'))).toBeUndefined()
    expect(accepted(preset(), onTrack('Kick'))).toBeUndefined()
    expect(accepted(preset(), master)).toBeUndefined()
    const snapshot = captureSnapshot(project(), { owner: { kind: 'track', trackId: track('Bass').id }, domain: 'track' }, 'Loud')
    useProjectStore.getState().resetProject(putSnapshot(project(), snapshot))
    expect(accepted({ kind: 'sound', soundId: snapshot.id, preset: false }, onTrack('Bass'))).toBeUndefined()
  })

  it("recall the master's effects preset onto the master", () => {
    useProjectStore.getState().resetProject(saveProjectPreset(project(), { owner: { kind: 'master' }, domain: 'fx' }, 'Glue'))
    const glue: DragPayload = { kind: 'sound', soundId: project().presets!.find((entry) => entry.name === 'Glue')!.id, preset: true }
    expect(accepted(glue, master)).toBe('drop.sound-on-master')
    expect(accepted(glue, onTrack('Bass'))).toBeUndefined()
  })
})

describe('library items', () => {
  const inserted: string[] = []
  const library = {
    insert: async (item: { name: string }, destination: { mode: string; scope?: unknown }, scene?: number) => {
      inserted.push(`${item.name} ${JSON.stringify(destination.scope)}${scene === undefined ? '' : ` scene ${scene}`}`)
      return `${item.name} copied into project`
    },
  } as unknown as PersonalLibrary
  const context = () => fakeContext({ library })
  const item = (name: string): DragPayload => ({ kind: 'library-item', itemId: useLibraryStore.getState().catalog.items.find((entry) => entry.name === name)!.id })
  const ownerJson = (name: string) => JSON.stringify({ kind: 'track', trackId: track(name).id })

  beforeEach(() => {
    inserted.length = 0
    const bass = track('Bass').id
    let catalog: LibraryCatalog = captureLibraryAsset(emptyLibrary(), project(), { owner: { kind: 'track', trackId: bass }, domain: 'patch' }, 'Synth', null)
    catalog = captureLibraryAsset(catalog, project(), { owner: { kind: 'track', trackId: bass }, domain: 'fx' }, 'Track fx', null)
    catalog = captureLibraryAsset(catalog, project(), { owner: { kind: 'master' }, domain: 'fx' }, 'Master fx', null)
    catalog = captureLibraryClip(catalog, project(), bass, clipOf('Bass', 0)!.id, 'Riff', null)
    useLibraryStore.setState({ catalog, openFolder: null })
  })

  it('replace the instrument of the track they are dropped on, reported to the toasts', async () => {
    expect(accepted(item('Synth'), onTrack('Lead'))).toBe('drop.library-item-on-track')
    await runDrop(item('Synth'), onTrack('Lead'), context(), NONE)
    expect(inserted).toEqual([`Synth {"owner":${ownerJson('Lead')},"domain":"patch"}`])
    expect(usePersistenceStore.getState().notices.at(-1)?.message).toBe('Synth copied into project')
    expect(accepted(item('Synth'), onTrack('Kick'))).toBeUndefined()
    expect(accepted(item('Synth'), master)).toBeUndefined()
  })

  it("put effects on a track or the master whose input they were made for", async () => {
    expect(accepted(item('Track fx'), onTrack('Kick'))).toBe('drop.library-item-on-track')
    expect(accepted(item('Track fx'), master)).toBeUndefined()
    expect(accepted(item('Master fx'), master)).toBe('drop.library-item-on-master')
    expect(accepted(item('Master fx'), onTrack('Bass'))).toBeUndefined()
    await runDrop(item('Master fx'), master, context(), NONE)
    expect(inserted).toEqual(['Master fx {"owner":{"kind":"master"},"domain":"fx"}'])
  })

  it('go into a canvas of their kind at the top level only', async () => {
    expect(accepted(item('Synth'), canvas('Pad'))).toBe('drop.library-item-on-canvas')
    expect(accepted(item('Synth'), canvas('Pad', 'fx'))).toBeUndefined()
    expect(accepted(item('Track fx'), canvas('Pad', 'fx'))).toBe('drop.library-item-on-canvas')
    expect(accepted(item('Synth'), canvas('Pad', undefined, ['module']))).toBeUndefined()
    await runDrop(item('Track fx'), canvas('Pad', 'fx'), context(), NONE)
    expect(inserted).toEqual([`Track fx {"owner":${ownerJson('Pad')},"domain":"fx"}`])
  })

  it('insert a clip into an empty slot of a track of its kind', async () => {
    expect(accepted(item('Riff'), slot('Lead', 1))).toBe('drop.library-item-on-slot')
    expect(accepted(item('Riff'), slot('Lead', 0))).toBeUndefined()
    expect(accepted(item('Riff'), slot('Kick', 1))).toBeUndefined()
    expect(accepted(item('Riff'), lane('Lead', 0))).toBeUndefined()
    expect(accepted(item('Riff'), onTrack('Lead'))).toBeUndefined()
    expect(accepted(item('Synth'), slot('Lead', 1))).toBeUndefined()
    await runDrop(item('Riff'), slot('Lead', 1), context(), NONE)
    await settle()
    expect(inserted).toEqual([`Riff {"owner":${ownerJson('Lead')},"domain":"patch"} scene 1`])
  })

  it('refuse when trashed', () => {
    const catalog = useLibraryStore.getState().catalog
    useLibraryStore.setState({ catalog: { ...catalog, items: catalog.items.map((entry) => ({ ...entry, trashed: true })) } })
    expect(accepted(item('Synth'), onTrack('Lead'))).toBeUndefined()
    expect(accepted(item('Riff'), slot('Lead', 1))).toBeUndefined()
  })
})
