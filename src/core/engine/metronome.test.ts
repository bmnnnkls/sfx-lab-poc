import { describe, expect, it } from 'vitest'
import { addTrack, createClip, createEmptyProject, createTrack, diffProject, setClipAt, type Project } from '../index'
import { renderProject } from './bounce'
import { Engine } from './engine'
import type { EngineCommand } from './commands'

/** Renders `frames` samples in blocks of `block`, as the worklet pulls 128 at a time. */
const render = (engine: Engine, frames: number, block = 128) => {
  const left = new Float32Array(frames)
  for (let offset = 0; offset < frames; offset += block) {
    const l = new Float32Array(Math.min(block, frames - offset)), r = new Float32Array(l.length)
    engine.render(l, r)
    left.set(l, offset)
  }
  return left
}
const engineWith = (rate: number, ...commands: EngineCommand[]) => {
  const engine = new Engine(rate)
  for (const command of commands) engine.apply(command)
  return engine
}
/** The frame each click starts on: the sample before the first non-zero one after a silence. */
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
/** Rising zero crossings per second over `seconds` from `from`. */
const hz = (data: Float32Array, from: number, rate: number, seconds = 0.02) => {
  let count = 0
  for (let i = from + 1; i < from + seconds * rate; i++) if (data[i - 1]! < 0 && data[i]! >= 0) count++
  return count / seconds
}
const on: EngineCommand = { type: 'transport/metronome', on: true, level: -12 }

describe('Metronome', () => {
  it.each([[120, 44100], [97, 48000], [120, 48000], [97, 44100]])('clicks on the first sample at or after each beat at %i BPM, %i Hz', (bpm, rate) => {
    const engine = engineWith(rate, { type: 'transport/setTempo', bpm }, on, { type: 'transport/play' })
    const perBeat = (rate * 60) / bpm
    const data = render(engine, Math.ceil(perBeat * 4.5))
    expect(onsets(data)).toEqual([0, 1, 2, 3, 4].map((beat) => Math.ceil(beat * perBeat - 1e-6) + 0))
  })

  it('clicks higher on the first beat of the bar', () => {
    const data = render(engineWith(48000, on, { type: 'transport/play' }), 48000 * 2)
    expect(hz(data, 0, 48000)).toBeGreaterThan(1400)
    expect(hz(data, 0, 48000)).toBeLessThan(1550)
    expect(hz(data, 24000, 48000)).toBeGreaterThan(900)
    expect(hz(data, 24000, 48000)).toBeLessThan(1050)
  })

  it('is the same across block boundaries as in one block', () => {
    const one = render(engineWith(44100, { type: 'transport/setTempo', bpm: 97 }, on, { type: 'transport/play' }), 60000, 60000)
    const odd = render(engineWith(44100, { type: 'transport/setTempo', bpm: 97 }, on, { type: 'transport/play' }), 60000, 77)
    expect(odd.every((value, i) => value === one[i])).toBe(true)
    // A click that starts near a block's end goes on into the next.
    const data = render(engineWith(44100, on, { type: 'transport/play' }), 22050 + 1200, 22050 + 10)
    expect(data.slice(22050 + 10, 22050 + 1000).some((value) => value !== 0)).toBe(true)
  })

  it('clicks the loop start after a loop jump', () => {
    const engine = engineWith(48000, on, { type: 'arrangement/setLoop', loop: { from: 1, to: 3 } }, { type: 'arrangement/play', fromBeat: 1 })
    expect(onsets(render(engine, 24000 * 5))).toEqual([0, 24000, 48000, 72000, 96000])
    const off = engineWith(48000, on, { type: 'arrangement/setLoop', loop: { from: 0.5, to: 2.5 } }, { type: 'arrangement/play', fromBeat: 0.5 })
    // Beats 1 and 2, then the jump back to 0.5: the next click is beat 1 again.
    expect(onsets(render(off, 24000 * 5))).toEqual([12000, 36000, 60000, 84000, 108000])
  })

  it('is silent while the transport is stopped, and when off', () => {
    expect(render(engineWith(48000, on), 48000).every((value) => value === 0)).toBe(true)
    expect(render(engineWith(48000, { type: 'transport/play' }), 48000).every((value) => value === 0)).toBe(true)
    const engine = engineWith(48000, on, { type: 'transport/play' })
    render(engine, 1000)
    engine.apply({ type: 'transport/metronome', on: false, level: -12 })
    expect(render(engine, 48000).every((value) => value === 0)).toBe(true)
  })

  it('follows the level', () => {
    const peak = (level: number) => render(engineWith(48000, { type: 'transport/metronome', on: true, level }, { type: 'transport/play' }), 2000).reduce((max, v) => Math.max(max, Math.abs(v)), 0)
    expect(peak(-40)).toBeLessThan(0.011)
    expect(peak(-12)).toBeGreaterThan(0.2)
    expect(peak(-12)).toBeLessThan(0.26)
  })

  it('never reaches a bounce, which builds its own engine from the project', () => {
    const track = createTrack('Silent', 4)
    const project: Project = setClipAt(addTrack({ ...createEmptyProject(), tracks: [] }, track), track.id, 0, createClip('c', 4))
    const live = engineWith(48000, ...diffProject(null, project), on, { type: 'clip/launch', trackId: track.id, clipId: project.tracks[0]!.kind === 'instrument' ? project.tracks[0]!.clips[0]!.id : '' })
    expect(onsets(render(live, 48000 * 2)).length).toBeGreaterThan(0)
    const bounce = renderProject(project, [], { scope: { kind: 'scene', scene: 0 }, bars: 1, maxTail: 0 })
    expect(bounce.left.every((value) => value === 0)).toBe(true)
  })
})
