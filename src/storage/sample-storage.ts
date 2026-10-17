import { openLibraryDatabase, transactionDone } from './library-database'
/** Where the original bytes of imported sample files live, keyed by content hash. */
export interface SampleStorage {
  /** False when nothing survives a reload (storage unavailable). */
  readonly persistent: boolean
  has(id: string): Promise<boolean>
  get(id: string): Promise<Uint8Array | undefined>
  put(id: string, bytes: Uint8Array): Promise<void>
  delete(id: string): Promise<void>
}

export const createMemorySampleStorage = (): SampleStorage => {
  const files = new Map<string, Uint8Array>()
  return {
    persistent: false,
    has: async (id) => files.has(id),
    get: async (id) => files.get(id),
    put: async (id, bytes) => void files.set(id, bytes),
    delete: async (id) => void files.delete(id),
  }
}

const STORE = 'samples'

const request = <T>(operation: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'))
  })

/** IndexedDB-backed storage: large binary values, survives reloads, shared by all projects. */
export const createIndexedDbSampleStorage = (databaseName = 'sfxlab'): SampleStorage => {
  const open = openLibraryDatabase(databaseName)
  const operate = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const tx = (await open()).transaction(STORE, mode)
    const done = transactionDone(tx)
    const result = request(operation(tx.objectStore(STORE)))
    const [value] = await Promise.all([result, done])
    return value
  }

  return {
    persistent: true,
    has: async (id) => (await operate('readonly', store => store.count(id))) > 0,
    get: async (id) => {
      const value = await operate('readonly', store => store.get(id))
      return value instanceof Uint8Array ? value : undefined
    },
    put: async (id, bytes) => void (await operate('readwrite', store => store.put(bytes, id))),
    delete: async (id) => void (await operate('readwrite', store => store.delete(id))),
  }
}

/** IndexedDB when the browser has it, otherwise memory (the app still works, just not across reloads). */
export const resolveSampleStorage = (): SampleStorage =>
  typeof indexedDB === 'undefined' ? createMemorySampleStorage() : createIndexedDbSampleStorage()
