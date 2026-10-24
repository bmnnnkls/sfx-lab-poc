import { useSyncExternalStore } from 'react'

type Listener = () => void

/** One kind of thing that was copied, kept in memory for this session. */
export interface Clipboard<T> {
  set(value: T): void
  get(): T
  /** Calls `listener` whenever something new is copied; returns the unsubscribe. */
  subscribe(listener: Listener): () => void
}

/** Told when any clipboard changes, so a menu can subscribe to all of them at once. */
const anyListeners = new Set<Listener>()

/**
 * A subscribable store for one kind of copied thing, starting with `empty`. Each kind has its own; there is no
 * clipboard that holds "anything". Clipboards live in memory: they survive switching tracks and loading another
 * project, and aren't shared with the operating system's clipboard.
 */
export const createClipboard = <T>(empty: T): Clipboard<T> => {
  let copied = empty
  const listeners = new Set<Listener>()
  return {
    set: (value) => {
      copied = value
      for (const listener of [...listeners, ...anyListeners]) listener()
    },
    get: () => copied,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Subscribes to every clipboard; for menus, whose entries may read any of them. */
export const subscribeToClipboards = (listener: Listener): (() => void) => {
  anyListeners.add(listener)
  return () => anyListeners.delete(listener)
}

/** What a clipboard holds, re-rendering the caller whenever something new is copied. */
export const useClipboard = <T>(clipboard: Clipboard<T>): T => useSyncExternalStore(clipboard.subscribe, clipboard.get)
