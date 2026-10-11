import { describe, expect, it } from 'vitest'
import { nodeDefinitions } from '@core'
import { buildCatalog } from './node-catalog'
import { INITIAL, type QuickAddAction, type QuickAddState, rowsOf, step } from './quick-add-model'

const catalog = buildCatalog(nodeDefinitions.filter((definition) => definition.insertOnly !== true), [])

/** Plays actions in order, returning the final state and what came out. */
const play = (actions: QuickAddAction[], from: QuickAddState = INITIAL) => {
  let state = from
  let result = step(catalog, state, { type: 'key', key: 'Shift' })
  for (const action of actions) {
    result = step(catalog, state, action)
    state = result.state
  }
  return { state, result }
}
const type = (query: string): QuickAddAction => ({ type: 'input', query })
const key = (name: string): QuickAddAction => ({ type: 'key', key: name })
const names = (state: QuickAddState) => rowsOf(catalog, state).map((row) => (row.kind === 'category' ? `${row.name} (${row.count})` : row.entry.label))

describe('quick-add: what it lists', () => {
  it('opens on the categories, each with its count', () => {
    const rows = names(INITIAL)
    expect(rows[0]).toBe('Sources (3)')
    expect(rows).toContain('Math (24)')
    expect(rows).toHaveLength(7)
  })

  it('drilling into a category lists its nodes', () => {
    const { state } = play([key('Enter')])
    expect(state.scope).toBe('Sources')
    expect(names(state)).toEqual(['Note', 'Oscillator', 'Sampler'])
  })

  it('Backspace on an empty field goes back up; with text it only edits', () => {
    const drilled = play([key('Enter')]).state
    const up = step(catalog, drilled, key('Backspace'))
    expect(up.state.scope).toBeNull()
    expect(up.handled).toBe(true)
    const typed = step(catalog, { ...drilled, query: 'a' }, key('Backspace'))
    expect(typed.state.scope).toBe('Sources')
    expect(typed.handled).toBe(false)
    expect(step(catalog, INITIAL, key('Backspace')).handled).toBe(false)
  })

  it('typing searches across everything, even inside a category', () => {
    const { state } = play([key('Enter'), type('reverb')])
    expect(names(state)[0]).toBe('Reverb')
    expect(state.active).toBe(0)
  })

  it('clearing the text inside a category shows that category again', () => {
    const { state } = play([key('Enter'), type('reverb'), type('')])
    expect(names(state)).toEqual(['Note', 'Oscillator', 'Sampler'])
  })
})

describe('quick-add: keys and mouse', () => {
  it('Down and Up move the highlight and wrap around', () => {
    expect(play([key('ArrowDown')]).state.active).toBe(1)
    expect(play([key('ArrowUp')]).state.active).toBe(names(INITIAL).length - 1)
    expect(play(Array.from({ length: names(INITIAL).length }, () => key('ArrowDown'))).state.active).toBe(0)
  })

  it('Enter on a node picks it and closes; Enter on a category drills in without closing', () => {
    const drill = play([key('Enter')])
    expect(drill.result.pick).toBeUndefined()
    expect(drill.result.close).toBeUndefined()
    const picked = play([type('gain'), key('Enter')])
    expect(picked.result.pick?.ref).toBe('gain')
    expect(picked.result.close).toBe(true)
  })

  it('Enter picks the highlighted row, not just the first', () => {
    const rows = names({ ...INITIAL, query: 'mi' })
    expect(rows.length).toBeGreaterThan(2)
    const picked = play([type('mi'), key('ArrowDown'), key('Enter')])
    expect(picked.result.pick?.label).toBe(rows[1])
  })

  it('hovering highlights, a click activates that row', () => {
    expect(play([{ type: 'hover', index: 3 }]).state.active).toBe(3)
    const click = play([type('filter'), { type: 'activate', index: 0 }])
    expect(click.result.pick?.ref).toBe('filter')
  })

  it('Enter with nothing matching does nothing; Escape closes', () => {
    const none = play([type('zzzz'), key('Enter')])
    expect(none.result.pick).toBeUndefined()
    expect(none.result.close).toBeUndefined()
    expect(play([key('Escape')]).result.close).toBe(true)
  })

  it('keys it does not own are left to the page (typing)', () => {
    expect(step(catalog, INITIAL, key('a')).handled).toBe(false)
  })

  it('arrows on an empty list do not break', () => {
    const empty = play([type('zzzz'), key('ArrowDown'), key('ArrowUp')])
    expect(empty.state.active).toBe(0)
  })
})
