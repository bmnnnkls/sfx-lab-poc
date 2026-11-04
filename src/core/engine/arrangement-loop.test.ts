import { describe, expect, it } from 'vitest'
import { createDefaultFxGraph, createDefaultNoteGraph, type Patch } from '../patch'
import { type ArrangementClip, type AudioClip, createClip, createNote } from '../project'
import { Engine } from './engine'

const RATE = 48000
const AMPLITUDE = 0.2
const SAMPLE_ID = 'a'.repeat(64)
// A gate straight to the output: each held voice adds exactly one, so a release shows at once.
const gatePatch: Patch = {
  nodes: [
    { id: 'note', type: 'note', x: 0, y: 0, params: {} },
    { id: 'out', type: 'output', x: 0, y: 0, params: {} },
  ],
  connections: [{ id: 'wire', from: { node: 'note', port: 'gate' }, to: { node: 'out', port: 'in' } }],
}
const HELD = Math.tanh(0.1)

const setup = (regions: readonly ArrangementClip[], bpm = 120, sample?: Float32Array) => {
  const engine = new Engine(RATE)
  engine.apply({ type: 'transport/setTempo', bpm })
  engine.apply({ type: 'track/add', kind: 'instrument', trackId: 'synth', patch: gatePatch, noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(), clips: [], volume: 0.1, voices: 8 })
  engine.apply({ type: 'track/add', kind: 'audio', trackId: 'audio', fx: createDefaultFxGraph(), clips: [], volume: 1 })
  if (sample) engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: RATE, channels: [sample] } })
  engine.apply({ type: 'arrangement/set', clips: regions })
  return engine
}

/** Renders `frames` in calls of `chunk` frames, as the worklet does in quanta. */
const render = (engine: Engine, frames: number, chunk = 128): Float32Array => {
  const out = new Float32Array(frames)
  for (let offset = 0; offset < frames; offset += chunk) {
    const size = Math.min(chunk, frames - offset)
    const left = new Float32Array(size)
    engine.render(left, new Float32Array(size))
    out.set(left, offset)
  }
  return out
}

const beatsPerSample = (bpm: number) => bpm / 60 / RATE

const midi = (startBeat: number, notes = [createNote(60, 0, 4)], id = 'r-midi'): ArrangementClip => ({
  id, trackId: 'synth', startBeat, content: createClip('Groove', 4, notes),
})

const audioContent = (warp: AudioClip['warp']): AudioClip => ({
  id: 'arr-audio', name: 'Ramp', sampleId: SAMPLE_ID, lengthBeats: 4, loop: false, warp, gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0,
})

describe('the arrangement loop', () => {
  // 97 bpm at 48 kHz: a beat is 29690.72 samples, so the loop's end never falls on a sample.
  it.each([1, 97, 128, 4096])('jumps within a sample of the start and keeps its phase over ten passes, in blocks of %i', (chunk) => {
    const bpm = 97
    const step = beatsPerSample(bpm)
    const engine = setup([], bpm)
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 1, to: 2 } })
    engine.apply({ type: 'arrangement/play', fromBeat: 0.5 })
    const passFrames = Math.ceil(1 / step) // a pass is 29691 frames, at most
    let rendered = 0
    let jumps = 0
    const left = new Float32Array(chunk)
    const right = new Float32Array(chunk)
    while (jumps < 10) {
      engine.render(left, right)
      rendered += chunk
      const jump = engine.lastJump()
      if (jump) {
        jumps++
        expect(jump.beat).toBeGreaterThanOrEqual(1)
        expect(jump.beat).toBeLessThan(1 + step)
      }
      expect(rendered).toBeLessThan(11 * passFrames + 2 * 4096)
    }
    // The position is where an endless timeline would be, less ten loop lengths: no sample was lost or added.
    expect(engine.status().beat).toBeCloseTo(0.5 + rendered * step - 10, 9)
  })

  it('plays into the brace from before it, loops from inside it, and plays on from after it', () => {
    const before = setup([])
    before.apply({ type: 'arrangement/setLoop', loop: { from: 2, to: 3 } })
    before.apply({ type: 'arrangement/play', fromBeat: 0 })
    render(before, 2.5 * 24000)
    expect(before.status().beat).toBeCloseTo(2.5, 6)
    render(before, 24000)
    expect(before.status().beat).toBeCloseTo(2.5, 6)

    const inside = setup([])
    inside.apply({ type: 'arrangement/setLoop', loop: { from: 2, to: 3 } })
    inside.apply({ type: 'arrangement/play', fromBeat: 2.75 })
    render(inside, 12000)
    expect(inside.status().beat).toBeCloseTo(2.25, 6)

    const after = setup([])
    after.apply({ type: 'arrangement/setLoop', loop: { from: 2, to: 3 } })
    after.apply({ type: 'arrangement/play', fromBeat: 3 })
    render(after, 24000)
    expect(after.status().beat).toBeCloseTo(4, 6)
  })

  it('releases a note held across the jump at the jump, and plays it again on the next pass', () => {
    // The note sounds from beat 1 to 4; the loop is [0, 2).
    const engine = setup([midi(0, [createNote(60, 1, 3)])])
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 0, to: 2 } })
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    const out = render(engine, 4 * 24000)
    expect(out[1.5 * 24000]).toBeCloseTo(HELD, 6)
    // After the jump, the first beat of the next pass is silent: the note was released at the jump.
    expect(out[2 * 24000 + 100]).toBe(0)
    expect(out[2.5 * 24000]).toBe(0)
    expect(out[3.5 * 24000]).toBeCloseTo(HELD, 6)
  })

  it('keeps a live note sounding across the jump', () => {
    const engine = setup([])
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 0, to: 1 } })
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    engine.apply({ type: 'track/noteOn', trackId: 'synth', note: { noteId: 'k', sourceId: 'keyboard', channel: 0 }, pitch: 60, velocity: 1 })
    const out = render(engine, 2 * 24000)
    expect(out[1.5 * 24000]).toBeCloseTo(HELD, 6)
  })

  it('never plays a region that starts at the loop end before the jump', () => {
    // At 97 bpm the last block before the jump ends past the loop's end, by part of a sample.
    const audio: ArrangementClip = { id: 'r-audio', trackId: 'audio', startBeat: 2, content: audioContent('repitch') }
    const engine = setup([midi(2, [createNote(60, 0, 1)]), audio], 97, new Float32Array(4 * 24000).fill(AMPLITUDE))
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 0, to: 2 } })
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    const out = render(engine, 5 * 30000, 97)
    expect(out.every((value) => value === 0)).toBe(true)
  })

  it('plays a note at the loop start on every pass, though the jump carries the position past it', () => {
    const bpm = 97
    const engine = setup([midi(1, [createNote(60, 0, 0.5)])], bpm)
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 1, to: 2 } })
    engine.apply({ type: 'arrangement/play', fromBeat: 1 })
    const passFrames = Math.round(1 / beatsPerSample(bpm))
    const out = render(engine, 5 * passFrames)
    for (let pass = 0; pass < 5; pass++) expect(out[pass * passFrames + 1000], `pass ${pass}`).toBeCloseTo(HELD, 6)
  })

  it('restarts an unwarped audio region at the jump, in phase with the new position', () => {
    // A ramp, so the read position shows in the value: frame i of the sample is i / 1e6.
    const ramp = Float32Array.from({ length: 4 * 24000 }, (_, index) => index / 1e6)
    const region: ArrangementClip = { id: 'r-audio', trackId: 'audio', startBeat: 0, content: audioContent('off') }
    const engine = setup([region], 120, ramp)
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 1, to: 2 } })
    engine.apply({ type: 'arrangement/play', fromBeat: 1 })
    const out = render(engine, 2 * 24000)
    // Beat 1 of the region reads its frame 24000, on the first pass and again after the 5 ms tail on the second.
    const at = (frame: number) => Math.atanh(out[frame]!)
    expect(at(1000)).toBeCloseTo((24000 + 1000) / 1e6, 4)
    expect(at(24000 + 1000)).toBeCloseTo((24000 + 1000) / 1e6, 4)
  })

  it('releases notes and restarts audio on a seek while the arrangement plays', () => {
    const ramp = Float32Array.from({ length: 4 * 24000 }, (_, index) => index / 1e6)
    const audio: ArrangementClip = { id: 'r-audio', trackId: 'audio', startBeat: 0, content: audioContent('off') }
    const engine = setup([midi(0, [createNote(60, 0, 1)]), audio], 120, ramp)
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    render(engine, 12000)
    engine.apply({ type: 'arrangement/play', fromBeat: 2 })
    const out = render(engine, 12000)
    // The note (beat 0 to 1) is released and the audio reads beat 2 of the ramp: frame 48000, plus how far in.
    const audioOnly = Math.atanh(out[6000]!)
    expect(audioOnly).toBeCloseTo((48000 + 6000) / 1e6, 4)
  })

  it('is ignored by session playback', () => {
    const engine = setup([])
    engine.apply({ type: 'arrangement/setLoop', loop: { from: 0, to: 1 } })
    engine.apply({ type: 'transport/play' })
    render(engine, 2 * 24000)
    expect(engine.status().beat).toBeCloseTo(2, 6)
  })
})
