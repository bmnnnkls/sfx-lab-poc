import { describe, expect, it } from 'vitest'
import { INITIAL, type PaletteRow, rankRows, RECENT_LIMIT, step, withRecent } from './palette-model'

const command = (id: string, label: string, category: PaletteRow['category'] = 'View', enabled = true): PaletteRow => ({
  id: `command:${id}`, label, enabled, takesFocus: false, category, target: { kind: 'command', command: id },
})
const action = (id: string, label: string): PaletteRow => ({
  id: `subject:0:${id}`, label, enabled: true, takesFocus: false, target: { kind: 'action', action: id, subject: { kind: 'master' } },
})

const ROWS: readonly PaletteRow[] = [
  command('layout.reset', 'Layout: Reset layout', 'Layout'),
  command('view.show.mixer', 'View: Show Mixer'),
  command('view.show.session', 'View: Show Session'),
  command('file.new', 'File: New project', 'File'),
  action('master.open-effects', 'Master: Open effects'),
]
const labels = (rows: readonly PaletteRow[]) => rows.map((row) => row.label)

describe('rankRows', () => {
  it('with nothing typed: recent commands, newest first, then the subject actions, then the rest by category', () => {
    expect(labels(rankRows(ROWS, '', ['command:file.new']))).toEqual([
      'File: New project', 'Master: Open effects', 'View: Show Mixer', 'View: Show Session', 'Layout: Reset layout',
    ])
  })

  it('ranks matches by how well they match, then recent, then commands before actions', () => {
    expect(labels(rankRows(ROWS, 'mixer', []))).toEqual(['View: Show Mixer'])
    expect(labels(rankRows(ROWS, 'show', ['command:view.show.session']))).toEqual(['View: Show Session', 'View: Show Mixer'])
    expect(labels(rankRows(ROWS, 'open', []))).toEqual(['Master: Open effects'])
    // A word of the label beats letters in order, and a category word matches.
    expect(labels(rankRows(ROWS, 'layout', []))).toEqual(['Layout: Reset layout'])
    expect(labels(rankRows(ROWS, 'zzz', []))).toEqual([])
  })

  it('keeps up to eight recent commands, newest first, and never actions', () => {
    let recent: readonly string[] = []
    for (let index = 0; index < 10; index++) recent = withRecent(recent, command(`c${index}`, `View: ${index}`))
    expect(recent).toHaveLength(RECENT_LIMIT)
    expect(recent[0]).toBe('command:c9')
    expect(withRecent(recent, command('c3', 'View: 3'))[0]).toBe('command:c3')
    expect(withRecent(recent, action('x', 'Master: X'))).toBe(recent)
  })
})

describe('step', () => {
  it('moves through the rows, wrapping, and runs the active one with Enter', () => {
    let state = step(ROWS, INITIAL, { type: 'key', key: 'ArrowUp' }).state
    expect(state.active).toBe(ROWS.length - 1)
    state = step(ROWS, state, { type: 'key', key: 'ArrowDown' }).state
    expect(state.active).toBe(0)
    const result = step(ROWS, state, { type: 'key', key: 'Enter' })
    expect(result).toMatchObject({ run: ROWS[0], close: true, handled: true })
  })

  it('starts at the top on each keystroke, and closes on Escape', () => {
    const typed = step(ROWS, { query: '', active: 3 }, { type: 'input', query: 'm' })
    expect(typed).toEqual({ state: { query: 'm', active: 0 }, handled: false })
    expect(step(ROWS, INITIAL, { type: 'key', key: 'Escape' })).toMatchObject({ close: true, handled: true })
    expect(step(ROWS, INITIAL, { type: 'key', key: 'a' }).handled).toBe(false)
  })

  it("doesn't run a disabled row, and runs a clicked one", () => {
    const rows = [command('file.restore-previous', 'File: Restore previous', 'File', false), ...ROWS]
    expect(step(rows, INITIAL, { type: 'key', key: 'Enter' }).run).toBeUndefined()
    expect(step(rows, INITIAL, { type: 'activate', index: 2 }).run).toBe(rows[2])
    expect(step(rows, INITIAL, { type: 'hover', index: 4 }).state.active).toBe(4)
    expect(step([], INITIAL, { type: 'key', key: 'PageDown' }).state.active).toBe(0)
  })
})
