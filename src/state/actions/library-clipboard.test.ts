import { type LibraryCatalog, type LibraryItem, type SnapshotScope, captureLibraryAsset, captureLibrarySample, emptyLibrary, loadFactoryModule, saveLibraryFolder, saveLibraryItem, trashLibraryEntry } from '@core'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { usePersistenceStore } from '../persistence-store'
import { useProjectStore } from '../project-store'
import { canRunAction, describeActions, runAction, runVerb, type Subject } from '.'
import { clipClipboard, libraryClipboard } from './clipboards'
import { libraryLanding } from './library-landing'
import { fakeContext, kick, loadDemo } from './test-support'

let factory: LibraryCatalog
beforeAll(async () => {
  factory = (await loadFactoryModule()).createFactoryCatalog()
})

/** A library over a catalog in memory, counting its updates, saving with the real capture. */
let catalog: LibraryCatalog
let updates = 0
const library = {
  read: async () => catalog,
  update: async (edit: (value: LibraryCatalog) => LibraryCatalog) => {
    updates++
    return (catalog = edit(catalog))
  },
  saveAsset: async (scope: SnapshotScope, name: string, folder: string | null) => (catalog = captureLibraryAsset(catalog, useProjectStore.getState().project, scope, name, folder)),
  saveSample: async (sampleId: string, name: string, folder: string | null) => (catalog = captureLibrarySample(catalog, useProjectStore.getState().project, sampleId, name, folder)),
  stopPreview: () => {},
} as unknown as PersonalLibrary
const context = (origin: 'library' | null = 'library') => fakeContext({ library, origin })
const notices = () => usePersistenceStore.getState().notices.map((notice) => notice.message)
const sync = () => useLibraryStore.setState({ catalog })

const item = (itemId: string): Subject => ({ kind: 'library-item', itemId })
const folder = (folderId: string): Subject => ({ kind: 'library-folder', folderId })
const MINE: Subject = { kind: 'library-root', root: 'mine' }
const placeOf = (id: string) => catalog.items.find((candidate) => candidate.id === id)?.folderId ?? catalog.folders.find((candidate) => candidate.id === id)?.parentId
const named = (name: string) => catalog.items.filter((candidate) => candidate.name === name)
const sound = (id: string, folderId: string | null): LibraryItem => ({ id, name: id, folderId, content: { kind: 'sample', sampleId: 's' } })
const verb = (name: 'cut' | 'copy' | 'paste', subject: Subject) => runVerb(name, [subject], context())
const paste = async (subject: Subject) => {
  await runAction(subject.kind === 'library-root' ? 'library-root.paste' : 'library-folder.paste', subject, context())
  sync()
}

/** Drums > Kicks (kick, with the preset tight), Pads; riff and hat at the top level; Old (with snare) in the trash. */
beforeEach(() => {
  loadDemo()
  catalog = emptyLibrary()
  for (const [id, parent] of [['drums', null], ['kicks', 'drums'], ['pads', null], ['old', null]] as const) catalog = saveLibraryFolder(catalog, id, parent, id)
  for (const value of [sound('kick', 'kicks'), sound('riff', null), sound('hat', null), sound('snare', 'old')]) catalog = saveLibraryItem(catalog, value)
  catalog = saveLibraryItem(catalog, { id: 'tight', name: 'tight', folderId: 'kicks', content: { kind: 'preset', assetId: 'kick', revisionId: 'r', state: {} } } as unknown as LibraryItem)
  catalog = trashLibraryEntry(catalog, 'old')
  useLibraryStore.setState({ catalog, factory, active: null, selected: [] })
  usePersistenceStore.setState({ notices: [] })
  libraryClipboard.set(null)
  clipClipboard.set(null)
  updates = 0
})

describe('cut and paste', () => {
  it('moves the selection into a folder in one update, and empties the clipboard', async () => {
    useLibraryStore.setState({ selected: ['riff', 'hat'] })
    expect(verb('cut', item('riff'))).toBe(true)
    expect(libraryClipboard.get()).toEqual({ mode: 'cut', entries: [item('riff'), item('hat')] })
    // The project's clipboards are apart: a cut doesn't touch a copied clip.
    expect(clipClipboard.get()).toBeNull()
    expect(verb('paste', folder('pads'))).toBe(true)
    await new Promise((resolve) => setTimeout(resolve))
    sync()
    expect([placeOf('riff'), placeOf('hat')]).toEqual(['pads', 'pads'])
    expect(updates).toBe(1)
    expect(notices()).toEqual(['Moved 2 things to pads'])
    expect(libraryClipboard.get()).toBeNull()
    expect(describeActions(folder('drums'), context()).find((entry) => entry.id === 'library-folder.paste')?.enabled).toBe(false)
  })

  it('moves a folder with what is in it, to the top level on My library, never into itself', async () => {
    verb('cut', folder('kicks'))
    expect(canRunAction('library-folder.paste', folder('kicks'), context())).toBe(false)
    // Where it already is, a move is refused.
    expect(canRunAction('library-folder.paste', folder('drums'), context())).toBe(false)
    await paste(MINE)
    expect([placeOf('kicks'), placeOf('kick'), placeOf('tight')]).toEqual([null, 'kicks', 'kicks'])
    expect(notices()).toEqual(['Moved kicks to My library'])
  })

  it('cuts only My library: not the Factory, a preset or a row of This project', () => {
    const titles = (subject: Subject, origin: 'library' | null = 'library') => describeActions(subject, context(origin)).map((entry) => entry.title)
    expect(titles(item('factory:drums/kick'))).not.toContain('Cut')
    expect(titles(folder('factory:drums'))).not.toContain('Cut')
    expect(titles(item('tight'))).not.toContain('Cut')
    expect(titles(item('tight'))).not.toContain('Copy')
    const bass = useProjectStore.getState().project.tracks.find((track) => track.name === 'Bass')!
    const clip: Subject = { kind: 'clip', trackId: bass.id, clipId: bass.kind === 'instrument' ? bass.clips[0]!.id : '' }
    expect(titles(clip)).not.toContain('Cut')
    expect(titles(clip, null)).toContain('Cut')
    // A selection's presets go with their sound; the ones that can't be cut stay out.
    useLibraryStore.setState({ selected: ['kick', 'tight', 'factory:drums/kick'] })
    verb('cut', item('kick'))
    expect(libraryClipboard.get()?.entries).toEqual([item('kick')])
  })

  it('restores a cut thing that was trashed since, and refuses one that is gone', async () => {
    verb('cut', item('riff'))
    catalog = trashLibraryEntry(catalog, 'riff')
    sync()
    await paste(folder('pads'))
    expect([placeOf('riff'), catalog.items.find((value) => value.id === 'riff')?.trashed]).toEqual(['pads', false])
    expect(notices()).toEqual(['Restored riff to pads'])
    verb('cut', item('hat'))
    catalog = { ...catalog, items: catalog.items.filter((value) => value.id !== 'hat') }
    sync()
    expect(canRunAction('library-root.paste', MINE, context())).toBe(false)
  })
})

describe('copy and paste', () => {
  it('copies My library things beside themselves or elsewhere, and keeps them on the clipboard', async () => {
    verb('copy', item('riff'))
    await paste(MINE)
    await paste(folder('pads'))
    expect(named('riff').map((value) => value.folderId).sort()).toEqual([null, 'pads'])
    expect(named('riff copy').map((value) => value.folderId)).toEqual([null])
    expect(libraryClipboard.get()?.mode).toBe('copy')
    verb('copy', folder('drums'))
    await paste(folder('pads'))
    expect(catalog.folders.filter((value) => value.name === 'drums' && !value.trashed).map((value) => value.parentId).sort()).toEqual(['pads', null].sort())
    expect(canRunAction('library-folder.paste', folder('kicks'), context())).toBe(false)
  })

  it('copies the Factory into My library, with the copy’s Show', async () => {
    verb('copy', item('factory:drums/kick'))
    const reports: unknown[] = []
    await runAction('library-folder.paste', folder('pads'), context(), { report: (_kind, text, action) => reports.push([text, action?.label]) })
    expect(reports).toEqual([['Copied Kick to pads', 'Show']])
    expect(catalog.items.find((value) => value.name === 'Kick')).toMatchObject({ folderId: 'pads', content: { kind: 'instrument' } })
    // A Factory thing and one of My library land in one update.
    sync()
    useLibraryStore.setState({ selected: ['factory:drums/clap', 'riff'] })
    verb('copy', item('riff'))
    updates = 0
    await paste(folder('drums'))
    expect(updates).toBe(1)
    expect([named('Clap').map((value) => value.folderId), named('riff').map((value) => value.folderId).sort()]).toEqual([['drums'], ['drums', null]])
    expect(notices().at(-1)).toBe('Copied 2 things to drums')
  })

  it('saves a graph, a clip or a sample of This project copied in the Library', async () => {
    const bass = useProjectStore.getState().project.tracks.find((track) => track.name === 'Bass')!
    expect(runVerb('copy', [{ kind: 'project-graph', owner: { kind: 'track', trackId: bass.id }, domain: 'patch' }], context())).toBe(true)
    await paste(folder('pads'))
    expect(named('Bass').map((value) => [value.folderId, value.content.kind])).toEqual([['pads', 'instrument']])
    // A clip copied in the Library goes on both clipboards; outside it, on the clip clipboard only.
    const clip: Subject = { kind: 'clip', trackId: bass.id, clipId: bass.kind === 'instrument' ? bass.clips[0]!.id : '' }
    libraryClipboard.set(null)
    runVerb('copy', [clip], context(null))
    expect([!!clipClipboard.get(), libraryClipboard.get()]).toEqual([true, null])
    runVerb('copy', [clip], context())
    expect(libraryClipboard.get()?.entries).toEqual([clip])
    // A sample: ⌘C only in the Library.
    expect(runVerb('copy', [{ kind: 'sample', sampleId: kick.id }], context(null))).toBe(false)
    runVerb('copy', [{ kind: 'sample', sampleId: kick.id }], context())
    await paste(MINE)
    expect(named('Kick').map((value) => [value.folderId, value.content.kind])).toEqual([[null, 'sample']])
  })
})

describe('landing several things', () => {
  it('refuses all when any is refused, and goes to the trash together', () => {
    const items = (...ids: string[]) => ids.map((itemId) => ({ kind: 'library-item', itemId }) as const)
    expect(libraryLanding(items('riff', 'kick'), { kind: 'library-folder', folderId: 'kicks' }, 'move')).toBeUndefined()
    expect(libraryLanding(items('riff', 'factory:drums/kick'), { kind: 'library-root', root: 'trash' }, 'move')).toBeUndefined()
    expect(libraryLanding(items('riff', 'hat'), { kind: 'library-folder', folderId: 'old' }, 'move')).toBeUndefined()
    expect(libraryLanding(items('riff', 'tight'), { kind: 'library-folder', folderId: 'pads' }, 'move')).toBeUndefined()
    // A preset whose sound lands too goes with it.
    expect(libraryLanding(items('kick', 'tight'), { kind: 'library-folder', folderId: 'pads' }, 'move')).toMatchObject({ moved: 1 })
    expect(libraryLanding(items('riff', 'tight'), { kind: 'library-root', root: 'trash' }, 'move')).toMatchObject({ trashed: 2 })
  })
})
