import { describe, expect, it } from 'vitest'
import { addTrack, createClip, createEmptyProject, createTrack, diffProject, setClipAt, type Project } from '../index'
import { Engine } from './engine'
import type { EngineCommand } from './commands'

/** Renders `frames` samples in blocks of `block`, as the worklet pulls 128 at a time; returns the left channel and the clock edges seen. */
const render = (engine: Engine, frames: number, block = 128) => {
  const left = new Float32Array(frames)
  const edges: { frame: number; beat: number }[] = []
  for (let offset = 0; offset < frames; offset += block) {
    const l = new Float32Array(Math.min(block, frames - offset)), r = new Float32Array(l.length)
    engine.render(l, r)
    left.set(l, offset)
    const edge = engine.lastClockEdge()
    if (edge) edges.push({ frame: offset + edge.frame, beat: edge.beat })
  }
  return { left, edges }
}
const engineWith = (rate: number, ...commands: EngineCommand[]) => {
  const engine = new Engine(rate)
  for (const command of commands) engine.apply(command)
  return engine
}
const onsets = (data: Float32Array) => {
  const found: number[] = []
  let quiet = Infinity
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) { quiet++; continue }
    if (quiet > 100) found.push(i - 1)
    quiet = 0
  }
  return found
}
const level: EngineCommand = { type: 'transport/metronome', on: false, level: -12 }
const countIn = (bars: number, then: Extract<EngineCommand, { type: 'transport/countIn' }>['then'] = { type: 'transport/play' }): EngineCommand => ({ type: 'transport/countIn', bars, then })

describe('Count-in', () => {
  it.each([[120, 44100, 1], [97, 48000, 1], [120, 48000, 2], [97, 44100, 2]])('starts the transport on the frame its bars end at %i BPM, %i Hz, %i bar(s)', (bpm, rate, bars) => {
    const engine = engineWith(rate, { type: 'transport/setTempo', bpm }, level, countIn(bars))
    const perBeat = (rate * 60) / bpm
    const start = Math.ceil(bars * 4 * perBeat - 1e-6)
    const { left, edges } = render(engine, start + 2000)
    expect(edges).toEqual([{ frame: start, beat: 0 }])
    expect(engine.status().playing).toBe(true)
    // It clicked each beat of the count-in, with the metronome off, and nothing after the start.
    expect(onsets(left)).toEqual(Array.from({ length: bars * 4 }, (_, beat) => Math.ceil(beat * perBeat - 1e-6) + 0))
  })

  it('reports the bars left and its beat, counting up to 0, while the transport stays stopped', () => {
    const engine = engineWith(48000, level, countIn(2))
    expect(engine.status()).toMatchObject({ playing: false, countIn: { barsLeft: 2, beat: -8 } })
    expect(engine.clock()).toMatchObject({ playing: false, countIn: { beat: -8 } })
    render(engine, 24000 * 5) // five beats at 120 BPM
    expect(engine.status()).toMatchObject({ playing: false, countIn: { barsLeft: 1, beat: expect.closeTo(-3, 9) } })
    render(engine, 24000 * 3)
    expect(engine.status().countIn).toBeUndefined()
    expect(engine.status().playing).toBe(true)
  })

  it('stop cancels it: nothing starts', () => {
    const engine = engineWith(48000, level, countIn(1))
    render(engine, 24000)
    engine.apply({ type: 'transport/stop' })
    const { left, edges } = render(engine, 24000 * 4)
    expect(edges).toEqual([])
    expect(engine.status()).toMatchObject({ playing: false })
    expect(engine.status().countIn).toBeUndefined()
    expect(left.every((value) => value === 0)).toBe(true)
  })

  it('a tempo change during it applies at once', () => {
    const engine = engineWith(48000, level, countIn(1))
    render(engine, 24000 * 2) // two beats at 120
    engine.apply({ type: 'transport/setTempo', bpm: 60 })
    const { edges } = render(engine, 48000 * 3)
    expect(edges).toEqual([{ frame: 48000 * 2, beat: 0 }])
  })

  it('runs `then` at once while playing, or with no bars', () => {
    const playing = engineWith(48000, { type: 'transport/play' })
    playing.apply(countIn(2))
    expect(playing.status().countIn).toBeUndefined()
    const none = engineWith(48000, countIn(0))
    expect(none.status()).toMatchObject({ playing: true })
  })

  it('an arrangement start jumps to its position on the start frame', () => {
    const engine = engineWith(48000, level, countIn(1, { type: 'arrangement/play', fromBeat: 16 }))
    const { edges } = render(engine, 24000 * 5)
    expect(edges).toEqual([{ frame: 24000 * 4, beat: 16 }])
    expect(engine.status()).toMatchObject({ playing: true, mode: 'arrangement' })
  })

  it('queues its launch at once, and launches during it join: they start with the transport', () => {
    const a = createTrack('A', 4), b = createTrack('B', 4)
    let project: Project = addTrack(addTrack({ ...createEmptyProject(), tracks: [] }, a), b)
    project = setClipAt(setClipAt(project, a.id, 0, createClip('a', 4)), b.id, 0, createClip('b', 4))
    const clipOf = (id: string) => { const track = project.tracks.find((t) => t.id === id)!; return track.kind === 'instrument' ? track.clips[0]!.id : '' }
    const engine = engineWith(48000, ...diffProject(null, project), level, countIn(1, { type: 'clip/launch', trackId: a.id, clipId: clipOf(a.id) }))
    expect(engine.status().tracks[a.id]).toMatchObject({ queued: clipOf(a.id), playingClipId: null })
    render(engine, 24000)
    engine.apply({ type: 'clip/launch', trackId: b.id, clipId: clipOf(b.id) })
    engine.apply({ type: 'transport/play' })
    expect(engine.status()).toMatchObject({ playing: false, countIn: { barsLeft: 1 } })
    render(engine, 24000 * 3 + 128)
    const status = engine.status()
    expect(status.playing).toBe(true)
    expect(status.tracks[a.id]).toMatchObject({ playingClipId: clipOf(a.id), startBeat: expect.closeTo(0, 9) })
    expect(status.tracks[b.id]).toMatchObject({ playingClipId: clipOf(b.id), startBeat: expect.closeTo(0, 9) })
  })

  it('clicks once on the start with the metronome on, and keeps clicking after', () => {
    const engine = engineWith(48000, { type: 'transport/metronome', on: true, level: -12 }, countIn(1))
    expect(onsets(render(engine, 24000 * 6).left)).toEqual([0, 1, 2, 3, 4, 5].map((beat) => beat * 24000))
  })
})
