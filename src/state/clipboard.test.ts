import { describe, expect, it, vi } from 'vitest'
import { createClipboard, subscribeToClipboards } from './clipboard'

describe('createClipboard', () => {
  it('starts empty and holds the last thing copied', () => {
    const clipboard = createClipboard<readonly number[]>([])
    expect(clipboard.get()).toEqual([])
    const copied = [1, 2]
    clipboard.set(copied)
    expect(clipboard.get()).toBe(copied)
  })

  it('tells subscribers when something is copied, and stops after unsubscribe', () => {
    const clipboard = createClipboard<string | null>(null)
    const listener = vi.fn()
    const unsubscribe = clipboard.subscribe(listener)
    clipboard.set('a')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    clipboard.set('b')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps each clipboard apart, and tells menus about any of them', () => {
    const notes = createClipboard(0), clips = createClipboard(0)
    const onNotes = vi.fn(), onAny = vi.fn()
    notes.subscribe(onNotes)
    const unsubscribe = subscribeToClipboards(onAny)
    clips.set(1)
    expect(notes.get()).toBe(0)
    expect(onNotes).not.toHaveBeenCalled()
    notes.set(2)
    expect(onAny).toHaveBeenCalledTimes(2)
    unsubscribe()
    notes.set(3)
    expect(onAny).toHaveBeenCalledTimes(2)
  })
})
