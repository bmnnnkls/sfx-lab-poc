import type { Note } from '@core'

/** Notes copied in the editor. Kept in memory so they can be pasted into any clip in this session. */
let copied: readonly Note[] = []

export const noteClipboard = {
  set: (notes: readonly Note[]): void => {
    copied = notes
  },
  get: (): readonly Note[] => copied,
}
