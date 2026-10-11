import { describe, expect, it } from 'vitest'
import type { AudioClip } from '../project'
import { AudioClipLauncher } from './audio-clip-launcher'

const clip = (id: string): AudioClip => ({
  id,
  name: id,
  sampleId: 's',
  lengthBeats: 4,
  loop: true,
  warp: 'repitch',
  gain: 1,
})

describe('AudioClipLauncher', () => {
  it('is silent until something is launched', () => {
    expect(new AudioClipLauncher().collectEvents(0, 8)).toEqual([])
  })

  it('starts a launched clip on the next bar boundary, exactly once', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))

    expect(launcher.collectEvents(0.5, 3.5)).toEqual([])
    expect(launcher.queuedStatus()).toBe('a')

    expect(launcher.collectEvents(3.5, 4.5)).toEqual([{ beat: 4, kind: 'start', clip: clip('a') }])
    expect(launcher.queuedStatus()).toBeNull()
    expect(launcher.collectEvents(4.5, 20)).toEqual([])
  })

  it('starts immediately when launched at beat 0', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    expect(launcher.collectEvents(0, 0.01).map((e) => [e.beat, e.kind])).toEqual([[0, 'start']])
  })

  it('emits each event once across contiguous ranges, however the beats are sliced', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    const events = []
    for (let from = 0; from < 12; from += 0.37) events.push(...launcher.collectEvents(from, Math.min(12, from + 0.37)))

    expect(events).toHaveLength(1)
  })

  it('a newer launch replaces the pending one', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    launcher.launch(clip('b'))
    expect(launcher.collectEvents(0, 1)).toEqual([{ beat: 0, kind: 'start', clip: clip('b') }])
  })

  it('a queued stop becomes a stop event at the next boundary', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    launcher.collectEvents(0, 1)
    launcher.stop()

    expect(launcher.queuedStatus()).toBe('stop')
    expect(launcher.collectEvents(1, 5)).toEqual([{ beat: 4, kind: 'stop' }])
  })

  it('ignores a stop when nothing was ever launched', () => {
    const launcher = new AudioClipLauncher()
    launcher.stop()
    expect(launcher.collectEvents(0, 8)).toEqual([])
  })

  it('drops a queued clip that is deleted before it starts', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    launcher.syncClips([])
    expect(launcher.collectEvents(0, 8)).toEqual([])
  })

  it('starts the edited version of a clip that changed while queued', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    launcher.syncClips([{ ...clip('a'), gain: 0.5 }])
    const [event] = launcher.collectEvents(0, 1)
    expect(event && event.kind === 'start' && event.clip.gain).toBe(0.5)
  })

  it('reset forgets everything', () => {
    const launcher = new AudioClipLauncher()
    launcher.launch(clip('a'))
    launcher.reset()
    expect(launcher.collectEvents(0, 8)).toEqual([])
  })
})
