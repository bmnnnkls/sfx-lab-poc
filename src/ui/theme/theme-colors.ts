import { useMemo, useSyncExternalStore } from 'react'
import { getTheme, subscribeTheme } from './theme'

/*
 * How a canvas reads the theme's colours. CSS draws with `var(--…)`; a canvas can't, so it asks here for the tokens by
 * their names (`'--accent'`), as they compute on <html> under the theme in use. No fallbacks: a token that isn't
 * defined reads as '' (and, in development, says so once), which the token checks in tests/architecture.test.ts
 * should have caught before.
 */

/** The values read under the theme in use, by token name; emptied when the theme changes. */
let cache = new Map<string, string>()
let cachedTheme = getTheme()
const warned = new Set<string>()

// Subscribed when this module loads, before any component can subscribe, so the cache is emptied before a listener
// re-reads it. `setTheme` has already written `data-theme` by the time it notifies.
subscribeTheme(() => {
  cache = new Map()
  cachedTheme = getTheme()
})

const read = (name: string): string => {
  if (typeof document === 'undefined') return ''
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!value && import.meta.env.DEV && !warned.has(name)) {
    warned.add(name)
    console.warn(`Theme token ${name} is not defined`)
  }
  return value
}

/** The tokens `names` as computed under the theme in use: `themeColors(['--accent'])['--accent']`. For code outside React; a component uses `useThemeColors`. */
export const themeColors = <N extends string>(names: readonly N[]): Record<N, string> => {
  if (getTheme() !== cachedTheme) {
    cache = new Map()
    cachedTheme = getTheme()
  }
  const colors = {} as Record<N, string>
  for (const name of names) {
    let value = cache.get(name)
    if (value === undefined) cache.set(name, (value = read(name)))
    colors[name] = value
  }
  return colors
}

/**
 * `themeColors(names)` for a component, made again when the theme changes and not otherwise, so a canvas puts the
 * result in its drawing effect's dependencies and redraws on a theme change. `names` may be a new array each render.
 */
export const useThemeColors = <N extends string>(names: readonly N[]): Record<N, string> => {
  const theme = useSyncExternalStore(subscribeTheme, getTheme)
  const key = names.join('\n')
  // `theme` is what changes the colours, `key` stands for `names`.
  return useMemo(() => themeColors(names), [theme, key])
}
