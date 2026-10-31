import { DEFAULT_SECOND_PANE, type SecondPane, useWavePanesStore } from '@state'
import { useEffect, useState } from 'react'

/** Where the second pane is saved per browser: open or not, its own sample, and the first pane's share of the height. */
export const SECOND_PANE_KEY = 'sfxlab:wave-second-pane'

/** The share a pane may not go under, and over one minus it, whatever was saved. */
const SHARE_LIMIT = 0.1

/** What was saved, checked field by field: a field that is missing or bad keeps its default. */
export const readSecondPane = (raw: string | null): SecondPane => {
  let saved: unknown
  try {
    saved = raw === null ? null : JSON.parse(raw)
  } catch {
    return DEFAULT_SECOND_PANE
  }
  if (typeof saved !== 'object' || saved === null) return DEFAULT_SECOND_PANE
  const { open, sampleId, share } = saved as Record<string, unknown>
  return {
    open: typeof open === 'boolean' ? open : DEFAULT_SECOND_PANE.open,
    sampleId: typeof sampleId === 'string' ? sampleId : DEFAULT_SECOND_PANE.sampleId,
    share: typeof share === 'number' && Number.isFinite(share) ? Math.min(1 - SHARE_LIMIT, Math.max(SHARE_LIMIT, share)) : DEFAULT_SECOND_PANE.share,
  }
}

let restored = false

/**
 * Restores the second pane (`useWavePanesStore.second`) once per page, before the editor first draws, and saves each
 * change. Mounted by the Wave editor view. Storage can be missing or blocked (private mode), so every access is guarded.
 */
export const useWavePanesStorage = (): void => {
  useState(() => {
    if (restored) return
    restored = true
    let raw: string | null = null
    try {
      raw = localStorage.getItem(SECOND_PANE_KEY)
    } catch {
      // Nothing saved can be read: the defaults.
    }
    useWavePanesStore.getState().setSecond(readSecondPane(raw))
  })
  useEffect(
    () =>
      useWavePanesStore.subscribe((state, previous) => {
        if (state.second === previous.second) return
        try {
          localStorage.setItem(SECOND_PANE_KEY, JSON.stringify(state.second))
        } catch {
          // Not persisted; the pane still works for this visit.
        }
      }),
    [],
  )
}
