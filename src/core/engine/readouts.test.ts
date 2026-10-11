import { describe, expect, it } from 'vitest'
import { createDefaultFxGraph, createDefaultNoteGraph, noteGraphFrom } from '../patch'
import { createClip, createNote } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000

const render = (engine: Engine, frames = 512) => engine.render(new Float32Array(frames), new Float32Array(frames))

/** An instrument track whose patch is a control (value 42) into a number display, and whose clip plays A4 for a beat. */
const withPatch = (patch: ReturnType<typeof noteGraphFrom>, fx = createDefaultFxGraph()) => {
  const engine = new Engine(SAMPLE_RATE)
  const clip = createClip('c', 4, [createNote(69, 0, 2, 1)])
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'track/add', kind: 'instrument', trackId: 't', patch, noteGraph: createDefaultNoteGraph(), fx, clips: [clip], volume: 1, voices: 4 })
  return { engine, clip }
}

describe('indicator readouts in the engine status', () => {
  it('a control into a display reads exactly, without any note sounding (the global stage runs every block)', () => {
    const { engine } = withPatch(noteGraphFrom([{ id: 'k', type: 'control', params: { value: 42, max: 100 } }, { id: 'd', type: 'display' }], ['k.out>d.in']))
    render(engine)
    expect(engine.status().readouts).toEqual({ t: { d: 42 } })
  })

  it('follows the control as it is turned', () => {
    const { engine } = withPatch(noteGraphFrom([{ id: 'k', type: 'control', params: { value: 1, max: 100 } }, { id: 'd', type: 'display' }], ['k.out>d.in']))
    render(engine)
    engine.apply({ type: 'track/setParam', trackId: 't', nodeId: 'k', paramId: 'value', value: 7 })
    render(engine)
    expect(engine.status().readouts.t?.d).toBe(7)
  })

  it('an indicator in the voices shows its voice only while one sounds, and is absent otherwise', () => {
    const patch = noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'led', type: 'led' }, { id: 'd', type: 'display' }], ['n.frequency>d.in', 'n.gate>led.in'])
    const { engine, clip } = withPatch(patch)
    render(engine)
    expect(engine.status().readouts).toEqual({})
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    render(engine, 2048)
    const shown = engine.status().readouts.t
    expect(shown?.d).toBeCloseTo(440, 1)
    expect(shown?.led).toBe(1)
  })

  it('an indicator in the insert graph is reported too, next to the patch\'s', () => {
    const fx = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'k', type: 'control', params: { value: 3, max: 10 } }, { id: 'b', type: 'bar' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in', 'k.out>b.in'])
    const { engine } = withPatch(noteGraphFrom([{ id: 'k2', type: 'control', params: { value: 5, max: 10 } }, { id: 'd', type: 'display' }], ['k2.out>d.in']), fx)
    render(engine)
    expect(engine.status().readouts.t).toEqual({ d: 5, b: 3 })
  })

  it('the master bus reports under `master`, and tracks without indicators are left out', () => {
    const { engine } = withPatch(noteGraphFrom([{ id: 'g', type: 'gain' }], []))
    engine.apply({
      type: 'master/setFx',
      graph: noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'k', type: 'control', params: { value: 2, max: 10 } }, { id: 'b', type: 'bar' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in', 'k.out>b.in']),
    })
    render(engine)
    expect(engine.status().readouts).toEqual({ master: { b: 2 } })
  })

  it('an indicator with nothing wired reads 0, and one fed NaN-free values never reports NaN', () => {
    const { engine } = withPatch(noteGraphFrom([{ id: 'd', type: 'display' }, { id: 'k', type: 'control', params: { value: 5, min: 0, max: 10 } }, { id: 'led', type: 'led' }], []))
    render(engine)
    expect(engine.status().readouts.t).toEqual({ d: 0, led: 0 })
  })

  it('does not change the sound: a patch with an indicator renders like one without', () => {
    const plain = noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'o', type: 'oscillator' }, { id: 'out', type: 'output' }], ['n.frequency>o.freq', 'o.out>out.in'])
    const watched = noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'o', type: 'oscillator' }, { id: 'out', type: 'output' }, { id: 'd', type: 'display' }], ['n.frequency>o.freq', 'o.out>out.in', 'o.out>d.in'])
    const play = (patch: ReturnType<typeof noteGraphFrom>) => {
      const { engine, clip } = withPatch(patch)
      engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
      const left = new Float32Array(8192)
      engine.render(left, new Float32Array(8192))
      return left
    }
    expect(play(watched)).toEqual(play(plain))
  })
})
