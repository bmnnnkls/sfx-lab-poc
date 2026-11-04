import { type LibraryCatalog, addTrack, captureLibraryAsset, captureLibraryClip, captureLibrarySample, createNode, createReturnTrack, emptyLibrary, groupTrack, saveLibraryFolder, setGroupBus, trashLibraryEntry } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from '../layout-store'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { usePersistenceStore } from '../persistence-store'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { describeActions, runAction, type Subject } from '.'
import { fakeContext, kick, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const entry = (subject: Subject, id: string) => describeActions(subject, fakeContext()).find((item) => item.id === id)
const notices = () => usePersistenceStore.getState().notices

/** A library over a catalog in memory, capturing with the real core functions. */
let catalog: LibraryCatalog
const library = {
  read: async () => catalog,
  saveAsset: async (scope, name, folder) => (catalog = captureLibraryAsset(catalog, project(), scope, name, folder)),
  saveClip: async (trackId, clipId, name, folder) => (catalog = captureLibraryClip(catalog, project(), trackId, clipId, name, folder)),
  saveSample: async (sampleId, name, folder) => (catalog = captureLibrarySample(catalog, project(), sampleId, name, folder)),
} as PersonalLibrary
const context = () => fakeContext({ library })
const saved = () => catalog.items.filter((item) => item.content.kind !== 'preset').map((item) => [item.name, item.folderId, item.content.kind])

/** The demo with a return, Bass in Drums (a bus) and Lead in Keys (a folder group). */
beforeEach(() => {
  let next = addTrack(loadDemo(), { ...createReturnTrack('Return A'), id: 'ret' })
  const drums = groupTrack(next, next.tracks.find((candidate) => candidate.name === 'Bass')!.id)
  const keys = groupTrack(drums.project, drums.project.tracks.find((candidate) => candidate.name === 'Lead')!.id)
  next = { ...keys.project, groups: keys.project.groups!.map((candidate) => ({ ...candidate, name: candidate.id === drums.groupId ? 'Drums' : 'Keys' })) }
  useProjectStore.getState().resetProject(setGroupBus(next, drums.groupId!, true))
  catalog = saveLibraryFolder(emptyLibrary(), 'Kicks', null, 'kicks')
  useLibraryStore.setState({ catalog, openFolder: null, active: null })
  usePersistenceStore.setState({ notices: [] })
  useRenameStore.getState().stop()
})

describe('Save to library', () => {
  it('offers an instrument its three graphs, Note effects only with a note graph to save', () => {
    const bass: Subject = { kind: 'track', trackId: track('Bass').id }
    expect(entry(bass, 'track.save-to-library')).toMatchObject({
      title: 'Save to library',
      choices: [{ id: 'patch', title: 'Instrument + notes' }, { id: 'fx', title: 'Audio effects' }, { id: 'notes', title: 'Note effects', enabled: false }],
    })
    expect(entry(bass, 'track.save-effects-to-library')).toBeUndefined()
    const bassTrack = track('Bass') as Extract<ReturnType<typeof track>, { kind: 'instrument' }>
    useProjectStore.getState().resetProject({ ...project(), tracks: project().tracks.map((candidate) => (candidate.id === bassTrack.id ? { ...bassTrack, noteGraph: { ...bassTrack.noteGraph, nodes: [...bassTrack.noteGraph.nodes, createNode('transpose', 0, 0)] } } : candidate)) })
    expect(entry(bass, 'track.save-to-library')?.choices?.[2]?.enabled).toBe(true)
  })

  it('offers audio and return tracks, a bus and the master their effects, and a folder group nothing', () => {
    expect(entry({ kind: 'track', trackId: track('Kick').id }, 'track.save-effects-to-library')?.title).toBe('Save effects to library')
    expect(entry({ kind: 'track', trackId: 'ret' }, 'track.save-effects-to-library')?.title).toBe('Save effects to library')
    expect(entry({ kind: 'track', trackId: 'ret' }, 'track.save-to-library')).toBeUndefined()
    const group = (name: string): Subject => ({ kind: 'group', groupId: project().groups!.find((candidate) => candidate.name === name)!.id })
    expect(entry(group('Drums'), 'group.save-effects-to-library')).toBeDefined()
    expect(entry(group('Keys'), 'group.save-effects-to-library')).toBeUndefined()
    expect(entry({ kind: 'master' }, 'master.save-effects-to-library')).toBeDefined()
  })

  it('names each save after its source, into the open folder or the top level', async () => {
    const bass = track('Bass').id
    await runAction('track.save-to-library', { kind: 'track', trackId: bass }, context(), { choice: 'patch' })
    await runAction('track.save-to-library', { kind: 'track', trackId: bass }, context(), { choice: 'fx' })
    useLibraryStore.setState({ openFolder: 'kicks' })
    await runAction('track.save-effects-to-library', { kind: 'track', trackId: 'ret' }, context())
    await runAction('group.save-effects-to-library', { kind: 'group', groupId: project().groups!.find((candidate) => candidate.name === 'Drums')!.id }, context())
    await runAction('master.save-effects-to-library', { kind: 'master' }, context())
    await runAction('sample.add-to-library', { kind: 'sample', sampleId: kick.id }, context())
    const kickTrack = track('Kick') as Extract<ReturnType<typeof track>, { kind: 'audio' }>
    await runAction('clip.save-to-library', { kind: 'clip', trackId: kickTrack.id, clipId: kickTrack.clips[0]!.id }, context())
    expect(saved()).toEqual([
      ['Bass', null, 'instrument'], ['Bass effects', null, 'audio-effect'], ['Return A effects', 'kicks', 'audio-effect'], ['Drums effects', 'kicks', 'audio-effect'],
      ['Master effects', 'kicks', 'audio-effect'], ['Kick', 'kicks', 'sample'], [kickTrack.clips[0]!.name, 'kicks', 'audio-clip'],
    ])
    expect(notices().map((notice) => notice.message).slice(0, 3)).toEqual(['Saved Bass to My library', 'Saved Bass effects to My library', 'Saved Return A effects to Kicks'])
    expect(useLibraryStore.getState().catalog).toBe(catalog)
    // A trashed open folder is no place to save: the top level is.
    catalog = trashLibraryEntry(catalog, 'kicks')
    await runAction('master.save-effects-to-library', { kind: 'master' }, context())
    expect(saved().at(-1)).toEqual(['Master effects', null, 'audio-effect'])
    expect(notices().at(-1)?.message).toBe('Saved Master effects to My library')
  })

  it("offers Show, which reveals the new item in the Library and starts renaming it", async () => {
    await runAction('track.save-to-library', { kind: 'track', trackId: track('Lead').id }, context(), { choice: 'patch' })
    const notice = notices().at(-1)!
    expect(notice).toMatchObject({ kind: 'info', message: 'Saved Lead to My library', action: { label: 'Show' } })
    notice.action!.run()
    const itemId = catalog.items.find((item) => item.name === 'Lead')!.id
    expect(useLibraryStore.getState().active).toEqual({ kind: 'item', id: itemId })
    expect(useLayoutStore.getState().visible).toContain('library')
    expect(useRenameStore.getState().renaming).toEqual({ subject: { kind: 'library-item', itemId }, origin: 'library' })
  })

  it("reports a refused capture's reason", async () => {
    const kickTrack = track('Kick')
    useProjectStore.getState().resetProject({ ...project(), tracks: project().tracks.map((candidate) => (candidate.id === kickTrack.id ? { ...candidate, fx: { ...candidate.fx, nodes: [...candidate.fx.nodes, createNode('trackAudio', 0, 0)] } } : candidate)) })
    await runAction('track.save-effects-to-library', { kind: 'track', trackId: kickTrack.id }, context())
    expect(notices().at(-1)).toMatchObject({ kind: 'error', message: 'Presets require graphs without external track routing' })
    expect(saved()).toEqual([])
  })
})
