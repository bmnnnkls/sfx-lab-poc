import { describe, expect, it } from 'vitest'
import { type Clip, createNote } from '../project'
import { ClipLauncher } from './clip-launcher'

const clip = (id: string, lengthBeats = 4): Clip => ({
  id,
  name: id,
  lengthBeats,
  notes: [createNote(60, 0, 1, 1), createNote(64, 2, 4, 1)],
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

describe('ClipLauncher editing while playing', () => {
  /** A clip with one long note (beats 0..3) that is sounding at beat 1.5. */
  const setup = () => {
    const sustained = createNote(60, 0, 3)
    const clip: Clip = { id: 'a', name: 'a', lengthBeats: 4, notes: [sustained] }
    const launcher = new ClipLauncher()
    launcher.launch(clip)
    launcher.collectEvents(0, 1.5)
    return { launcher, clip, sustained }
  }
  const withNotes = (clip: Clip, notes: Clip['notes']): Clip => ({ ...clip, notes })
  const offs = (events: ReturnType<ClipLauncher['collectEvents']>) =>
    events.filter((e) => e.kind === 'noteOff').map((e) => [e.beat, 'pitch' in e ? e.pitch : null])

  it('releases a sounding note that is deleted', () => {
    const { launcher, clip } = setup()
    launcher.syncClips([withNotes(clip, [])])

    expect(offs(launcher.collectEvents(1.5, 2))).toEqual([[1.5, 60]])
    expect(offs(launcher.collectEvents(2, 3.5))).toEqual([]) // and the original noteOff never fires
  })

  it('releases a sounding note that is moved or re-pitched, then plays it at its new place', () => {
    const { launcher, clip, sustained } = setup()
    launcher.syncClips([withNotes(clip, [{ ...sustained, start: 2, duration: 1 }])])
    const events = launcher.collectEvents(1.5, 4)

    expect(offs(events).slice(0, 1)).toEqual([[1.5, 60]])
    expect(events.filter((e) => e.kind === 'noteOn').map((e) => e.beat)).toEqual([2])

    const repitched = setup()
    repitched.launcher.syncClips([withNotes(repitched.clip, [{ ...repitched.sustained, pitch: 67 }])])
    expect(offs(repitched.launcher.collectEvents(1.5, 2))).toEqual([[1.5, 60]])
  })

  it('releases a note shortened to end in the past, but not one merely changed to end later', () => {
    const shortened = setup()
    shortened.launcher.syncClips([withNotes(shortened.clip, [{ ...shortened.sustained, duration: 1 }])])
    expect(offs(shortened.launcher.collectEvents(1.5, 2))).toEqual([[1.5, 60]])

    const lengthened = setup()
    lengthened.launcher.syncClips([withNotes(lengthened.clip, [{ ...lengthened.sustained, duration: 3.5 }])])
    const events = lengthened.launcher.collectEvents(1.5, 4)
    expect(offs(events)).toEqual([[3.5, 60]]) // keeps sounding, ends at its new end
  })

  it('leaves notes alone when an unrelated part of the clip changes', () => {
    const { launcher, clip, sustained } = setup()
    launcher.syncClips([withNotes(clip, [sustained, createNote(72, 3.5, 0.25)])])
    const events = launcher.collectEvents(1.5, 4)

    expect(offs(events)).toEqual([[3, 60], [3.75, 72]])
  })

  it('releases everything when the playing clip disappears', () => {
    const { launcher } = setup()
    launcher.syncClips([])
    expect(offs(launcher.collectEvents(1.5, 2))).toEqual([[1.5, 60]])
    expect(launcher.status().playingClipId).toBeNull()
  })

  it('does not release a note whose first loop pass already ended', () => {
    const { launcher, clip, sustained } = setup()
    launcher.collectEvents(1.5, 3.5) // note ended at 3
    launcher.syncClips([withNotes(clip, [sustained])])

    expect(offs(launcher.collectEvents(3.5, 4))).toEqual([])
  })
})
