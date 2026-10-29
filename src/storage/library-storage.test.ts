import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { captureLibraryAsset, createEmptyProject, emptyLibrary, saveLibraryFolder, trashLibraryEntry } from '@core'
import { createLibraryStorage, createMemoryLibraryStorage } from './library-storage'
import { createIndexedDbSampleStorage } from './sample-storage'
import { LIBRARY_DATABASE_VERSION } from './library-database'
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
  it('backs up and upgrades a legacy catalog atomically on read while leaving shared sample bytes intact', async () => {
    const dbName = name(), bytes = Uint8Array.of(6, 7, 8), id = 'a'.repeat(64)
    const project = createEmptyProject(), track = project.tracks[0]!
    const captured = captureLibraryAsset(emptyLibrary(), project, { owner: { kind: 'track', trackId: track.id }, domain: 'patch' }, 'Unreferenced asset', null)
    const legacy = {
      ...captured, version: 1,
      folders: [{ id: 'old-folder', name: 'Old', parentId: null, trashed: true }],
      items: [{ id: 'old-item', name: 'Old sample', folderId: 'old-folder', trashed: true, content: { kind: 'sample', sampleId: id } }],
      samples: [{ id, name: 'Orphan', extension: 'wav', durationSeconds: 1, sampleRate: 48000, channels: 1, bytes: bytes.length }],
    }
    const db = await opened(dbName, 2, d => { d.createObjectStore('catalog'); d.createObjectStore('samples') })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['catalog', 'samples'], 'readwrite')
      tx.objectStore('catalog').put(legacy, 'current')
      tx.objectStore('samples').put(bytes, id)
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
    })
    db.close()
    const storage = createLibraryStorage(dbName), upgraded = await storage.read()
    expect(upgraded.version).toBe(2)
    const check = await opened(dbName, LIBRARY_DATABASE_VERSION)
    expect(await new Promise(resolve => { const r = check.transaction('catalog').objectStore('catalog').get('pre-signature-v2'); r.onsuccess = () => resolve(r.result) })).toEqual(legacy)
    expect(await new Promise(resolve => { const r = check.transaction('catalog').objectStore('catalog').get('current'); r.onsuccess = () => resolve(r.result) })).toEqual(upgraded)
    expect(upgraded.folders).toEqual(legacy.folders)
    expect(upgraded.items).toEqual(legacy.items)
    expect(upgraded.revisions).toHaveLength(captured.revisions.length)
    expect(upgraded.samples).toEqual(legacy.samples)
    expect(await new Promise(resolve => { const r = check.transaction('samples').objectStore('samples').get(id); r.onsuccess = () => resolve(r.result) })).toEqual(bytes)
    check.close()
  })
  it('rolls back a catalog backup when the v1 upgrade hits quota and rejects unknown catalog versions', async () => {
    const dbName = name(), legacy = { ...emptyLibrary(), version: 1 }
    const db = await opened(dbName, 2, d => { d.createObjectStore('catalog'); d.createObjectStore('samples') })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('catalog', 'readwrite'); tx.objectStore('catalog').put(legacy, 'current'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) })
    db.close()
    const put = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'catalog' && key === 'pre-signature-v2') throw new DOMException('quota', 'QuotaExceededError')
      return put.call(this, value, key)
    })
    try { await expect(createLibraryStorage(dbName).read()).rejects.toThrow(/quota/) } finally { spy.mockRestore() }
    const check = await opened(dbName, LIBRARY_DATABASE_VERSION)
    expect(await new Promise(resolve => { const r = check.transaction('catalog').objectStore('catalog').get('current'); r.onsuccess = () => resolve(r.result) })).toEqual(legacy)
    expect(await new Promise(resolve => { const r = check.transaction('catalog').objectStore('catalog').get('pre-signature-v2'); r.onsuccess = () => resolve(r.result) })).toBeUndefined()
    check.close()

    const futureName = name(), future = await opened(futureName, 2, d => { d.createObjectStore('catalog'); d.createObjectStore('samples') })
    await new Promise<void>((resolve, reject) => { const tx = future.transaction('catalog', 'readwrite'); tx.objectStore('catalog').put({ ...emptyLibrary(), version: 3 }, 'current'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) })
    future.close()
    await expect(createLibraryStorage(futureName).read()).rejects.toThrow(/unsupported catalog version|Unsupported library version/i)
  })
  it('rolls catalog conversion, backup, edits and new blobs back together when a migration edit aborts', async () => {
    const dbName = name(), legacy = { ...emptyLibrary(), version: 1 }, db = await opened(dbName, 2, d => { d.createObjectStore('catalog'); d.createObjectStore('samples') })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('catalog', 'readwrite'); tx.objectStore('catalog').put(legacy, 'current'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) })
    db.close()
    const put = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const req = put.call(this, value, key)
      if (this.name === 'samples' && key === 'interrupted') req.addEventListener('success', () => this.transaction.abort())
      return req
    })
    try {
      const pending = createLibraryStorage(dbName).update(c => saveLibraryFolder(c, 'After', null, 'after'), new Map([['interrupted', Uint8Array.of(9)]]))
      await expect(pending).rejects.toThrow(/interrupted/)
    } finally { spy.mockRestore() }
    const check = await opened(dbName, LIBRARY_DATABASE_VERSION)
    expect(await new Promise(resolve => { const r = check.transaction('catalog').objectStore('catalog').get('current'); r.onsuccess = () => resolve(r.result) })).toEqual(legacy)
    expect(await new Promise(resolve => { const r = check.transaction('catalog').objectStore('catalog').get('pre-signature-v2'); r.onsuccess = () => resolve(r.result) })).toBeUndefined()
    expect(await new Promise(resolve => { const r = check.transaction('samples').objectStore('samples').get('interrupted'); r.onsuccess = () => resolve(r.result) })).toBeUndefined()
    check.close()
  })
  it('closes catalog and sample connections when another tab upgrades', async () => {
    const dbName = name(), library = createLibraryStorage(dbName), samples = createIndexedDbSampleStorage(dbName)
    await library.read(); await samples.put('keep', Uint8Array.of(9))
    const next = await opened(dbName, LIBRARY_DATABASE_VERSION + 1)
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
    await expect(storage.update(c => ({ ...c, version: 3 as 2 }), new Map([['new', Uint8Array.of(2)]]))).rejects.toThrow('Invalid library version')
    expect(await storage.read()).toEqual(before)
    expect(await get('old')).toEqual(Uint8Array.of(1)); expect(await get('new')).toBeUndefined()
  }
})
