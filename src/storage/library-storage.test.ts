import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { emptyLibrary, saveLibraryFolder, trashLibraryEntry } from '@core'
import { createLibraryStorage, createMemoryLibraryStorage } from './library-storage'
import { createIndexedDbSampleStorage } from './sample-storage'
const name = () => `library-${crypto.randomUUID()}`
const opened = (name: string, version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const r = indexedDB.open(name, version); r.onupgradeneeded = () => upgrade?.(r.result); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)
})
describe('atomic catalog and sample storage', () => {
  it('upgrades v1 in place, preserves sample bytes and opens fresh sample adapters at the coordinated version', async () => {
    const dbName = name(), legacy = await opened(dbName, 1, db => db.createObjectStore('samples'))
    await new Promise<void>((resolve, reject) => { const tx = legacy.transaction('samples', 'readwrite'); tx.objectStore('samples').put(Uint8Array.of(1, 2, 3), 'hash'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) })
    legacy.onversionchange = () => legacy.close()
    const library = createLibraryStorage(dbName)
    expect(await library.read()).toEqual(emptyLibrary())
    await library.update(c => saveLibraryFolder(c, 'Sounds', null, 'folder'))
    const samples = createIndexedDbSampleStorage(dbName)
    expect(await samples.get('hash')).toEqual(Uint8Array.of(1, 2, 3))
    expect((await createLibraryStorage(dbName).read()).folders[0]?.name).toBe('Sounds')
  })
  it('reports a blocked legacy tab upgrade and succeeds on retry after that tab closes', async () => {
    const dbName = name(), legacy = await opened(dbName, 1, db => db.createObjectStore('samples'))
    const library = createLibraryStorage(dbName)
    await expect(library.read()).rejects.toThrow(/Close older.*tabs/)
    legacy.close()
    expect(await library.read()).toEqual(emptyLibrary())
  })
  it('serializes concurrent edits across independent connections instead of overwriting stale metadata', async () => {
    const dbName = name(), a = createLibraryStorage(dbName), b = createLibraryStorage(dbName)
    await Promise.all([a.update(c => saveLibraryFolder(c, 'Duplicate', null, 'a')), b.update(c => saveLibraryFolder(c, 'Duplicate', null, 'b'))])
    expect((await a.read()).folders.map(f => f.id).sort()).toEqual(['a', 'b'])
  })
  it('rolls catalog and blobs back on an interrupted write after successful requests', async () => {
    const dbName = name(), library = createLibraryStorage(dbName), samples = createIndexedDbSampleStorage(dbName)
    await library.update(c => saveLibraryFolder(c, 'Before', null, 'before'), new Map([['retained', Uint8Array.of(1)]]))
    const put = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const result = put.call(this, value, key)
      if (this.name === 'samples' && key === 'interrupted') result.addEventListener('success', () => this.transaction.abort())
      return result
    })
    try { await expect(library.update(c => saveLibraryFolder(c, 'After', null, 'after'), new Map([['interrupted', Uint8Array.of(2)]]))).rejects.toThrow(/interrupted/) }
    finally { spy.mockRestore() }
    expect((await createLibraryStorage(dbName).read()).folders.map(f => f.id)).toEqual(['before'])
    expect(await samples.get('interrupted')).toBeUndefined()
    expect(await samples.get('retained')).toEqual(Uint8Array.of(1))
    await library.update(c => saveLibraryFolder(c, 'Retry', null, 'retry'))
    expect((await library.read()).folders).toHaveLength(2)
  })
  it('surfaces quota failures, preserves the last catalog and allows recovery', async () => {
    const dbName = name(), library = createLibraryStorage(dbName)
    await library.update(c => saveLibraryFolder(c, 'Before', null, 'before'))
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage quota exceeded', 'QuotaExceededError') })
    try { await expect(library.update(c => saveLibraryFolder(c, 'After', null, 'after'))).rejects.toThrow(/quota/) }
    finally { spy.mockRestore() }
    expect((await createLibraryStorage(dbName).read()).folders.map(f => f.id)).toEqual(['before'])
    await library.update(c => saveLibraryFolder(c, 'Recovered', null, 'recovered'))
    expect((await library.read()).folders).toHaveLength(2)
  })
  it('retains blobs through trash/restore and keeps catalog history separate from sample operations', async () => {
    const dbName = name(), library = createLibraryStorage(dbName), samples = createIndexedDbSampleStorage(dbName)
    await library.update(c => saveLibraryFolder(c, 'Keep bytes', null, 'folder'), new Map([['hash', Uint8Array.of(4, 5)]]))
    await library.update(c => trashLibraryEntry(c, 'folder'))
    expect(await samples.get('hash')).toEqual(Uint8Array.of(4, 5))
    await library.update(c => trashLibraryEntry(c, 'folder', false))
    expect((await library.read()).folders[0]!.trashed).toBe(false)
  })
  it('closes catalog and sample connections when another tab upgrades', async () => {
    const dbName = name(), library = createLibraryStorage(dbName), samples = createIndexedDbSampleStorage(dbName)
    await library.read(); await samples.put('keep', Uint8Array.of(9))
    const next = await opened(dbName, 3)
    expect(next.objectStoreNames.contains('samples')).toBe(true)
    expect(next.objectStoreNames.contains('catalog')).toBe(true)
    next.close()
    // An old app cannot downgrade a future schema and must show the error instead.
    await expect(library.read()).rejects.toMatchObject({ name: 'VersionError' })
  })
})

it('rejects future-version edits before publishing catalog or blobs in both adapters', async () => {
  const files = new Map<string, Uint8Array>(), dbName = name()
  for (const [storage, get] of [[createMemoryLibraryStorage(files), async (id: string) => files.get(id)], [createLibraryStorage(dbName), createIndexedDbSampleStorage(dbName).get]] as const) {
    const before = await storage.update(c => saveLibraryFolder(c, 'Keep', null, 'keep'), new Map([['old', Uint8Array.of(1)]]))
    await expect(storage.update(c => ({ ...c, version: 2 as 1 }), new Map([['new', Uint8Array.of(2)]]))).rejects.toThrow('Invalid library version')
    expect(await storage.read()).toEqual(before)
    expect(await get('old')).toEqual(Uint8Array.of(1)); expect(await get('new')).toBeUndefined()
  }
})
