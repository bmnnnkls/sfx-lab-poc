import { Model } from 'flexlayout-react'
import { useEffect, useState } from 'react'
import { defaultLayout } from './default-layout'
import { LAYOUT_KEY, LEGACY_MAIN_VIEW_KEY, LEGACY_PANEL_SIZE_KEY, migratedLayout, parseStoredLayout, serializeLayout } from './layout-storage'

/** Saves this long after the last change, so a splitter drag is written once. */
const SAVE_DELAY_MS = 250

// Storage can be missing or blocked (private mode), so every access is guarded, as in `useStoredState`.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (model: Model) => {
  try {
    localStorage.setItem(LAYOUT_KEY, serializeLayout(model.toJson()))
  } catch {
    // Not persisted; the layout still works for this visit.
  }
}

/**
 * The layout to start from: the saved one; else, in a browser that has never saved one, the default with what the
 * old keys remembered; else (a saved layout that can't be used) the default.
 */
const loadLayout = (): { model: Model; saved: boolean } => {
  const raw = read(LAYOUT_KEY)
  const json = parseStoredLayout(raw)
    ?? (raw === null ? migratedLayout(read(LEGACY_MAIN_VIEW_KEY), read(LEGACY_PANEL_SIZE_KEY)) : defaultLayout())
  try {
    return { model: Model.fromJson(json), saved: raw !== null }
  } catch {
    return { model: Model.fromJson(defaultLayout()), saved: false }
  }
}

export interface LayoutPersistence {
  /** The model to start from, read once before the first render. */
  readonly initial: Model
  /** After each change: saved once changes stop for a moment. */
  changed(model: Model): void
  /** Save at once (after *Reset layout*). */
  replaced(model: Model): void
}

/**
 * Saves the layout per browser under `sfxlab:layout`. Mount once, above the layout. A browser without a saved
 * layout gets one built from `sfxlab:main-view` and `sfxlab:editor-height`, saved at once, so the old keys are
 * read only that first time.
 */
export const useLayoutPersistence = (): LayoutPersistence => {
  const [persistence] = useState(() => {
    const { model, saved } = loadLayout()
    let pending: { model: Model; timer: ReturnType<typeof setTimeout> } | null = null
    const flush = () => {
      if (!pending) return
      clearTimeout(pending.timer)
      write(pending.model)
      pending = null
    }
    return {
      saved,
      flush,
      layout: {
        initial: model,
        changed: (next: Model) => {
          if (pending) clearTimeout(pending.timer)
          pending = { model: next, timer: setTimeout(flush, SAVE_DELAY_MS) }
        },
        replaced: (next: Model) => {
          pending = null
          write(next)
        },
      } satisfies LayoutPersistence,
    }
  })

  useEffect(() => {
    if (!persistence.saved) write(persistence.layout.initial)
    // A reload within the delay still keeps the last change.
    window.addEventListener('pagehide', persistence.flush)
    return () => {
      window.removeEventListener('pagehide', persistence.flush)
      persistence.flush()
    }
  }, [persistence])

  return persistence.layout
}
