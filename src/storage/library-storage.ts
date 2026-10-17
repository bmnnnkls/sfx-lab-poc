import { emptyLibrary, type LibraryCatalog } from '@core'
import { openLibraryDatabase, transactionDone } from './library-database'
export interface LibraryStorage {
  read(): Promise<LibraryCatalog>
  /** Synchronous edits execute after the serialized transaction's read. No stale-tab last-write overwrite. */
  update(edit: (catalog: LibraryCatalog) => LibraryCatalog, blobs?: ReadonlyMap<string, Uint8Array>): Promise<LibraryCatalog>
}
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])
export const createMemoryLibraryStorage = (files = new Map<string, Uint8Array>()): LibraryStorage => {
  let catalog = emptyLibrary()
  return { read: async () => structuredClone(catalog), update: async (edit, blobs) => {
    const next = structuredClone(edit(structuredClone(catalog)))
    for (const [id, bytes] of blobs ?? []) { const known = files.get(id); if (known && !sameBytes(known, bytes)) throw new Error('Existing sample bytes conflict with bundle; previous catalog retained') }
    const copies = [...(blobs ?? [])].map(([id, bytes]) => [id, bytes.slice()] as const)
    for (const [id, bytes] of copies) if (!files.has(id)) files.set(id, bytes)
    catalog = next; return structuredClone(next)
  } }
}
export const createLibraryStorage = (databaseName = 'sfxlab'): LibraryStorage => {
  const open = openLibraryDatabase(databaseName)
  const run = async (edit?: (catalog: LibraryCatalog) => LibraryCatalog, blobs?: ReadonlyMap<string, Uint8Array>): Promise<LibraryCatalog> => {
    const db = await open(), tx = db.transaction(edit ? ['catalog', 'samples'] : ['catalog'], edit ? 'readwrite' : 'readonly')
    const done = transactionDone(tx)
    let result = emptyLibrary(), failure: unknown
    const request = tx.objectStore('catalog').get('current')
    request.onsuccess = () => {
      try {
        const saved = request.result as LibraryCatalog | undefined
        if (saved && saved.version !== 1) throw new Error('Unsupported library version; update SFX Lab')
        result = saved ?? emptyLibrary()
        if (edit) {
          result = edit(result)
          if (result.version !== 1) throw new Error('Invalid library version')
          tx.objectStore('catalog').put(result, 'current')
          for (const [id, bytes] of blobs ?? []) {
            const store = tx.objectStore('samples'), existing = store.get(id)
            existing.onsuccess = () => {
              try {
                if (existing.result !== undefined) {
                  if (!(existing.result instanceof Uint8Array) || !sameBytes(existing.result, bytes)) throw new Error('Existing sample bytes conflict with bundle; previous catalog retained')
                } else store.put(bytes, id)
              } catch (error) { failure = error; tx.abort() }
            }
          }
        }
      } catch (error) { failure = error; tx.abort() }
    }
    try { await done } catch (error) { const cause = failure ?? error; if (cause instanceof DOMException && cause.name === 'QuotaExceededError') throw new Error('Library storage quota exceeded. Free browser storage, then retry. The previous catalog is retained.'); throw cause }
    return result
  }
  return { read: () => run(), update: (edit, blobs) => run(edit, blobs) }
}
