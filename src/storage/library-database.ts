/** Samples and catalog share one upgrade coordinator. Never recreate the v1 samples store. */
export const openLibraryDatabase = (databaseName = 'sfxlab') => {
  let opened: Promise<IDBDatabase> | undefined
  return (): Promise<IDBDatabase> => {
    if (opened) return opened
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2)
      let blocked = false
      request.onupgradeneeded = () => {
        for (const store of ['samples', 'catalog']) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store)
      }
      request.onblocked = () => { blocked = true; opened = undefined; reject(new Error('Library upgrade blocked. Close older SFX Lab tabs, then retry.')) }
      request.onerror = () => { opened = undefined; reject(request.error ?? new Error('Cannot open library storage')) }
      request.onsuccess = () => {
        const db = request.result
        if (blocked) { db.close(); return }
        db.onversionchange = () => { db.close(); opened = undefined }
        db.onclose = () => { opened = undefined }
        resolve(db)
      }
    })
    return opened
  }
}
export const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onabort = () => reject(transaction.error ?? new Error('Storage write interrupted; previous data retained'))
  transaction.onerror = () => { /* abort reports the final result, including quota failures */ }
})
