import { recordSettingsOf, useRecordSettings } from '@state'
import { useEffect, useState } from 'react'

/** Where the record settings are kept per browser: the metronome, its level, the fixed length, the count-in, the latency offset and the recorded CCs. */
export const RECORD_SETTINGS_KEY = 'sfxlab:record'

// Storage can be missing or blocked (private mode), so every access is guarded, as in `useStoredState`.
const read = (): unknown => {
  try {
    const raw = localStorage.getItem(RECORD_SETTINGS_KEY)
    return raw === null ? undefined : (JSON.parse(raw) as unknown)
  } catch {
    return undefined
  }
}

let restored = false

/** Restores the record settings once per page, before the transport bar first draws, and saves each change. */
export const useRecordSettingsStorage = (): void => {
  useState(() => {
    if (!restored) useRecordSettings.getState().restore(read())
    restored = true
  })
  useEffect(
    () =>
      useRecordSettings.subscribe((state) => {
        try {
          localStorage.setItem(RECORD_SETTINGS_KEY, JSON.stringify(recordSettingsOf(state)))
        } catch {
          // Not kept; the settings still work for this visit.
        }
      }),
    [],
  )
}
