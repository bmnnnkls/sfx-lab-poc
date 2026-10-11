/** The subset of `Storage` we use, so tests (and fallbacks) can supply their own. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ResolvedStore {
  readonly store: KeyValueStore
  /** False when the browser refused storage (private mode, blocked cookies): data lives in memory only. */
  readonly persistent: boolean
}

export const createMemoryStore = (): KeyValueStore => {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

/** `localStorage` if it works, otherwise an in-memory stand-in so the app still runs. */
export const resolveBrowserStore = (): ResolvedStore => {
  try {
    const probe = 'sfxlab:probe'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return { store: localStorage, persistent: true }
  } catch {
    return { store: createMemoryStore(), persistent: false }
  }
}
