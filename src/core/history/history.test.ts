import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, commit, createHistory, redo, undo } from './history'

const at = (now: number, key?: string) => ({ now, key })

describe('history', () => {
  it('starts empty', () => {
    const history = createHistory('a')
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
    expect(undo(history)).toBe(history)
    expect(redo(history)).toBe(history)
  })

  it('undoes and redoes through several edits', () => {
    let history = createHistory('a')
    history = commit(history, 'b', at(0))
    history = commit(history, 'c', at(0))

    history = undo(history)
    expect(history.present).toBe('b')
    history = undo(history)
    expect(history.present).toBe('a')
    expect(canUndo(history)).toBe(false)

    history = redo(redo(history))
    expect(history.present).toBe('c')
    expect(canRedo(history)).toBe(false)
  })

  it('discards the redo stack when a new edit is made', () => {
    let history = commit(createHistory('a'), 'b', at(0))
    history = undo(history)
    history = commit(history, 'c', at(0))

    expect(canRedo(history)).toBe(false)
    expect(undo(history).present).toBe('a')
  })

  it('ignores edits that change nothing', () => {
    const history = createHistory('a')
    expect(commit(history, 'a', at(0))).toBe(history)
  })

  it('merges rapid edits with the same key into one step', () => {
    let history = createHistory(0)
    for (let value = 1; value <= 20; value++) history = commit(history, value, at(value * 10, 'slider'))

    expect(history.present).toBe(20)
    expect(history.past).toEqual([0])
    expect(undo(history).present).toBe(0)
  })

  it('keeps edits separate when the key differs or the pause is long', () => {
    let history = createHistory(0)
    history = commit(history, 1, at(0, 'a'))
    history = commit(history, 2, at(10, 'b'))
    history = commit(history, 3, at(5000, 'b'))

    expect(history.past).toEqual([0, 1, 2])
  })

  it('never merges across an undo', () => {
    let history = commit(createHistory(0), 1, at(0, 'k'))
    history = undo(history)
    history = commit(history, 5, at(10, 'k'))

    expect(history.past).toEqual([0])
    expect(history.present).toBe(5)
  })

  it('caps the number of steps kept', () => {
    let history = createHistory(0)
    for (let value = 1; value <= 10; value++) history = commit(history, value, { now: 0, limit: 3 })

    expect(history.past).toEqual([7, 8, 9])
  })
})
