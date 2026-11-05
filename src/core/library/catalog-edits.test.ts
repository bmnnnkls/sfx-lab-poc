import { describe, expect, it } from 'vitest'
import { copyLibraryEntries, duplicateLibraryFolder, emptyLibrary, libraryItemDuplicate, moveLibraryEntry, saveLibraryFolder, saveLibraryItem, trashLibraryEntry, type LibraryCatalog, type LibraryItem } from './index'

const revision = { id: 'rev', payload: { kind: 'instrument', modules: [], sampleIds: ['s'] } } as unknown as LibraryCatalog['revisions'][number]
const sound = (id: string, folderId: string | null): LibraryItem => ({ id, name: id, folderId, content: { kind: 'instrument', revisionId: 'rev', state: {} } } as unknown as LibraryItem)
const preset = (id: string, assetId: string, folderId: string | null): LibraryItem => ({ id, name: id, folderId, content: { kind: 'preset', assetId, revisionId: 'rev', state: {} } } as unknown as LibraryItem)

/** Drums > Kicks; Pads; the Kick sound in Kicks with two presets, Tight kept in Pads by an older move. */
const setup = (): LibraryCatalog => {
  let c: LibraryCatalog = { ...emptyLibrary(), revisions: [revision], samples: [{ id: 's' } as LibraryCatalog['samples'][number]] }
  c = saveLibraryFolder(c, 'Drums', null, 'drums')
  c = saveLibraryFolder(c, 'Kicks', 'drums', 'kicks')
  c = saveLibraryFolder(c, 'Pads', null, 'pads')
  for (const item of [sound('kick', 'kicks'), preset('tight', 'kick', 'pads'), preset('boom', 'kick', 'kicks'), sound('pad', 'pads')]) c = saveLibraryItem(c, item)
  return c
}
const folderOf = (c: LibraryCatalog, id: string) => c.items.find(i => i.id === id)?.folderId

describe('moving library entries', () => {
  it('moves an item with its live presets, wherever they were kept', () => {
    let c = setup()
    c = trashLibraryEntry(c, 'boom')
    c = moveLibraryEntry(c, 'kick', 'pads')
    expect([folderOf(c, 'kick'), folderOf(c, 'tight'), folderOf(c, 'boom')]).toEqual(['pads', 'pads', 'kicks'])
    c = moveLibraryEntry(c, 'kick', null)
    expect(folderOf(c, 'kick')).toBeNull()
  })

  it('refuses a folder into itself or a folder inside it, a trashed or missing destination, and a preset alone', () => {
    const c = setup()
    expect(() => moveLibraryEntry(c, 'drums', 'drums')).toThrow(/itself/)
    expect(() => moveLibraryEntry(c, 'drums', 'kicks')).toThrow(/itself/)
    expect(() => moveLibraryEntry(trashLibraryEntry(c, 'pads'), 'kick', 'pads')).toThrow(/unavailable/)
    expect(() => moveLibraryEntry(c, 'kick', 'nowhere')).toThrow(/unavailable/)
    expect(() => moveLibraryEntry(c, 'tight', 'drums')).toThrow(/preset/)
    expect(moveLibraryEntry(c, 'kicks', 'pads').folders.find(f => f.id === 'kicks')?.parentId).toBe('pads')
  })

  it('restores a trashed entry where it lands, leaving its old parents in the trash', () => {
    let c = trashLibraryEntry(setup(), 'drums')
    c = moveLibraryEntry(c, 'kick', 'pads')
    expect(c.items.filter(i => ['kick', 'tight', 'boom'].includes(i.id)).map(i => [i.id, i.folderId, !!i.trashed])).toEqual([['kick', 'pads', false], ['tight', 'pads', false], ['boom', 'pads', false]])
    expect(c.folders.filter(f => f.trashed).map(f => f.id).sort()).toEqual(['drums', 'kicks'])
    c = moveLibraryEntry(c, 'kicks', null)
    expect(c.folders.find(f => f.id === 'kicks')).toMatchObject({ parentId: null, trashed: false })
    expect(c.folders.find(f => f.id === 'drums')?.trashed).toBe(true)
  })
})

describe('duplicating library entries', () => {
  it('copies an item and its presets, named "copy" only beside the original', () => {
    let c = libraryItemDuplicate(setup(), 'kick', undefined, 'kick2')
    expect(c.items.find(i => i.id === 'kick2')).toMatchObject({ name: 'kick copy', folderId: 'kicks' })
    const copies = c.items.filter(i => i.content.kind === 'preset' && i.content.assetId === 'kick2')
    expect(copies.map(i => [i.name, i.folderId]).sort()).toEqual([['boom', 'kicks'], ['tight', 'kicks']])
    c = libraryItemDuplicate(c, 'kick', 'pads', 'kick3')
    expect(c.items.find(i => i.id === 'kick3')).toMatchObject({ name: 'kick', folderId: 'pads' })
  })

  it('deep-copies a folder, sharing revisions and samples and re-pointing presets at their copied sound', () => {
    const before = setup()
    const c = duplicateLibraryFolder(before, 'drums', 'pads', 'drums2')
    expect(c.revisions).toBe(before.revisions)
    expect(c.samples).toBe(before.samples)
    const copy = c.folders.find(f => f.id === 'drums2')!
    expect(copy).toMatchObject({ name: 'Drums', parentId: 'pads' })
    const kicks = c.folders.find(f => f.parentId === 'drums2')!
    expect(kicks.name).toBe('Kicks')
    const kick = c.items.find(i => i.folderId === kicks.id && i.content.kind === 'instrument')!
    expect(kick.id).not.toBe('kick')
    const presets = c.items.filter(i => i.content.kind === 'preset' && i.content.assetId === kick.id)
    // Tight was kept in Pads, but it shows under its sound, so it comes along.
    expect(presets.map(i => [i.name, i.folderId]).sort()).toEqual([['boom', kicks.id], ['tight', kicks.id]])
    expect(c.items).toHaveLength(before.items.length + 3)
    expect(duplicateLibraryFolder(before, 'pads', null).folders.at(-1)?.name).toBe('Pads copy')
    expect(() => duplicateLibraryFolder(before, 'drums', 'kicks')).toThrow(/itself/)
  })

  it('checks the caps before writing anything', () => {
    const c = setup()
    const full = { ...c, items: [...c.items, ...Array.from({ length: 4096 - c.items.length - 1 }, (_, n) => sound(`x${n}`, null))] }
    expect(() => duplicateLibraryFolder(full, 'drums', null)).toThrow(/item limit/)
    expect(() => libraryItemDuplicate(full, 'kick')).toThrow(/item limit/)
    const folders = { ...c, folders: [...c.folders, ...Array.from({ length: 1024 - c.folders.length - 1 }, (_, n) => ({ id: `f${n}`, name: 'F', parentId: null }))] }
    expect(() => duplicateLibraryFolder(folders, 'drums', null)).toThrow(/folder limit/)
    expect(duplicateLibraryFolder(folders, 'pads', null).folders).toHaveLength(1024)
  })
})

describe('copying from another catalog (the Factory)', () => {
  /** A source like the Factory's: Drums > Kicks with Kick and its preset Tight, a Pad at the top, Old in its trash. */
  const source = (): LibraryCatalog => {
    let c: LibraryCatalog = { ...emptyLibrary(), revisions: [{ ...revision, id: 'f:rev' }, { ...revision, id: 'f:unused' }], samples: [{ id: 's' } as LibraryCatalog['samples'][number]] }
    c = saveLibraryFolder(c, 'Drums', null, 'f:drums')
    c = saveLibraryFolder(c, 'Kicks', 'f:drums', 'f:kicks')
    const own = (item: LibraryItem): LibraryItem => ({ ...item, content: { ...item.content, revisionId: 'f:rev', state: { id: `f:state/${item.id}`, revisionId: 'f:rev' } } } as LibraryItem)
    for (const item of [sound('f:kick', 'f:kicks'), preset('f:tight', 'f:kick', 'f:kicks'), sound('f:pad', null), sound('f:old', 'f:kicks')]) c = saveLibraryItem(c, own(item))
    return trashLibraryEntry(c, 'f:old')
  }
  const mine = () => saveLibraryFolder(emptyLibrary(), 'Mine', null, 'mine')
  const added = (before: LibraryCatalog, after: LibraryCatalog) => ({
    folders: after.folders.filter((f) => !before.folders.some((known) => known.id === f.id)),
    items: after.items.filter((i) => !before.items.some((known) => known.id === i.id)),
    revisions: after.revisions.filter((r) => !before.revisions.some((known) => known.id === r.id)),
  })

  it('copies a folder with its live contents, its revisions and samples, under new ids, into the destination', () => {
    const to = mine(), next = copyLibraryEntries(source(), to, ['f:drums'], 'mine')
    const copy = added(to, next)
    expect(copy.folders.map((f) => f.name)).toEqual(['Drums', 'Kicks'])
    const drums = copy.folders.find((f) => f.name === 'Drums')!, kicks = copy.folders.find((f) => f.name === 'Kicks')!
    expect([drums.parentId, kicks.parentId]).toEqual(['mine', drums.id])
    // The trashed Old stays behind; Kick and its preset come, in the copy of Kicks.
    expect(copy.items.map((i) => [i.name, i.folderId === kicks.id])).toEqual([['f:kick', true], ['f:tight', true]])
    const kick = copy.items.find((i) => i.name === 'f:kick')!, tight = copy.items.find((i) => i.name === 'f:tight')!
    // One revision, used by both, under a new id; the unused one isn't copied.
    expect(copy.revisions).toHaveLength(1)
    const id = copy.revisions[0]!.id
    expect(kick.content).toMatchObject({ revisionId: id, state: { revisionId: id } })
    expect(tight.content).toMatchObject({ kind: 'preset', assetId: kick.id, revisionId: id, state: { revisionId: id } })
    const ids = [...copy.folders.map((f) => f.id), ...copy.items.map((i) => i.id), id, ...copy.items.map((i) => (i.content as { state: { id: string } }).state.id)]
    expect(ids.some((value) => value.startsWith('f:'))).toBe(false)
    expect(next.samples.map((sample) => sample.id)).toEqual(['s'])
  })

  it('copies an item with its presets, and a preset with its sound, into the destination folder', () => {
    const to = mine()
    const kick = added(to, copyLibraryEntries(source(), to, ['f:kick'], null))
    expect(kick.items.map((i) => [i.name, i.folderId])).toEqual([['f:kick', null], ['f:tight', null]])
    const tight = added(to, copyLibraryEntries(source(), to, ['f:tight'], 'mine'))
    expect(tight.items.map((i) => [i.name, i.folderId])).toEqual([['f:kick', 'mine'], ['f:tight', 'mine']])
    expect(added(to, copyLibraryEntries(source(), to, ['f:pad'], 'mine')).items.map((i) => i.name)).toEqual(['f:pad'])
  })

  it('refuses a destination that is gone, nothing to copy, and anything past the caps, before writing', () => {
    expect(() => copyLibraryEntries(source(), mine(), ['f:kick'], 'gone')).toThrow('Destination folder is unavailable')
    expect(() => copyLibraryEntries(source(), mine(), ['f:old'], null)).toThrow('Nothing to copy')
    const full: LibraryCatalog = { ...mine(), items: Array.from({ length: 4095 }, (_, i) => sound(`m${i}`, null)) }
    expect(() => copyLibraryEntries(source(), full, ['f:kick'], null)).toThrow('Library item limit reached (4096)')
    expect(copyLibraryEntries(source(), full, ['f:pad'], null).items).toHaveLength(4096)
    const folders: LibraryCatalog = { ...mine(), folders: Array.from({ length: 1023 }, (_, i) => ({ id: `d${i}`, name: 'D', parentId: null })) }
    expect(() => copyLibraryEntries(source(), folders, ['f:drums'], null)).toThrow('Library folder limit reached (1024)')
  })
})
