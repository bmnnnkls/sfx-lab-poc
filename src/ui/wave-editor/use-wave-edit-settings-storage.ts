import { type WaveEditSettings, useWaveEditSettings } from '@state'
import { useEffect, useState } from 'react'

/** Where each setting is saved per browser: the keys the toolbar and editor kept them under before they moved to `state`. */
export const WAVE_EDIT_SETTING_KEYS: { readonly [K in keyof WaveEditSettings]: string } = {
  asCopy: 'sfxlab:wave-edit-copies',
  crossfade: 'sfxlab:wave-crossfade',
  fadeCurve: 'sfxlab:wave-fade-curve',
  lastValues: 'sfxlab:wave-edit-settings',
  loop: 'sfxlab:wave-loop',
}

const FIELDS = Object.keys(WAVE_EDIT_SETTING_KEYS) as (keyof WaveEditSettings)[]

/** What was saved, parsed but not yet checked (`restore` checks it); a key that can't be read or parsed is missing. */
export const readWaveEditSettings = (read: (key: string) => string | null): { [K in keyof WaveEditSettings]?: unknown } =>
  Object.fromEntries(
    FIELDS.flatMap((field) => {
      try {
        const raw = read(WAVE_EDIT_SETTING_KEYS[field])
        return raw === null ? [] : [[field, JSON.parse(raw) as unknown]]
      } catch {
        return []
      }
    }),
  )

// Storage can be missing or blocked (private mode), so every access is guarded, as in `useStoredState`.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not persisted; the setting still works for this visit.
  }
}

let restored = false

/**
 * Restores the edit settings (`useWaveEditSettings`) once per page, before the editor first draws, and saves each
 * change under its key. Mounted by the Wave editor view.
 */
export const useWaveEditSettingsStorage = (): void => {
  useState(() => {
    if (!restored) useWaveEditSettings.getState().restore(readWaveEditSettings(read))
    restored = true
  })
  useEffect(
    () =>
      useWaveEditSettings.subscribe((state, previous) => {
        for (const field of FIELDS) if (state[field] !== previous[field]) write(WAVE_EDIT_SETTING_KEYS[field], state[field])
      }),
    [],
  )
}
