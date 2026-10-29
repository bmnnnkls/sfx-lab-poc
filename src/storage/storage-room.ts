/**
 * How many bytes the site may still store, from `navigator.storage.estimate()` (`quota − usage`), or null where the
 * browser doesn't say. An estimate: browsers round it and may hold some back.
 */
export const freeBytes = async (): Promise<number | null> => {
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.()
    if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') return null
    return Math.max(0, estimate.quota - estimate.usage)
  } catch {
    return null
  }
}
