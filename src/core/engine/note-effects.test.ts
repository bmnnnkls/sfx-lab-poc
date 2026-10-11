import { describe, expect, it } from 'vitest'
import { createNoteEffect } from '../notefx'
import { createDefaultPatch, setNodeParam } from '../patch'
import { createClip, createNote } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000 // 120 bpm

/** A sine-wave version of the default instrument, so a note's pitch can be read off the spectrum. */
const sinePatch = () => {
  const patch = createDefaultPatch()
  const osc = patch.nodes.find((n) => n.type === 'oscillator')!
  const filter = patch.nodes.find((n) => n.type === 'filter')!
  const delay = patch.nodes.find((n) => n.type === 'delay')!
  return setNodeParam(setNodeParam(setNodeParam(patch, osc.id, 'waveform', 0), filter.id, 'cutoff', 20000), delay.id, 'mix', 0)
}

const effect = (type: string, params: Record<string, number> = {}) => ({ ...createNoteEffect(type)!, params: { ...createNoteEffect(type)!.params, ...params } })

const play = (notes: ReturnType<typeof createNote>[], effects: ReturnType<typeof effect>[], beats: number, lengthBeats = 4) => {
  const engine = new Engine(SAMPLE_RATE)
  const clip = createClip('c', lengthBeats, notes)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'track/add', kind: 'instrument', trackId: 't', patch: sinePatch(), noteEffects: effects, clips: [clip], volume: 1, voices: 8 })
  engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
  const out = new Float32Array(beats * BEAT)
  for (let offset = 0; offset < out.length; offset += 1000) {
    const frames = Math.min(1000, out.length - offset)
    const left = new Float32Array(frames)
    engine.render(left, new Float32Array(frames))
    out.set(left, offset)
  }
  return { engine, out, clip }
}

/** Energy at `frequency` over a stretch of the signal (Goertzel). */
const energyAt = (signal: Float32Array, from: number, to: number, frequency: number): number => {
  const w = (2 * Math.PI * frequency) / SAMPLE_RATE
  let re = 0
  let im = 0
  for (let n = from; n < to; n++) {
    re += signal[n]! * Math.cos(w * (n - from))
    im -= signal[n]! * Math.sin(w * (n - from))
  }
  return (re * re + im * im) / ((to - from) * (to - from))
}
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12)

/** Which of the candidate pitches dominates the signal in a window. */
const loudest = (signal: Float32Array, from: number, to: number, pitches: number[]) =>
  pitches.reduce((best, pitch) => (energyAt(signal, from, to, hz(pitch)) > energyAt(signal, from, to, hz(best)) ? pitch : best))

describe('MIDI effects in the engine', () => {
  const held = [createNote(57, 0, 4, 1), createNote(61, 0, 4, 1), createNote(64, 0, 4, 1)] // A major chord

  it('without effects the whole chord sounds at once', () => {
    const { out } = play(held, [], 1)
    const window = [Math.round(0.4 * BEAT), Math.round(0.9 * BEAT)] as const
    for (const pitch of [57, 61, 64]) expect(energyAt(out, ...window, hz(pitch))).toBeGreaterThan(1e-4)
  })

  it('transpose moves the pitch an octave up', () => {
    const { out } = play([createNote(57, 0, 2, 1)], [effect('transpose', { semitones: 12 })], 1)
    expect(loudest(out, 4000, 20000, [57, 69])).toBe(69)
  })

  it('an arpeggiator plays the chord one note at a time, in time', () => {
    const { out } = play(held, [effect('arpeggiator', { rate: 1, pattern: 0, gate: 0.8 })], 2)
    const step = BEAT / 2
    const heard = [0, 1, 2, 3].map((index) => loudest(out, index * step + 3000, index * step + 9000, [57, 61, 64]))
    expect(heard).toEqual([57, 61, 64, 57])
    // One at a time: while the first step sounds, the other chord notes are absent.
    const first = [3000, 9000] as const
    expect(energyAt(out, ...first, hz(61))).toBeLessThan(energyAt(out, ...first, hz(57)) / 20)
  })

  it('removing the effect while it plays leaves nothing hanging', () => {
    const { engine, out } = play(held, [effect('arpeggiator', { rate: 3, gate: 1 })], 1)
    expect(Math.max(...out.map(Math.abs))).toBeGreaterThan(0.01)
    engine.apply({ type: 'track/setNoteEffects', trackId: 't', effects: [] })
    engine.apply({ type: 'track/stop', trackId: 't' })
    const after = new Float32Array(BEAT * 6)
    for (let offset = 0; offset < after.length; offset += 1000) engine.render(after.subarray(offset, offset + 1000), new Float32Array(1000))
    // After the stop at the next bar and the release tail, the output is silent.
    expect(Math.max(...after.subarray(after.length - 4000).map(Math.abs))).toBeLessThan(1e-4)
  })

  it('stopping the transport silences an arpeggio', () => {
    const { engine } = play(held, [effect('arpeggiator', { rate: 3, gate: 1 })], 1)
    engine.apply({ type: 'transport/stop' })
    const tail = new Float32Array(40000)
    for (let offset = 0; offset < tail.length; offset += 1000) engine.render(tail.subarray(offset, offset + 1000), new Float32Array(1000))
    // The release tail (0.25 s) has died away.
    expect(Math.max(...tail.subarray(30000).map(Math.abs))).toBeLessThan(1e-4)
  })

  it('turning a knob does not restart the arpeggio', () => {
    const arp = effect('arpeggiator', { rate: 1, gate: 0.5 })
    const { engine } = play(held, [arp], 0.7)
    engine.apply({ type: 'track/setNoteEffects', trackId: 't', effects: [{ ...arp, params: { ...arp.params, gate: 0.9 } }] })
    const next = new Float32Array(BEAT)
    engine.render(next, new Float32Array(BEAT))
    // Having played the first note (A) and the start of the second (C#), it carries on with C#, then E.
    const step = BEAT / 2
    const first = loudest(next, Math.round(step - 0.7 * BEAT + step) + 3000, Math.round(step - 0.7 * BEAT + step) + 8000, [57, 61, 64])
    expect(first).toBe(64)
  })

  it('the same events are produced however the output is chunked', () => {
    const run = (chunk: number) => {
      const engine = new Engine(SAMPLE_RATE)
      const clip = createClip('c', 4, held)
      engine.apply({ type: 'transport/setTempo', bpm: 120 })
      engine.apply({ type: 'track/add', kind: 'instrument', trackId: 't', patch: sinePatch(), noteEffects: [effect('arpeggiator', { pattern: 2, rate: 1, gate: 0.5 })], clips: [clip], volume: 1, voices: 8 })
      engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
      const out = new Float32Array(BEAT * 2)
      for (let offset = 0; offset < out.length; offset += chunk) {
        const left = new Float32Array(chunk)
        engine.render(left, new Float32Array(chunk))
        out.set(left.subarray(0, Math.min(chunk, out.length - offset)), offset)
      }
      return out
    }
    // The chain gives the same events however time is cut into ranges (see the NoteChain tests). Here the
    // engine renders whole blocks either way. (An event that falls on a block edge can land one sample early
    // or late when the blocks start elsewhere, because of float rounding in the clock, so odd sizes are not compared.)
    const a = run(128)
    const b = run(1280)
    let difference = 0
    let energy = 0
    for (let i = 0; i < a.length; i++) {
      difference += (a[i]! - b[i]!) ** 2
      energy += a[i]! ** 2
    }
    expect(energy).toBeGreaterThan(0.1)
    expect(difference).toBe(0)
  })
})
