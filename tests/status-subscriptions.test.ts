import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The status store updates about 30 times a second. A component that selects the whole status re-renders on
 * every update, so `ui` components select only what they show (a leaf component like the piano roll's
 * `Playhead`), or write to the DOM from `useStatusStore.subscribe` (`LevelBar`).
 */

const UI = resolve(import.meta.dirname, '../src/ui')

/** `useStatusStore((s) => s.status)` and `useStatusStore(({ status }) => status)`, with any parameter name. */
const WHOLE_STATUS = [
  /useStatusStore\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.status\s*\)/,
  /useStatusStore\(\s*\(\s*\{\s*status\s*\}\s*\)\s*=>\s*status\s*\)/,
]

/** Files that may still select the whole status, each with the reason. Paths are relative to src/ui. */
const ALLOWED: Readonly<Record<string, string>> = {
  // Not legitimate, only not fixed yet: it needs the status just to ask `touchDestination` whether Touch can record
  // here, so a selector returning that boolean would do. Each one re-renders on every status update.
  'controls/EffectiveValue.tsx': 'pending: select whether a touch destination exists',
}

const uiFiles = (readdirSync(UI, { recursive: true }) as string[])
  .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))

describe('status subscriptions', () => {
  it('finds ui files to check', () => {
    expect(uiFiles.length).toBeGreaterThan(20)
  })

  it('never selects the whole status in a ui component', () => {
    const violations = uiFiles
      .filter((file) => !(file in ALLOWED))
      .filter((file) => WHOLE_STATUS.some((pattern) => pattern.test(readFileSync(join(UI, file), 'utf8'))))
    expect(violations).toEqual([])
  })

  it('keeps the allow-list current', () => {
    const stale = Object.keys(ALLOWED).filter((file) => {
      const path = join(UI, file)
      return !uiFiles.includes(relative(UI, path)) || !WHOLE_STATUS.some((pattern) => pattern.test(readFileSync(path, 'utf8')))
    })
    expect(stale).toEqual([])
  })
})
