import { describe, expect, it } from 'vitest'
import type { Clip } from '../project'
import { ClipLauncher } from './clip-launcher'

const clip = (id: string, lengthBeats = 4): Clip => ({
  id,
  name: id,
  lengthBeats,
  notes: [
    { pitch: 60, start: 0, duration: 1, velocity: 1 },
    { pitch: 64, start: 2, duration: 4, velocity: 1 },
  ],
})

describe('ClipLauncher', () => {
  it('stays silent until a clip is launched', () => {
    expect(new ClipLauncher().collectEvents(0, 8)).toEqual([])
  })

  it('starts a launched clip on the next bar boundary', () => {
    const launcher = new ClipLauncher()
    launcher.launch(clip('a'))

    expect(launcher.collectEvents(0.5, 3.5)).toEqual([])
    expect(launcher.status()).toMatchObject({ playingClipId: null, queued: 'a' })

    const events = launcher.collectEvents(3.5, 4.5)
    expect(events.map((e) => [e.beat, e.kind])).toEqual([
      [4, 'allOff'],
      [4, 'noteOn'],
    ])
    expect(launcher.status().playingClipId).toBe('a')
  })

  it('loops and clamps notes to the clip length', () => {
    const launcher = new ClipLauncher()
    launcher.launch(clip('a'))
    const events = launcher.collectEvents(0, 8).filter((e) => e.kind !== 'allOff')

    expect(events.map((e) => [e.beat, e.kind, 'pitch' in e ? e.pitch : 0])).toEqual([
      [0, 'noteOn', 60],
      [1, 'noteOff', 60],
      [2, 'noteOn', 64],
      [4, 'noteOff', 64],
      [4, 'noteOn', 60],
      [5, 'noteOff', 60],
      [6, 'noteOn', 64],
    ])
  })

  it('emits each event exactly once across contiguous ranges', () => {
    const whole = new ClipLauncher()
    whole.launch(clip('a'))
    const expected = whole.collectEvents(0, 16)

    const sliced = new ClipLauncher()
    sliced.launch(clip('a'))
    const actual = []
    for (let from = 0; from < 16; from += 0.37) actual.push(...sliced.collectEvents(from, Math.min(16, from + 0.37)))

    expect(actual).toEqual(expected)
  })

  it('switches clips at the boundary and silences the old one', () => {
    const launcher = new ClipLauncher()
    launcher.launch(clip('a'))
    launcher.collectEvents(0, 1)
    launcher.launch(clip('b'))

    const events = launcher.collectEvents(1, 5)
    expect(events.find((e) => e.kind === 'allOff')?.beat).toBe(4)
    expect(launcher.status().playingClipId).toBe('b')
  })

  it('stops at the next boundary when a stop is queued', () => {
    const launcher = new ClipLauncher()
    launcher.launch(clip('a'))
    launcher.collectEvents(0, 1)
    launcher.stop()

    launcher.collectEvents(1, 5)
    expect(launcher.status()).toMatchObject({ playingClipId: null, queued: null })
    expect(launcher.collectEvents(5, 9)).toEqual([])
  })
})
