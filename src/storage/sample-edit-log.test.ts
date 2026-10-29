import 'fake-indexeddb/auto'
import { emptyLibrary, saveLibraryFolder } from '@core'
import { describe, expect, it, vi } from 'vitest'
import { LIBRARY_DATABASE_VERSION } from './library-database'
import { createLibraryStorage } from './library-storage'
import { createIndexedDbSampleEditLog, createMemorySampleEditLog } from './sample-edit-log'
import { StorageFullError, createIndexedDbSampleStorage } from './sample-storage'
import { freeBytes } from './storage-room'

const name = () => `edits-${crypto.randomUUID()}`
const opened = (name: string, version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => upgrade?.(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
const put = (db: IDBDatabase, store: string, value: unknown, key: string) =>
  new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })

describe('the sample-edits store', () => {
  it('upgrades a version-2 database to version 3 and keeps its samples and catalog', async () => {
    const dbName = name()
    const legacy = await opened(dbName, 2, (db) => {
      db.createObjectStore('samples')
      db.createObjectStore('catalog')
    })
    await put(legacy, 'samples', Uint8Array.of(1, 2, 3), 'hash')
    await put(legacy, 'catalog', saveLibraryFolder(emptyLibrary(), 'Kept', null, 'folder'), 'current')
    legacy.onversionchange = () => legacy.close()

    const log = createIndexedDbSampleEditLog(dbName)
    await log.note('edited', 5)
    expect(await log.list()).toEqual([{ id: 'edited', at: 5 }])
    expect(await createIndexedDbSampleStorage(dbName).get('hash')).toEqual(Uint8Array.of(1, 2, 3))
    expect((await createLibraryStorage(dbName).read()).folders.map((folder) => folder.name)).toEqual(['Kept'])
    const db = await opened(dbName, LIBRARY_DATABASE_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual(['catalog', 'sample-edits', 'samples'])
    db.close()
  })

  it.each([
    { kind: 'IndexedDB', make: () => createIndexedDbSampleEditLog(name()) },
    { kind: 'memory', make: () => createMemorySampleEditLog() },
  ])('notes, lists and forgets ($kind)', async ({ make }) => {
    const log = make()
    await log.note('a', 1)
    await log.note('b', 2)
    await log.note('a', 3)
    expect((await log.list()).sort((x, y) => x.id.localeCompare(y.id))).toEqual([{ id: 'a', at: 3 }, { id: 'b', at: 2 }])
    await log.forget('a')
    await log.forget('missing')
    expect(await log.list()).toEqual([{ id: 'b', at: 2 }])
  })
})

describe('room for sample bytes', () => {
  it('turns a quota error from a sample write into StorageFullError', async () => {
    const storage = createIndexedDbSampleStorage(name())
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    try {
      await expect(storage.put('id', Uint8Array.of(1))).rejects.toBeInstanceOf(StorageFullError)
    } finally {
      spy.mockRestore()
    }
    expect(await storage.has('id')).toBe(false)
  })

  it('reads the free bytes from the storage estimate, or null where there is none', async () => {
    const storage = { estimate: async () => ({ quota: 1000, usage: 250 }) }
    vi.stubGlobal('navigator', { storage })
    try {
      expect(await freeBytes()).toBe(750)
      vi.stubGlobal('navigator', { storage: { estimate: async () => ({}) } })
      expect(await freeBytes()).toBeNull()
      vi.stubGlobal('navigator', {})
      expect(await freeBytes()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
