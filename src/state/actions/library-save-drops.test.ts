import { type LibraryCatalog, addTrack, captureLibraryAsset, captureLibraryClip, captureLibraryPreset, captureLibrarySample, captureSnapshot, createNode, createReturnTrack, emptyLibrary, groupTrack, putSnapshot, saveLibraryFolder, saveProjectPreset, setGroupBus, trashLibraryEntry } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { usePersistenceStore } from '../persistence-store'
import { useProjectStore } from '../project-store'
import { type DragPayload, type DropTarget, dropFor, refusalFor, runDrop } from './drops'
import { fakeContext, kick, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const groupNamed = (name: string) => project().groups!.find((candidate) => candidate.name === name)!.id
const notices = () => usePersistenceStore.getState().notices

/** A library over a catalog in memory, capturing with the real core functions. */
let catalog: LibraryCatalog
const library = {
  read: async () => catalog,
  saveAsset: async (scope, name, folder) => (catalog = captureLibraryAsset(catalog, project(), scope, name, folder)),
  saveClip: async (trackId, clipId, name, folder) => (catalog = captureLibraryClip(catalog, project(), trackId, clipId, name, folder)),
  saveSample: async (sampleId, name, folder) => (catalog = captureLibrarySample(catalog, project(), sampleId, name, folder)),
  savePreset: async (presetId, folder) => (catalog = captureLibraryPreset(catalog, project(), presetId, folder)),
} as PersonalLibrary
const context = () => fakeContext({ library })
const accepted = (payload: DragPayload, target: DropTarget) => dropFor(payload, target, context())?.id
const refusal = (payload: DragPayload, target: DropTarget) => refusalFor(payload, target, context())
const drop = (payload: DragPayload, target: DropTarget) => runDrop(payload, target, context(), { alt: false })
const saved = () => catalog.items.filter((item) => item.content.kind !== 'preset').map((item) => [item.name, item.folderId, item.content.kind])

const KICKS: DropTarget = { kind: 'library-folder', folderId: 'kicks' }
const MINE: DropTarget = { kind: 'library-root', root: 'mine' }
const TRASH: DropTarget = { kind: 'library-root', root: 'trash' }
const OLD: DropTarget = { kind: 'library-folder', folderId: 'old' }

/**
 * The demo with a return, Bass in Drums (a bus), Lead in Keys (a folder group), a preset Warm and a snapshot Snap on
 * Pad; Kicks open in the Library, Pads beside it, Old in the trash.
 */
beforeEach(() => {
  let next = addTrack(loadDemo(), { ...createReturnTrack('Return A'), id: 'ret' })
  const drums = groupTrack(next, next.tracks.find((candidate) => candidate.name === 'Bass')!.id)
  const keys = groupTrack(drums.project, drums.project.tracks.find((candidate) => candidate.name === 'Lead')!.id)
  next = { ...keys.project, groups: keys.project.groups!.map((candidate) => ({ ...candidate, name: candidate.id === drums.groupId ? 'Drums' : 'Keys' })) }
  next = setGroupBus(next, drums.groupId!, true)
  const pad = { owner: { kind: 'track' as const, trackId: next.tracks.find((candidate) => candidate.name === 'Pad')!.id }, domain: 'patch' as const }
  useProjectStore.getState().resetProject(saveProjectPreset(putSnapshot(next, captureSnapshot(next, pad, 'Snap', 'snap')), pad, 'Warm', 'warm'))
  catalog = trashLibraryEntry(saveLibraryFolder(saveLibraryFolder(saveLibraryFolder(emptyLibrary(), 'Kicks', null, 'kicks'), 'Pads', null, 'pads'), 'Old', null, 'old'), 'old')
  useLibraryStore.setState({ catalog, active: { kind: 'folder', id: 'pads' } })
  usePersistenceStore.setState({ notices: [] })
})

describe('dropped on a library folder or My library', () => {
  it('an instrument track saves Instrument + notes there, not in the open folder', async () => {
    const bass: DragPayload = { kind: 'track', trackId: track('Bass').id }
    expect(accepted(bass, KICKS)).toBe('drop.track-on-library-folder')
    expect(dropFor(bass, KICKS, context())?.effect(bass, KICKS, { alt: false })).toBe('copy')
    await drop(bass, KICKS)
    await drop(bass, MINE)
    expect(saved()).toEqual([['Bass', 'kicks', 'instrument'], ['Bass', null, 'instrument']])
    expect(notices().map((notice) => notice.message)).toEqual(['Saved Bass to Kicks', 'Saved Bass to My library'])
    expect(notices()[0]?.action?.label).toBe('Show')
  })

  it('an audio or return track saves its effects', async () => {
    expect(accepted({ kind: 'track', trackId: 'ret' }, MINE)).toBe('drop.track-on-library-root')
    await drop({ kind: 'track', trackId: track('Kick').id }, KICKS)
    await drop({ kind: 'track', trackId: 'ret' }, MINE)
    expect(saved()).toEqual([['Kick effects', 'kicks', 'audio-effect'], ['Return A effects', null, 'audio-effect']])
  })

  it("a group with a bus saves the bus's effects; a folder group is refused with the reason", async () => {
    const drums: DragPayload = { kind: 'group', groupId: groupNamed('Drums') }, keys: DragPayload = { kind: 'group', groupId: groupNamed('Keys') }
    expect(accepted(drums, KICKS)).toBe('drop.group-on-library-folder')
    await drop(drums, KICKS)
    expect(saved()).toEqual([['Drums effects', 'kicks', 'audio-effect']])
    expect(accepted(keys, KICKS)).toBeUndefined()
    expect(accepted(keys, MINE)).toBeUndefined()
    expect(refusal(keys, KICKS)).toBe('Sum the group to a bus first')
  })

  it('a session clip saves the clip, while it exists', async () => {
    const bass = track('Bass') as Extract<ReturnType<typeof track>, { kind: 'instrument' }>
    const clip: DragPayload = { kind: 'clip', trackId: bass.id, clipId: bass.clips[0]!.id }
    expect(accepted(clip, KICKS)).toBe('drop.clip-on-library-folder')
    await drop(clip, KICKS)
    expect(saved()).toEqual([[bass.clips[0]!.name, 'kicks', 'midi-clip']])
    expect(accepted({ kind: 'clip', trackId: bass.id, clipId: 'gone' }, KICKS)).toBeUndefined()
  })

  it('a sample adds the sample', async () => {
    expect(accepted({ kind: 'sample', sampleId: kick.id }, MINE)).toBe('drop.sample-on-library-root')
    await drop({ kind: 'sample', sampleId: kick.id }, KICKS)
    expect(saved()).toEqual([['Kick', 'kicks', 'sample']])
    expect(accepted({ kind: 'sample', sampleId: 'gone' }, KICKS)).toBeUndefined()
  })

  it('a project preset saves it on its own; a snapshot has nothing to save', async () => {
    expect(accepted({ kind: 'sound', soundId: 'warm', preset: true }, KICKS)).toBe('drop.sound-on-library-folder')
    await drop({ kind: 'sound', soundId: 'warm', preset: true }, KICKS)
    expect(saved()).toEqual([['Warm', 'kicks', 'instrument']])
    expect(catalog.items).toHaveLength(1)
    expect(accepted({ kind: 'sound', soundId: 'snap', preset: false }, KICKS)).toBeUndefined()
  })

  it('a graph that reads another track is refused up front, with the reason', () => {
    const kickTrack = track('Kick'), pad = track('Pad')
    const routed = createNode('trackAudio', 0, 0)
    useProjectStore.getState().resetProject({ ...project(), tracks: project().tracks.map((candidate) => (candidate.id === kickTrack.id ? { ...candidate, fx: { ...candidate.fx, nodes: [...candidate.fx.nodes, { ...routed, trackId: pad.id }] } } : candidate)) })
    const payload: DragPayload = { kind: 'track', trackId: kickTrack.id }
    expect(accepted(payload, KICKS)).toBeUndefined()
    expect(refusal(payload, KICKS)).toBe('Uses Track audio from Pad')
    expect(refusal(payload, MINE)).toBe('Uses Track audio from Pad')
  })
})

describe('dropped on the trash or a trashed folder', () => {
  it('nothing from the project lands, and no reason is given', () => {
    const bass = track('Bass') as Extract<ReturnType<typeof track>, { kind: 'instrument' }>
    const payloads: DragPayload[] = [
      { kind: 'track', trackId: bass.id }, { kind: 'track', trackId: 'ret' }, { kind: 'group', groupId: groupNamed('Drums') }, { kind: 'group', groupId: groupNamed('Keys') },
      { kind: 'clip', trackId: bass.id, clipId: bass.clips[0]!.id }, { kind: 'sample', sampleId: kick.id }, { kind: 'sound', soundId: 'warm', preset: true },
    ]
    for (const payload of payloads) {
      expect(accepted(payload, TRASH)).toBeUndefined()
      expect(accepted(payload, OLD)).toBeUndefined()
      expect(refusal(payload, TRASH)).toBeUndefined()
    }
  })
})
