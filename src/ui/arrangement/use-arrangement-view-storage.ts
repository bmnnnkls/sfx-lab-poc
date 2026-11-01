import { type ArrangementViewSettings, useArrangementView } from '@state'
import { useEffect, useState } from 'react'

/** Where the arrangement's view settings are saved per browser, as one JSON object. */
export const ARRANGEMENT_VIEW_KEY = 'sfxlab:arrangement-view'
/** The zoom alone, as the prototype kept it; read once when the new key is absent. */
export const OLD_ZOOM_KEY = 'sfxlab:arrangement-zoom'

/** What was saved, parsed but not yet checked (`restore` checks it); nothing when it can't be read. */
export const readArrangementView = (read: (key: string) => string | null): { [K in keyof ArrangementViewSettings]?: unknown } => {
  const parse = (key: string): unknown => {
    try {
      const raw = read(key)
      return raw === null ? undefined : (JSON.parse(raw) as unknown)
    } catch {
      return undefined
    }
  }
  const saved = parse(ARRANGEMENT_VIEW_KEY)
  if (saved && typeof saved === 'object') return saved as { [K in keyof ArrangementViewSettings]?: unknown }
  const zoom = parse(OLD_ZOOM_KEY)
  return zoom === undefined ? {} : { pxPerBeat: zoom }
}

// Storage can be missing or blocked (private mode), so every access is guarded, as in `useStoredState`.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (value: ArrangementViewSettings) => {
  try {
    localStorage.setItem(ARRANGEMENT_VIEW_KEY, JSON.stringify(value))
  } catch {
    // Not persisted; the setting still works for this visit.
  }
}

let restored = false

/** Restores the arrangement's view settings once per page, before the view first draws, and saves each change. */
export const useArrangementViewStorage = (): void => {
  useState(() => {
    if (!restored) useArrangementView.getState().restore(readArrangementView(read))
    restored = true
  })
  useEffect(
    () =>
      useArrangementView.subscribe((state, previous) => {
        if (state.pxPerBeat === previous.pxPerBeat && state.grid === previous.grid && state.follow === previous.follow && state.headerWidth === previous.headerWidth) return
        write({ pxPerBeat: state.pxPerBeat, grid: state.grid, follow: state.follow, headerWidth: state.headerWidth })
      }),
    [],
  )
}
