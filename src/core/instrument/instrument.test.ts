import { describe, expect, it } from 'vitest'
import { type Patch, addNode, connect, createNode, setNodeParam } from '../patch'
import { Instrument } from './instrument'

const SAMPLE_RATE = 48000
const empty: Patch = { nodes: [], connections: [] }

/** note -> sine oscillator -> [envelope VCA] -> [delay] -> output, built from the pieces we need. */
const buildPatch = ({ envelope = true, delay = false } = {}) => {
  const note = createNode('note', 0, 0)
  const osc = createNode('oscillator', 0, 0)
  const gain = createNode('gain', 0, 0)
  const env = createNode('envelope', 0, 0)
  const echo = createNode('delay', 0, 0)
  const out = createNode('output', 0, 0)
  let patch = [note, osc, gain, env, echo, out].reduce(addNode, empty)

  patch = setNodeParam(patch, osc.id, 'waveform', 0)
  patch = setNodeParam(patch, env.id, 'attack', 0.001)
  patch = setNodeParam(patch, env.id, 'sustain', 1)
  patch = setNodeParam(patch, env.id, 'release', 0.05)
  patch = setNodeParam(patch, echo.id, 'time', 0.1)
  patch = setNodeParam(patch, echo.id, 'mix', 1)
  patch = setNodeParam(patch, echo.id, 'feedback', 0.5)

  const wire = (from: typeof note, fromPort: string, to: typeof note, toPort: string) => {
    patch = connect(patch, { node: from.id, port: fromPort }, { node: to.id, port: toPort })
  }
  wire(note, 'frequency', osc, 'freq')
  wire(osc, 'out', gain, 'in')
  if (envelope) {
    wire(note, 'gate', env, 'gate')
    wire(env, 'out', gain, 'cv')
  }
  const last = delay ? echo : out
  if (delay) wire(gain, 'out', echo, 'in')
  wire(gain, 'out', last, 'in')
  if (delay) wire(echo, 'out', out, 'in')
  return patch
}

const render = (instrument: Instrument, seconds: number): Float32Array => {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let offset = 0; offset < out.length; offset += 128) {
    const frames = Math.min(128, out.length - offset)
    out.set(instrument.render(frames).subarray(0, frames), offset)
  }
  return out
}

/** Energy of `frequency` in `signal` (Goertzel), normalised to a sine of amplitude 1 -> ~0.25. */
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

const rms = (signal: Float32Array) => Math.sqrt(signal.reduce((sum, v) => sum + v * v, 0) / signal.length)

describe('polyphonic Instrument', () => {
  it('plays every note of a chord at once', () => {
    const instrument = new Instrument(buildPatch(), SAMPLE_RATE, 8)
    for (const pitch of [60, 64, 67]) instrument.noteOn(pitch)
    const signal = render(instrument, 0.25)

    const frequencies = [261.63, 329.63, 392.0]
    const unplayed = energyAt(signal, 440)
    for (const frequency of frequencies) {
      expect(energyAt(signal, frequency)).toBeGreaterThan(unplayed * 50)
    }
    expect(instrument.activeVoiceCount).toBe(3)
  })

  it('with a single voice only the newest note sounds', () => {
    const instrument = new Instrument(buildPatch(), SAMPLE_RATE, 1)
    for (const pitch of [60, 64, 67]) instrument.noteOn(pitch)
    const signal = render(instrument, 0.25)

    expect(instrument.activeVoiceCount).toBe(1)
    expect(energyAt(signal, 392.0)).toBeGreaterThan(energyAt(signal, 261.63) * 50)
  })

  it('steals the oldest voice when more notes arrive than voices exist', () => {
    const instrument = new Instrument(buildPatch(), SAMPLE_RATE, 2)
    for (const pitch of [60, 64, 67]) instrument.noteOn(pitch)
    const signal = render(instrument, 0.25)

    expect(instrument.activeVoiceCount).toBe(2)
    expect(energyAt(signal, 261.63)).toBeLessThan(energyAt(signal, 329.63) / 50) // 60 was stolen
    expect(energyAt(signal, 392.0)).toBeGreaterThan(energyAt(signal, 440) * 50)
  })

  it('releases only the voice for the note that ended, then frees it once silent', () => {
    const instrument = new Instrument(buildPatch(), SAMPLE_RATE, 8)
    instrument.noteOn(60)
    instrument.noteOn(64)
    render(instrument, 0.1)

    instrument.noteOff(60)
    const after = render(instrument, 0.5)

    expect(instrument.activeVoiceCount).toBe(1)
    const settled = after.subarray(12000)
    expect(energyAt(settled, 329.63)).toBeGreaterThan(energyAt(settled, 261.63) * 50)
  })

  it('keeps shared effects ringing after the voices that fed them are gone', () => {
    const instrument = new Instrument(buildPatch({ delay: true }), SAMPLE_RATE, 8)
    instrument.noteOn(69)
    render(instrument, 0.1)
    instrument.noteOff(69)
    render(instrument, 0.2) // voice envelope has released and the voice is freed
    expect(instrument.activeVoiceCount).toBe(0)

    // The delay (100 ms, feedback 0.5) is still repeating the note.
    const tail = render(instrument, 0.1)
    expect(rms(tail)).toBeGreaterThan(1e-3)
    const later = render(instrument, 2)
    expect(rms(later.subarray(later.length - 4800))).toBeLessThan(1e-3)
  })

  it('mixes voices into one shared effect rather than one echo per voice', () => {
    const one = new Instrument(buildPatch({ delay: true }), SAMPLE_RATE, 8)
    one.noteOn(60)
    const solo = render(one, 0.3)

    const chord = new Instrument(buildPatch({ delay: true }), SAMPLE_RATE, 8)
    chord.noteOn(60)
    chord.noteOn(60)
    const doubled = render(chord, 0.3)

    // Two identical voices summed before the (linear) delay = exactly twice the signal.
    expect(rms(doubled)).toBeCloseTo(rms(solo) * 2, 3)
  })

  it('frees a voice that never goes quiet after its safety timeout', () => {
    const instrument = new Instrument(buildPatch({ envelope: false }), SAMPLE_RATE, 4)
    instrument.noteOn(60)
    instrument.noteOff(60)
    render(instrument, 9)
    expect(instrument.activeVoiceCount).toBe(1) // a drone with no envelope keeps sounding...
    render(instrument, 2)
    expect(instrument.activeVoiceCount).toBe(0) // ...until the safety timeout
  })

  it('applies voice-node parameter changes to every voice', () => {
    const patch = buildPatch()
    const gain = patch.nodes.find((n) => n.type === 'gain')!
    const instrument = new Instrument(patch, SAMPLE_RATE, 4)
    instrument.noteOn(60)
    instrument.noteOn(64)
    const loud = rms(render(instrument, 0.2))

    instrument.setParam(gain.id, 'gain', 0.1)
    const quiet = rms(render(instrument, 0.2))

    expect(quiet).toBeLessThan(loud * 0.2)
  })

  it('applies shared-node parameter changes too', () => {
    const patch = buildPatch({ delay: true })
    const echo = patch.nodes.find((n) => n.type === 'delay')!
    const instrument = new Instrument(patch, SAMPLE_RATE, 4)
    instrument.noteOn(60)

    // Fully wet: nothing is audible until the 100 ms echo arrives.
    expect(rms(render(instrument, 0.05))).toBeLessThan(1e-6)

    instrument.setParam(echo.id, 'mix', 0)
    expect(rms(render(instrument, 0.05))).toBeGreaterThan(0.05)
  })
})
