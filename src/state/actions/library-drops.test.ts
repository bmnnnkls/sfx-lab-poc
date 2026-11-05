import { type LibraryCatalog, type LibraryItem, emptyLibrary, saveLibraryFolder, saveLibraryItem, trashLibraryEntry } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { usePersistenceStore } from '../persistence-store'
import { type DragPayload, type DropTarget, dropFor, refusalFor, runDrop } from './drops'
import { fakeContext } from './test-support'

let catalog: LibraryCatalog
const library = {
  update: async (edit: (value: LibraryCatalog) => LibraryCatalog) => (catalog = edit(catalog)),
  stopPreview: () => {},
} as unknown as PersonalLibrary
const context = () => fakeContext({ library })
const accepted = (payload: DragPayload, target: DropTarget) => dropFor(payload, target, context())?.id
const effect = (payload: DragPayload, target: DropTarget, alt: boolean) => dropFor(payload, target, context())?.effect(payload, target, { alt })
const drop = async (payload: DragPayload, target: DropTarget, alt = false) => {
  await runDrop(payload, target, context(), { alt })
  useLibraryStore.setState({ catalog })
}

const item = (itemId: string): DragPayload => ({ kind: 'library-item', itemId })
const folder = (folderId: string): DragPayload => ({ kind: 'library-folder', folderId })
const into = (folderId: string): DropTarget => ({ kind: 'library-folder', folderId })
const MINE: DropTarget = { kind: 'library-root', root: 'mine' }
const TRASH: DropTarget = { kind: 'library-root', root: 'trash' }
const entry = (id: string) => catalog.items.find((candidate) => candidate.id === id) ?? catalog.folders.find((candidate) => candidate.id === id)
const sound = (id: string, folderId: string | null): LibraryItem => ({ id, name: id, folderId, content: { kind: 'sample', sampleId: 's' } })

/** Drums > Kicks (Kick, with the preset Tight), Pads; Riff at the top level; Old (with Snare) in the trash. */
beforeEach(() => {
  catalog = emptyLibrary()
  for (const [id, parent] of [['drums', null], ['kicks', 'drums'], ['pads', null], ['old', null]] as const) catalog = saveLibraryFolder(catalog, id, parent, id)
  for (const value of [sound('kick', 'kicks'), sound('riff', null), sound('snare', 'old')]) catalog = saveLibraryItem(catalog, value)
  catalog = saveLibraryItem(catalog, { id: 'tight', name: 'Tight', folderId: 'kicks', content: { kind: 'preset', assetId: 'kick', revisionId: 'r', state: {} } } as unknown as LibraryItem)
  catalog = trashLibraryEntry(catalog, 'old')
  useLibraryStore.setState({ catalog, active: null })
  usePersistenceStore.setState({ notices: [] })
})

describe('a live library item', () => {
  it('moves into a folder with its presets, and Alt copies it', async () => {
    expect(accepted(item('kick'), into('pads'))).toBe('drop.library-item-on-folder')
    expect([effect(item('kick'), into('pads'), false), effect(item('kick'), into('pads'), true)]).toEqual(['move', 'copy'])
    await drop(item('kick'), into('pads'))
    expect([entry('kick'), entry('tight')].map((value) => (value as LibraryItem).folderId)).toEqual(['pads', 'pads'])
    await drop(item('kick'), into('drums'), true)
    expect(catalog.items.filter((value) => value.name === 'kick').map((value) => value.folderId).sort()).toEqual(['drums', 'pads'])
    expect(usePersistenceStore.getState().notices.map((notice) => notice.message)).toEqual(['Moved', 'Copied'])
  })

  it('moves to the top level on My library, and Alt copies it there', async () => {
    expect(accepted(item('kick'), MINE)).toBe('drop.library-item-on-root')
    await drop(item('kick'), MINE)
    expect((entry('kick') as LibraryItem).folderId).toBeNull()
    expect(effect(item('kick'), MINE, true)).toBeUndefined()
    await drop(item('riff'), into('pads'), true)
    expect(catalog.items.filter((value) => value.name === 'riff')).toHaveLength(2)
  })

  it('is trashed with its presets on the trash', async () => {
    expect(accepted(item('kick'), TRASH)).toBe('drop.library-item-on-trash')
    await drop(item('kick'), TRASH)
    expect([entry('kick'), entry('tight')].every((value) => value?.trashed)).toBe(true)
  })

  it('refuses the folder it is already in, and a trashed folder', () => {
    expect(accepted(item('kick'), into('kicks'))).toBeUndefined()
    expect(accepted(item('riff'), MINE)).toBeUndefined()
    expect(accepted(item('riff'), into('old'))).toBeUndefined()
    expect(accepted(item('gone'), into('pads'))).toBeUndefined()
  })
})

describe('a trashed library item', () => {
  beforeEach(() => {
    catalog = trashLibraryEntry(catalog, 'kick')
    useLibraryStore.setState({ catalog })
  })

  it('is restored into the folder it lands on, or the top level, with its presets', async () => {
    expect(accepted(item('kick'), into('kicks'))).toBe('drop.library-item-on-folder')
    expect(effect(item('kick'), into('pads'), true)).toBe('move')
    await drop(item('kick'), into('pads'))
    expect([entry('kick'), entry('tight')].map((value) => [(value as LibraryItem).folderId, !!value?.trashed])).toEqual([['pads', false], ['pads', false]])
    catalog = trashLibraryEntry(catalog, 'kick')
    useLibraryStore.setState({ catalog })
    await drop(item('kick'), MINE)
    expect(entry('kick')).toMatchObject({ folderId: null, trashed: false })
    expect(usePersistenceStore.getState().notices.map((notice) => notice.message)).toEqual(['Restored', 'Restored'])
  })

  it('refuses the trash', () => {
    expect(accepted(item('kick'), TRASH)).toBeUndefined()
  })
})

describe('a live library folder', () => {
  it('moves inside a folder or to the top level, and Alt copies it deep', async () => {
    expect(accepted(folder('kicks'), into('pads'))).toBe('drop.library-folder-on-folder')
    await drop(folder('kicks'), into('pads'))
    expect((entry('kicks') as { parentId: string | null }).parentId).toBe('pads')
    expect(accepted(folder('kicks'), MINE)).toBe('drop.library-folder-on-root')
    await drop(folder('kicks'), MINE)
    expect((entry('kicks') as { parentId: string | null }).parentId).toBeNull()
    expect(effect(folder('drums'), into('pads'), true)).toBe('copy')
    await drop(folder('drums'), into('pads'), true)
    expect(catalog.folders.filter((value) => value.name === 'drums').map((value) => value.parentId).sort()).toEqual([null, 'pads'].sort())
  })

  it('refuses itself, a folder inside it, its own parent and a trashed folder', () => {
    expect(accepted(folder('drums'), into('drums'))).toBeUndefined()
    expect(accepted(folder('drums'), into('kicks'))).toBeUndefined()
    expect(accepted(folder('kicks'), into('drums'))).toBeUndefined()
    expect(accepted(folder('drums'), MINE)).toBeUndefined()
    expect(accepted(folder('pads'), into('old'))).toBeUndefined()
  })

  it('is trashed with its contents on the trash', async () => {
    expect(accepted(folder('drums'), TRASH)).toBe('drop.library-folder-on-trash')
    await drop(folder('drums'), TRASH)
    expect(['drums', 'kicks', 'kick', 'tight'].every((id) => entry(id)?.trashed)).toBe(true)
  })
})

describe('a trashed library folder', () => {
  it('is restored inside a folder or at the top level, its old parents left in the trash', async () => {
    expect(accepted(folder('old'), into('pads'))).toBe('drop.library-folder-on-folder')
    await drop(folder('old'), into('pads'))
    expect(entry('old')).toMatchObject({ parentId: 'pads', trashed: false })
    expect(entry('snare')?.trashed).toBe(false)
    catalog = trashLibraryEntry(catalog, 'drums')
    useLibraryStore.setState({ catalog })
    expect(accepted(folder('kicks'), MINE)).toBe('drop.library-folder-on-root')
    await drop(folder('kicks'), MINE)
    expect([entry('kicks')?.trashed, entry('drums')?.trashed]).toEqual([false, true])
  })

  it('refuses the trash', () => {
    expect(accepted(folder('old'), TRASH)).toBeUndefined()
  })
})

describe('a preset', () => {
  it('goes only to the trash, since it goes where its sound goes', async () => {
    expect(accepted(item('tight'), into('pads'))).toBeUndefined()
    expect(accepted(item('tight'), MINE)).toBeUndefined()
    expect(accepted(item('tight'), TRASH)).toBe('drop.library-item-on-trash')
    await drop(item('tight'), TRASH)
    expect([entry('tight')?.trashed, entry('kick')?.trashed]).toEqual([true, undefined])
  })
})

describe('anything else', () => {
  it('lands on no library folder or root', () => {
    const others: DragPayload[] = [{ kind: 'sample', sampleId: 's' }, { kind: 'track', trackId: 't' }, { kind: 'group', groupId: 'g' }, { kind: 'sound', soundId: 's', preset: true }, { kind: 'clip', trackId: 't', clipId: 'c' }]
    for (const payload of others) for (const target of [into('pads'), MINE, TRASH]) expect(accepted(payload, target)).toBeUndefined()
  })
})

describe('several library items', () => {
  const several = (...ids: string[]): DragPayload => ({ kind: 'library-items', ids })

  it('move into a folder together, Alt copies them, and the trash takes them', async () => {
    catalog = saveLibraryItem(catalog, sound('hat', null))
    useLibraryStore.setState({ catalog })
    expect(accepted(several('riff', 'hat', 'kick'), into('pads'))).toBe('drop.library-items-on-folder')
    expect([effect(several('riff', 'hat'), into('pads'), false), effect(several('riff', 'hat'), into('pads'), true)]).toEqual(['move', 'copy'])
    // A preset whose sound is dragged too goes with it.
    await drop(several('riff', 'hat', 'kick', 'tight'), into('pads'))
    expect(['riff', 'hat', 'kick', 'tight'].map((id) => (entry(id) as LibraryItem).folderId)).toEqual(['pads', 'pads', 'pads', 'pads'])
    await drop(several('riff', 'hat'), MINE, true)
    expect(catalog.items.filter((value) => value.name === 'riff').map((value) => value.folderId).sort()).toEqual(['pads', null].sort())
    await drop(several('riff', 'hat'), TRASH)
    expect([entry('riff'), entry('hat')].every((value) => value?.trashed)).toBe(true)
    expect(usePersistenceStore.getState().notices.map((notice) => notice.message)).toEqual(['Moved 3 things to pads', 'Copied 2 things to My library', 'Moved 2 things to the trash'])
  })

  it('are refused together when any one is, and a trashed one is restored', async () => {
    // riff is at the top level already; Tight can't move without its sound; Old is in the trash.
    expect(accepted(several('kick', 'riff'), MINE)).toBeUndefined()
    expect(accepted(several('riff', 'tight'), into('pads'))).toBeUndefined()
    expect(accepted(several('kick', 'riff'), into('old'))).toBeUndefined()
    await drop(several('snare', 'riff'), into('pads'))
    expect([entry('snare'), entry('riff')].map((value) => [(value as LibraryItem).folderId, !!value?.trashed])).toEqual([['pads', false], ['pads', false]])
  })

  it('refuse a track, a slot, the master, a group or a graph, saying why', () => {
    const targets: DropTarget[] = [
      { kind: 'track', trackId: 't' },
      { kind: 'slot', trackId: 't', scene: 0 },
      { kind: 'master' },
      { kind: 'group', groupId: 'g' },
      { kind: 'canvas', target: { master: true }, path: [], at: { x: 0, y: 0 } },
    ]
    for (const target of targets) {
      expect(accepted(several('kick', 'riff'), target)).toBeUndefined()
      expect(refusalFor(several('kick', 'riff'), target, context())).toBe('Drop one sound at a time')
    }
  })
})
