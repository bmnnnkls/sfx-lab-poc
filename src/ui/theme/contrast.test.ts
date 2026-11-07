import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, isHexColour } from './contrast'

/**
 * Every theme's colours against WCAG 2 contrast ratios: text at 4.5:1 (High contrast 7:1), everything that has to be
 * seen without being text (the accent, states, a control's boundary, the focus ring, signal kinds, group colours) at
 * 3:1 (High contrast 4.5:1). Dark's shortfalls are recorded below, by pair and ratio, for round 13b; a new one fails.
 */

type ThemeName = 'dark' | 'light' | 'contrast'

const tokensOf = (theme: ThemeName): Map<string, string> => {
  const source = readFileSync(new URL(`./${theme}.css`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return new Map([...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]))
}

const SURFACES = ['--bg', '--panel', '--panel-raised', '--sunken', '--overlay']
const TEXT = ['--text', '--text-dim']
const NON_TEXT = [
  '--accent', '--play', '--record', '--danger', '--focus-ring', '--border-strong',
  '--signal-audio', '--signal-pitch', '--signal-mod', '--signal-gate', '--signal-notes', '--signal-control',
  '--group-red', '--group-orange', '--group-yellow', '--group-green', '--group-teal', '--group-blue', '--group-purple', '--group-pink',
]

const MINIMUMS: Record<ThemeName, { text: number; nonText: number }> = {
  dark: { text: 4.5, nonText: 3 },
  light: { text: 4.5, nonText: 3 },
  contrast: { text: 7, nonText: 4.5 },
}

/** Dark's known shortfalls, kept as they are in 13a so Dark doesn't change; 13b tunes them away. */
const DARK_EXCEPTIONS: Record<string, number> = {
  '--text-dim on --panel-raised': 4.19,
}

/** Each pair a theme must pass: what is checked, on what, and the minimum. */
const pairs = (theme: ThemeName): { label: string; fg: string; bg: string; minimum: number }[] => {
  const { text, nonText } = MINIMUMS[theme]
  const onSurfaces = (names: readonly string[], minimum: number) =>
    names.flatMap((fg) => SURFACES.map((bg) => ({ label: `${fg} on ${bg}`, fg, bg, minimum })))
  return [
    ...onSurfaces(TEXT, text),
    ...onSurfaces(NON_TEXT, nonText),
    ...(theme === 'contrast' ? onSurfaces(['--border'], 3) : []),
    { label: '--text-on-accent on --accent', fg: '--text-on-accent', bg: '--accent', minimum: text },
    { label: '--accent on --tab-selected', fg: '--accent', bg: '--tab-selected', minimum: text },
  ]
}

describe.each(['dark', 'light', 'contrast'] as const)('the %s theme', (theme) => {
  const tokens = tokensOf(theme)

  it('writes the colours it checks as hex, so they can be measured', () => {
    const names = new Set(pairs(theme).flatMap(({ fg, bg }) => [fg, bg]))
    const unreadable = [...names].filter((name) => !isHexColour(tokens.get(name) ?? ''))
    expect(unreadable).toEqual([])
  })

  it('reaches its contrast minimums', () => {
    const failures = pairs(theme).flatMap(({ label, fg, bg, minimum }) => {
      const ratio = contrast(tokens.get(fg)!, tokens.get(bg)!)
      const recorded = theme === 'dark' ? DARK_EXCEPTIONS[label] : undefined
      if (ratio >= minimum) return []
      if (recorded !== undefined && Math.abs(ratio - recorded) < 0.01) return []
      return [`${label}: ${ratio.toFixed(2)} < ${minimum}`]
    })
    expect(failures).toEqual([])
  })
})

describe('Dark\'s recorded exceptions', () => {
  it('still fall short, so a fixed one is taken off the list', () => {
    const tokens = tokensOf('dark')
    for (const [label, recorded] of Object.entries(DARK_EXCEPTIONS)) {
      const [fg, bg] = label.split(' on ') as [string, string]
      expect(contrast(tokens.get(fg)!, tokens.get(bg)!)).toBeCloseTo(recorded, 2)
    }
  })
})
