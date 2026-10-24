import { groupIn, type LayoutSnapshot, MAIN_VIEWS, type ViewId, useLayoutStore } from '@state'
import { useEffect, useState } from 'react'

/** The key and values predate the layout store, so a user's saved choice survives. */
const MAIN_VIEW_KEY = 'sfxlab:main-view'

const isMainView = (value: unknown): value is ViewId =>
  typeof value === 'string' && MAIN_VIEWS.includes(value as ViewId)

/**
 * Remembers the editor area's view in localStorage. Storage can be missing or blocked (private mode), so every
 * access is guarded, and an unreadable or stale value falls back to the default, as in `useStoredState`.
 * Mount once, above the views, so the saved view is in place before they first render.
 */
export const useLayoutPersistence = (): void => {
  useState(() => {
    try {
      const raw = localStorage.getItem(MAIN_VIEW_KEY)
      const parsed: unknown = raw === null ? null : JSON.parse(raw)
      if (isMainView(parsed)) useLayoutStore.getState().revealView(parsed)
    } catch {
      // Unreadable or unavailable: keep the default.
    }
    return null
  })

  useEffect(() => {
    const save = (view: ViewId) => {
      try {
        localStorage.setItem(MAIN_VIEW_KEY, JSON.stringify(view))
      } catch {
        // Not persisted; the in-memory layout still works.
      }
    }
    const editorView = (state: LayoutSnapshot) => groupIn(state, 'editor')?.active
    const initial = editorView(useLayoutStore.getState())
    if (initial) save(initial)
    return useLayoutStore.subscribe((state, previous) => {
      const view = editorView(state)
      if (view && view !== editorView(previous)) save(view)
    })
  }, [])
}
