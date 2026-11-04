import type { RefObject } from 'react'
import type { MenuEntry } from './menu-types'

/** Entries whose choice takes the focus note it, so the menu leaves the focus where the entry put it as it closes. */
export const notingFocus = (entries: readonly MenuEntry[], focusTaken: RefObject<boolean>): readonly MenuEntry[] =>
  entries.map((entry) => {
    if (entry.kind === 'separator') return entry
    if (entry.kind === 'submenu') return { ...entry, entries: notingFocus(entry.entries, focusTaken) }
    return { ...entry, onSelect: () => {
      focusTaken.current = !!entry.takesFocus
      entry.onSelect()
    } }
  })
