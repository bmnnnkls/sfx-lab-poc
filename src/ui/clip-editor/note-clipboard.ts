import type { Note } from '@core'

type Listener = () => void

let copied: readonly Note[] = []
const listeners = new Set<Listener>()

/**
 * Notes copied in the editor. Kept in memory so they can be pasted into any clip in this session.
 * Subscribable (see `useNoteClipboard`) so menus can enable or disable Paste as soon as it changes.
 */
export const noteClipboard = {
  set: (notes: readonly Note[]): void => {
    copied = notes
    for (const listener of listeners) listener()
  },
  get: (): readonly Note[] => copied,
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
