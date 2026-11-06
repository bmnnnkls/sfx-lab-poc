import { describe, expect, it } from 'vitest'
import { createTrackExpression } from '../midi'
import { type Patch, type PatchNode, addNode, connect, createNode, setNodeParam } from '../patch'
import { SampleBank } from '../sample'
import { midiToFrequency } from '../shared'
import { Instrument } from './instrument'

const SAMPLE_RATE = 48000
const empty: Patch = { nodes: [], connections: [] }

/** note -> sine -> output, plus displays reading the Note node's Pressure and Bend and a MIDI CC node. */
const buildPatch = (cc = 1) => {
  const note = createNode('note', 0, 0)
  const osc = createNode('oscillator', 0, 0)
  const out = createNode('output', 0, 0)
  const midiCC = createNode('midiCC', 0, 0)
  const pressure = createNode('display', 0, 0)
  const bend = createNode('display', 0, 0)
  const ccShown = createNode('display', 0, 0)
  let patch = [note, osc, out, midiCC, pressure, bend, ccShown].reduce(addNode, empty)
  patch = setNodeParam(patch, osc.id, 'waveform', 0)
  patch = setNodeParam(patch, midiCC.id, 'cc', cc)
  const wire = (from: PatchNode, fromPort: string, to: PatchNode, toPort: string) => {
    patch = connect(patch, { node: from.id, port: fromPort }, { node: to.id, port: toPort })
  }
  wire(note, 'frequency', osc, 'freq')
  wire(osc, 'out', out, 'in')
  wire(note, 'pressure', pressure, 'in')
  wire(note, 'bend', bend, 'in')
  wire(midiCC, 'value', ccShown, 'in')
  return { patch, ids: { pressure: pressure.id, bend: bend.id, cc: ccShown.id } }
}

const render = (instrument: Instrument, seconds: number): Float32Array => {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let offset = 0; offset < out.length; offset += 128) {
    const frames = Math.min(128, out.length - offset)
    out.set(instrument.render(frames).subarray(0, frames), offset)
  }
  return out
}

/** Energy of `frequency` in `signal` (Goertzel). */
const energyAt = (signal: Float32Array, frequency: number): number => {
  const w = (2 * Math.PI * frequency) / SAMPLE_RATE
  let re = 0
  let im = 0
  signal.forEach((sample, n) => {
    re += sample * Math.cos(w * n)
    im -= sample * Math.sin(w * n)
  })
  return (re * re + im * im) / (signal.length * signal.length)
}

describe('an instrument with track expression', () => {
  it('bends a held note by the wheel and the bend range, and back', () => {
    const expression = createTrackExpression(2)
    const instrument = new Instrument(buildPatch().patch, SAMPLE_RATE, 4, new SampleBank(), undefined, expression)
    instrument.noteOn(69)
    render(instrument, 0.01)
    expression.bend = 1
    const bent = render(instrument, 0.2)
    expect(energyAt(bent, midiToFrequency(71))).toBeGreaterThan(energyAt(bent, 440) * 50)
    expression.bend = 0
    const back = render(instrument, 0.2)
    expect(energyAt(back, 440)).toBeGreaterThan(energyAt(back, midiToFrequency(71)) * 50)
  })

  it('follows the range: a full bend at 12 is an octave, at 0 nothing', () => {
    for (const [range, expected] of [[12, 880], [0, 440]] as const) {
      const expression = createTrackExpression(range)
      expression.bend = 1
      const instrument = new Instrument(buildPatch().patch, SAMPLE_RATE, 4, new SampleBank(), undefined, expression)
      instrument.noteOn(69)
      const signal = render(instrument, 0.2)
      expect(energyAt(signal, expected)).toBeGreaterThan(energyAt(signal, expected === 880 ? 440 : 880) * 50)
    }
  })

  it('starts a note bent when the wheel is already moved', () => {
    const expression = createTrackExpression(2)
    expression.bend = -1
    const instrument = new Instrument(buildPatch().patch, SAMPLE_RATE, 4, new SampleBank(), undefined, expression)
    instrument.noteOn(69)
    const signal = render(instrument, 0.2)
    expect(energyAt(signal, midiToFrequency(67))).toBeGreaterThan(energyAt(signal, 440) * 50)
  })

  it('gives the Note node Pressure and Bend, and the MIDI CC node its CC', () => {
    const { patch, ids } = buildPatch(74)
    const expression = createTrackExpression(2)
    const instrument = new Instrument(patch, SAMPLE_RATE, 4, new SampleBank(), undefined, expression)
    instrument.noteOn(60)
    expression.pressure = 0.5
    expression.bend = -0.25
    expression.cc[74] = 0.75
    expression.cc[1] = 0.1
    render(instrument, 0.01)
    const shown = instrument.readouts()
    expect(shown[ids.pressure]).toBeCloseTo(0.5, 6)
    expect(shown[ids.bend]).toBeCloseTo(-0.25, 6)
    expect(shown[ids.cc]).toBeCloseTo(0.75, 6)
  })

  it('reads 0 from a MIDI CC node in an instrument with no expression of its own, until it moves', () => {
    const { patch, ids } = buildPatch(1)
    const instrument = new Instrument(patch, SAMPLE_RATE, 4, new SampleBank())
    render(instrument, 0.01)
    expect(instrument.readouts()[ids.cc]).toBe(0)
    instrument.expression.cc[1] = 1
    render(instrument, 0.01)
    expect(instrument.readouts()[ids.cc]).toBe(1)
  })
})
