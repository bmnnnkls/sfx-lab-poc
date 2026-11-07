import { useSyncExternalStore } from 'react'

/** The themes, in the order *View ▸ Theme* and `view.theme.next` go through them. */
export const THEMES = ['dark', 'light', 'contrast'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_NAMES: Record<Theme, string> = { dark: 'Dark', light: 'Light', contrast: 'High contrast' }

/** Kept per browser, as layouts and keys are. `index.html` reads it before the app loads, so a saved theme doesn't flash. */
export const THEME_KEY = 'sfxlab:theme'

export const isTheme = (value: unknown): value is Theme => typeof value === 'string' && (THEMES as readonly string[]).includes(value)

const listeners = new Set<() => void>()

const read = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return isTheme(stored) ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

/** The theme in use. Without storage (blocked, a private window that throws), a change holds for this page only. */
let current: Theme = read()

export const getTheme = (): Theme => current

export const subscribeTheme = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Writes `data-theme` on <html>, which the theme files select on. */
export const applyTheme = (theme: Theme = current): void => {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

export const setTheme = (theme: Theme): void => {
  if (theme === current) return
  current = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // The page keeps the theme anyway.
  }
  applyTheme(theme)
  for (const listener of listeners) listener()
}

export const nextTheme = (theme: Theme = current): Theme => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!

export const useTheme = (): Theme => useSyncExternalStore(subscribeTheme, getTheme)
