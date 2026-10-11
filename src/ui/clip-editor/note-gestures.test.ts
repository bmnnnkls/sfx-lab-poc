import { type Note, createNote, notesEqual } from '@core'
import { describe, expect, it } from 'vitest'
import { type GridContext, type Pointer, applyGesture, beginDraw } from './note-gestures'

const grid: GridContext = { step: 0.5, lengthBeats: 8 }
const at = (beat: number, pitch = 60): Pointer => ({ beat, pitch })
const shape = (notes: readonly Note[]) => notes.map((n) => [n.pitch, n.start, n.duration])

describe('drawing', () => {
  it('a plain click makes a one-step note on the cell under the pointer', () => {
    const gesture = beginDraw([], at(2.3), grid)
    expect(shape(applyGesture(gesture, at(2.3), grid))).toEqual([[60, 2, 0.5]])
  })

  it('dragging right stretches the note to cover every cell touched', () => {
    const gesture = beginDraw([], at(2.1), grid)
    expect(shape(applyGesture(gesture, at(3.2), grid))).toEqual([[60, 2, 1.5]])
  })

  it('dragging left draws backwards from the anchor cell', () => {
    const gesture = beginDraw([], at(3.1), grid)
    expect(shape(applyGesture(gesture, at(1.2), grid))).toEqual([[60, 1, 2.5]])
  })

  it('keeps the pitch it started on and stays inside the clip', () => {
    const gesture = beginDraw([], at(6.1, 64), grid)
    expect(shape(applyGesture(gesture, at(50, 90), grid))).toEqual([[64, 6, 2]])
    expect(shape(applyGesture(gesture, at(-5, 90), grid))).toEqual([[64, 0, 6.5]])
  })

  it('leaves the existing notes untouched and appends the new one', () => {
    const existing = createNote(40, 0, 1)
    const result = applyGesture(beginDraw([existing], at(4), grid), at(4), grid)
    expect(result[0]).toBe(existing)
    expect(result).toHaveLength(2)
  })
})

describe('moving', () => {
  const a = createNote(60, 1, 1)
  const b = createNote(67, 3, 1)
  const gesture = { kind: 'move', origin: [a, b], ids: new Set([a.id]), anchor: at(1.2, 60) } as const

  it('snaps the time shift to the grid and follows the pitch row', () => {
    const [moved] = applyGesture(gesture, at(2.5, 63), grid)
    expect(moved).toMatchObject({ start: 2.5, pitch: 63 })
  })

  it('only moves the selection', () => {
    expect(applyGesture(gesture, at(5, 70), grid)[1]).toBe(b)
  })

  it('is a no-op when the pointer has not moved a full step', () => {
    expect(notesEqual(applyGesture(gesture, at(1.4, 60), grid), [a, b])).toBe(true)
  })

  it('is stable: the result depends only on the pointer, not on earlier positions', () => {
    const wander = applyGesture(gesture, at(7, 80), grid)
    expect(wander).not.toEqual([a, b])
    expect(notesEqual(applyGesture(gesture, at(1.2, 60), grid), [a, b])).toBe(true)
  })
})

describe('resizing', () => {
  const note = createNote(60, 2, 2)
  const end = { kind: 'resize-end', origin: [note], ids: new Set([note.id]), anchor: at(4) } as const
  const start = { kind: 'resize-start', origin: [note], ids: new Set([note.id]), anchor: at(2) } as const

  it('lengthens and shortens from the right edge, never below one grid step', () => {
    expect(applyGesture(end, at(5.5), grid)[0]).toMatchObject({ start: 2, duration: 3.5 })
    expect(applyGesture(end, at(2.1), grid)[0]).toMatchObject({ start: 2, duration: 0.5 })
  })

  it('stops at the end of the clip', () => {
    expect(applyGesture(end, at(100), grid)[0]).toMatchObject({ start: 2, duration: 6 })
  })

  it('moves the start from the left edge while the end stays fixed', () => {
    expect(applyGesture(start, at(1), grid)[0]).toMatchObject({ start: 1, duration: 3 })
    expect(applyGesture(start, at(100), grid)[0]).toMatchObject({ start: 3.5, duration: 0.5 })
  })

  it('does not stretch a note already shorter than the grid', () => {
    const tiny = createNote(60, 2, 0.125)
    const gesture = { kind: 'resize-end', origin: [tiny], ids: new Set([tiny.id]), anchor: at(2.1) } as const
    expect(applyGesture(gesture, at(2.1), grid)[0]!.duration).toBe(0.125)
  })
})
