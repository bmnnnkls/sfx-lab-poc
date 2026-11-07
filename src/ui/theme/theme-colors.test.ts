import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTheme, subscribeTheme } from './theme'
import { themeColors } from './theme-colors'

// Vitest runs in node: <html> and its computed style are stand-ins that answer by the `data-theme` the theme store writes.
const TOKENS: Record<string, Record<string, string>> = {
  dark: { '--accent': ' #f5a524 ', '--text': '#d8dae0' },
  light: { '--accent': '#b45309', '--text': '#1b1c1f' },
  contrast: { '--accent': '#ffcc00' },
}

let reads: string[]

beforeEach(() => {
  reads = []
  const root = { dataset: {} as Record<string, string> }
  vi.stubGlobal('document', { documentElement: root })
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => {
      reads.push(name)
      return TOKENS[root.dataset.theme ?? 'dark']![name] ?? ''
    },
  }))
  // A change in between empties the cache, whatever an earlier test left in it.
  setTheme('light')
  setTheme('dark')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('themeColors', () => {
  it('reads the tokens from <html>, trimmed', () => {
    expect(themeColors(['--accent', '--text'])).toEqual({ '--accent': '#f5a524', '--text': '#d8dae0' })
  })

  it('reads each token once per theme', () => {
    themeColors(['--accent'])
    themeColors(['--accent', '--text'])
    themeColors(['--text'])
    expect(reads).toEqual(['--accent', '--text'])
  })

  it('follows the theme: the cache is emptied before anyone re-reads', () => {
    const names = ['--accent'] as const
    // A listener, as a component's, that re-reads on the notification.
    const seen: string[] = []
    const unsubscribe = subscribeTheme(() => seen.push(themeColors(names)['--accent']))
    expect(themeColors(names)['--accent']).toBe('#f5a524')
    setTheme('light')
    unsubscribe()
    expect(seen).toEqual(['#b45309'])
    expect(themeColors(names)['--accent']).toBe('#b45309')
    setTheme('contrast')
    expect(themeColors(names)['--accent']).toBe('#ffcc00')
    setTheme('dark')
    expect(themeColors(names)['--accent']).toBe('#f5a524')
    expect(reads).toEqual(['--accent', '--accent', '--accent', '--accent'])
  })

  it('returns an empty string for a token the theme lacks, and warns once per name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setTheme('contrast')
    expect(themeColors(['--text'])).toEqual({ '--text': '' })
    setTheme('dark')
    setTheme('contrast')
    expect(themeColors(['--text'])).toEqual({ '--text': '' })
    expect(warn.mock.calls.filter(([message]) => String(message).includes('--text'))).toHaveLength(1)
  })
})
