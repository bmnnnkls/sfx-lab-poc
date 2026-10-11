import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultFxGraph, createDefaultNoteGraph, createDefaultPatch, noteGraphFrom, setNodeParam } from '../patch'
import { type AudioClip, createClip, createNote } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000 // frames per beat at 120 bpm
const SAMPLE_ID = 'a'.repeat(64)

const effect = (type: string, params: Record<string, number> = {}): Patch =>
  noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'fx', type: type, params }, { id: 'out', type: 'trackOut' }], ['in.out>fx.in', 'fx.out>out.in'])

const render = (engine: Engine, frames: number): Float32Array => {
  const left = new Float32Array(frames)
  engine.render(left, new Float32Array(frames))
  return left
}

const rms = (buffer: Float32Array) => Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)

const audioClip = (): AudioClip => ({
  id: 'clip', name: 'clip', sampleId: SAMPLE_ID, lengthBeats: 4, loop: true, warp: 'repitch',
  gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0,
})

/** A quiet 2 kHz tone, 4 beats long, so it plays at exactly 1x in re-pitch mode. */
const audioEngine = (fx: Patch) => {
  const engine = new Engine(SAMPLE_RATE)
  const data = Float32Array.from({ length: 4 * BEAT }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 2000 * i) / SAMPLE_RATE))
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data } })
  engine.apply({ type: 'track/add', kind: 'audio', trackId: 'a', fx, clips: [audioClip()], volume: 1 })
  engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' })
  return engine
}

describe('insert graph of an audio track', () => {
  it('leaves the sound alone by default', () => {
    const plain = render(audioEngine(createDefaultFxGraph()), 4800)
    expect(rms(plain)).toBeGreaterThan(0.05)
  })

  it('a gain in the graph scales the sound, before the fader', () => {
    const plain = rms(render(audioEngine(createDefaultFxGraph()), 4800))
    const half = rms(render(audioEngine(effect('gain', { gain: 0.5 })), 4800))
    expect(half / plain).toBeCloseTo(0.5, 2)
  })

  it('a low-pass filter takes the highs out', () => {
    const plain = rms(render(audioEngine(createDefaultFxGraph()), 4800))
    const dull = rms(render(audioEngine(effect('filter', { cutoff: 200 })), 4800))
    expect(dull).toBeLessThan(plain * 0.1)
  })

  it('setFx swaps the graph while playing', () => {
    const engine = audioEngine(createDefaultFxGraph())
    render(engine, 4800)
    engine.apply({ type: 'track/setFx', trackId: 'a', graph: effect('gain', { gain: 0 }) })
    expect(rms(render(engine, 4800))).toBe(0)
  })
})

describe('insert graph of an instrument track', () => {
  /** The default patch without its own delay, so any tail comes from the insert graph. */
  const dryPatch = (): Patch => {
    const patch = createDefaultPatch()
    return setNodeParam(patch, patch.nodes.find((n) => n.type === 'delay')!.id, 'mix', 0)
  }

  const instrument = (fx: Patch) => {
    const engine = new Engine(SAMPLE_RATE)
    const clip = createClip('c', 4, [createNote(69, 0, 0.5, 1)])
    engine.apply({ type: 'transport/setTempo', bpm: 120 })
    engine.apply({
      type: 'track/add', kind: 'instrument', trackId: 't', fx, clips: [clip], volume: 1, voices: 4,
      patch: dryPatch(),
      noteGraph: createDefaultNoteGraph(),
    })
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    return engine
  }

  it('a delay in the graph rings on after the note has ended', () => {
    const echo = effect('delay', { time: 0.25, feedback: 0.6, mix: 0.8 })
    const dry = instrument(createDefaultFxGraph())
    const wet = instrument(echo)
    // The note lasts half a beat (12000 frames) plus its release; look at the stretch well after that.
    const after = (engine: Engine) => rms(render(engine, 60000).subarray(30000))
    expect(after(dry)).toBeLessThan(0.005)
    expect(after(wet)).toBeGreaterThan(0.02)
  })

  it('a knob turn on a node in the graph does not cut its tail', () => {
    const graph = effect('delay', { time: 0.25, feedback: 0.6, mix: 0.8 })
    const engine = instrument(graph)
    render(engine, 20000)
    const delayId = graph.nodes.find((n) => n.type === 'delay')!.id
    engine.apply({ type: 'track/setParam', trackId: 't', nodeId: delayId, paramId: 'feedback', value: 0.7 })
    expect(rms(render(engine, 12000))).toBeGreaterThan(0.02)
  })
})
