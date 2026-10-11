import { createNote } from '@core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteClipboard } from './note-clipboard'

describe('noteClipboard', () => {
  afterEach(() => noteClipboard.set([]))

  it('holds the last copied notes', () => {
    const notes = [createNote(60, 0, 1)]
    noteClipboard.set(notes)
    expect(noteClipboard.get()).toBe(notes)
  })

  it('tells subscribers when something is copied, and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = noteClipboard.subscribe(listener)

    noteClipboard.set([createNote(60, 0, 1)])
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    noteClipboard.set([createNote(62, 0, 1)])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
