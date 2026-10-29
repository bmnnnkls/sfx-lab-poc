import { openLibraryDatabase, transactionDone } from './library-database'

/** A file an edit wrote: its id and when (ms since the epoch). */
export interface SampleEditNote {
  readonly id: string
  readonly at: number
}

/**
 * The ids of sample files edits wrote, with when. Only these are ever cleaned up: bytes a user imported (a file, a demo
 * sample, a project package, a library bundle) are never noted, and importing bytes an edit wrote forgets the note.
 */
export interface SampleEditLog {
  /** False when nothing survives a reload: cleanup doesn't run then. */
  readonly persistent: boolean
  note(id: string, at: number): Promise<void>
  list(): Promise<SampleEditNote[]>
  forget(id: string): Promise<void>
}

export const createMemorySampleEditLog = (notes = new Map<string, number>()): SampleEditLog => ({
  persistent: false,
  note: async (id, at) => void notes.set(id, at),
  list: async () => [...notes].map(([id, at]) => ({ id, at })),
  forget: async (id) => void notes.delete(id),
})

const STORE = 'sample-edits'

/** The `sample-edits` store beside the samples: key the id, value `{ at }`. */
export const createIndexedDbSampleEditLog = (databaseName = 'sfxlab'): SampleEditLog => {
  const open = openLibraryDatabase(databaseName)
  const run = async (mode: IDBTransactionMode, operation: (store: IDBObjectStore) => void): Promise<void> => {
    const tx = (await open()).transaction(STORE, mode)
    const done = transactionDone(tx)
    operation(tx.objectStore(STORE))
    await done
  }
  return {
    persistent: true,
    note: (id, at) => run('readwrite', (store) => void store.put({ at }, id)),
    forget: (id) => run('readwrite', (store) => void store.delete(id)),
    list: async () => {
      const notes: SampleEditNote[] = []
      await run('readonly', (store) => {
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          const at = cursor.result?.value as { at?: unknown } | undefined
          if (!cursor.result) return
          if (typeof cursor.result.key === 'string' && typeof at?.at === 'number') notes.push({ id: cursor.result.key, at: at.at })
          cursor.result.continue()
        }
      })
      return notes
    },
  }
}

/** IndexedDB when the browser has it, otherwise memory. */
export const resolveSampleEditLog = (): SampleEditLog =>
  typeof indexedDB === 'undefined' ? createMemorySampleEditLog() : createIndexedDbSampleEditLog()
