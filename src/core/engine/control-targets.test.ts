import { describe, expect, it, vi } from 'vitest'
import { FxGraph, Instrument } from '../instrument'
import { createDefaultFxGraph, createDefaultNoteGraph, createNode, type Patch } from '../patch'
import { Engine } from './engine'

const graph: Patch = { nodes: [{ ...createNode('control', 0, 0), id: 'k', params: { value: 0.2, min: 0, max: 1 } }, { ...createNode('output', 0, 0), id: 'out' }], connections: [{ id: 'w', from: { node: 'k', port: 'out' }, to: { node: 'out', port: 'in' } }] }
const setup = () => {
  const engine = new Engine(48000)
  engine.apply({ type: 'track/add', kind: 'instrument', trackId: 't', patch: graph, noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(), clips: [], volume: 1, voices: 1 })
  return engine
}
const sound = (engine: Engine) => {
  engine.apply({ type: 'track/audition', trackId: 't', pitch: 60, velocity: 1 })
  const left = new Float32Array(128), right = new Float32Array(128)
  engine.render(left, right)
  return Math.max(...left)
}

describe('graph-scoped effective parameters', () => {
  it('dispatches only to the addressed domain; legacy commands retain their previous behavior', () => {
    const engine = setup()
    const instrument = vi.spyOn(Instrument.prototype, 'setParam')
    const fx = vi.spyOn(FxGraph.prototype, 'setParam')
    try {
      engine.apply({ type: 'track/setParam', graph: 'fx', trackId: 't', nodeId: 'k', paramId: 'value', value: 0.6 })
      expect(instrument).not.toHaveBeenCalled()
      expect(fx).toHaveBeenCalledTimes(1)
      engine.apply({ type: 'track/setParam', graph: 'patch', trackId: 't', nodeId: 'k', paramId: 'value', value: 0.8 })
      expect(instrument).toHaveBeenCalledTimes(1)
      expect(fx).toHaveBeenCalledTimes(1)
      engine.apply({ type: 'track/setParam', trackId: 't', nodeId: 'k', paramId: 'value', value: 0.4 })
      expect(instrument).toHaveBeenCalledTimes(2)
      expect(fx).toHaveBeenCalledTimes(2)
    } finally { instrument.mockRestore(); fx.mockRestore() }
  })
  it('preserves the latest effective parameter when voice-count edits rebuild an instrument', () => {
    const engine = setup()
    const base = sound(engine)
    engine.apply({ type: 'track/setParam', graph: 'patch', trackId: 't', nodeId: 'k', paramId: 'value', value: 0.8 })
    engine.apply({ type: 'transport/stop' })
    const effective = sound(engine)
    expect(effective).toBeGreaterThan(base)
    engine.apply({ type: 'track/setVoices', trackId: 't', voices: 2 })
    expect(sound(engine)).toBeCloseTo(effective, 6)
  })
})
