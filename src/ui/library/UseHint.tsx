import { useSyncExternalStore } from 'react'
import { Icon } from '../shared/icon'
import styles from './LibraryPanel.module.css'

/** Kept per browser, as a view preference: `state` doesn't touch `localStorage`. */
const DISMISSED_KEY = 'sfxlab:library-use-hint-dismissed'

const listeners = new Set<() => void>()
/** Without storage (a private window that throws), the hint is dismissed for this page only. */
let dismissedHere = false

const isDismissed = (): boolean => {
  if (dismissedHere) return true
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

const dismiss = () => {
  dismissedHere = true
  try {
    localStorage.setItem(DISMISSED_KEY, 'true')
  } catch {
    // The page keeps it dismissed anyway.
  }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The first-run hint, in the empty Library and under a selected item, until it is dismissed: once per browser.
 */
export const UseHint = () => {
  const dismissed = useSyncExternalStore(subscribe, isDismissed)
  if (dismissed) return null
  return (
    <aside className={styles.hint} aria-label="Hint">
      <span>Drag onto a track, a slot or a graph to use it.</span>
      <button className={styles.hintClose} aria-label="Dismiss hint" title="Don't show this again" onClick={dismiss}><Icon name="close" size={14} /></button>
    </aside>
  )
}
