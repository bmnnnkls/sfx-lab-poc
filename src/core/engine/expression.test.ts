import { describe, expect, it } from 'vitest'
import type { ExpressionControl } from '../midi'
import { createDefaultFxGraph, createDefaultNoteGraph, noteGraphFrom } from '../patch'
import { midiToFrequency } from '../shared'
import { Engine } from './engine'

const SAMPLE_RATE = 48000

const render = (engine: Engine, frames = 512) => engine.render(new Float32Array(frames), new Float32Array(frames))

/** Displays for the Note node's frequency, Pressure and Bend, and for the MIDI CC node on CC 1. */
const PATCH = noteGraphFrom(
  [{ id: 'n', type: 'note' }, { id: 'cc', type: 'midiCC', params: { cc: 1 } }, { id: 'freq', type: 'display' }, { id: 'press', type: 'display' }, { id: 'bend', type: 'display' }, { id: 'mod', type: 'display' }],
  ['n.frequency>freq.in', 'n.pressure>press.in', 'n.bend>bend.in', 'cc.value>mod.in'],
)

const setup = (bendRange?: number) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({
    type: 'track/add', kind: 'instrument', trackId: 't', patch: PATCH, noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(),
    clips: [], volume: 1, voices: 4, ...(bendRange !== undefined && { bendRange }),
  })
  // A held live note, so the voice-stage displays read.
  engine.apply({ type: 'track/noteOn', trackId: 't', note: { sourceId: 'midi:keys', channel: 0, noteId: 'p1' }, pitch: 69, velocity: 1 })
  return engine
}
const express = (engine: Engine, control: ExpressionControl, value: number, sourceId = 'midi:keys', channel = 0) =>
  engine.apply({ type: 'track/expression', trackId: 't', sourceId, channel, control, value })
const shown = (engine: Engine) => {
  render(engine)
  return engine.status().readouts.t ?? {}
}

describe('track expression in the engine', () => {
  it('bends the held note by the default range and reports pressure, bend and a CC', () => {
    const engine = setup()
    express(engine, 'pitchBend', 1)
    express(engine, 'pressure', 0.5)
    express(engine, { cc: 1 }, 0.25)
    const now = shown(engine)
    expect(now.freq).toBeCloseTo(midiToFrequency(71), 2)
    expect(now.bend).toBe(1)
    expect(now.press).toBe(0.5)
    expect(now.mod).toBe(0.25)
  })

  it('takes the bend range from track/add and track/setBendRange', () => {
    const engine = setup(12)
    express(engine, 'pitchBend', -1)
    expect(shown(engine).freq).toBeCloseTo(220, 2)
    engine.apply({ type: 'track/setBendRange', trackId: 't', bendRange: 0 })
    expect(shown(engine).freq).toBeCloseTo(440, 2)
  })

  it('clamps values and ignores what is not a control', () => {
    const engine = setup()
    express(engine, 'pitchBend', 3)
    express(engine, 'pressure', -1)
    express(engine, { cc: 64 }, 1)
    express(engine, 'aftertouch' as ExpressionControl, 1)
    const now = shown(engine)
    expect(now.bend).toBe(1)
    expect(now.press).toBe(0)
  })

  it('keeps the expression across a patch edit and a voice-count change', () => {
    const engine = setup()
    express(engine, { cc: 1 }, 0.75)
    engine.apply({ type: 'track/setPatch', trackId: 't', patch: PATCH })
    engine.apply({ type: 'track/setVoices', trackId: 't', voices: 2 })
    expect(shown(engine).mod).toBe(0.75)
  })

  it('a source release puts back only what that source (and channel) set last', () => {
    const engine = setup()
    express(engine, 'pitchBend', 0.5, 'midi:keys', 0)
    express(engine, 'pressure', 0.5, 'midi:keys', 1)
    express(engine, { cc: 1 }, 0.5, 'midi:knobs', 0)
    engine.apply({ type: 'notes/releaseSource', sourceId: 'midi:keys', channel: 1 })
    engine.apply({ type: 'track/noteOn', trackId: 't', note: { sourceId: 'midi:other', channel: 0, noteId: 'p2' }, pitch: 69, velocity: 1 })
    let now = shown(engine)
    expect(now.bend).toBe(0.5)
    expect(now.press).toBe(0)
    expect(now.mod).toBe(0.5)
    engine.apply({ type: 'notes/releaseSource', sourceId: 'midi:keys' })
    now = shown(engine)
    expect(now.bend).toBe(0)
    expect(now.mod).toBe(0.5)
  })

  it('Panic and ■ put everything back at rest', () => {
    for (const command of [{ type: 'notes/panic' }, { type: 'transport/stop' }] as const) {
      const engine = setup()
      express(engine, { cc: 1 }, 0.5)
      engine.apply(command)
      expect(shown(engine).mod).toBe(0)
    }
  })
})
