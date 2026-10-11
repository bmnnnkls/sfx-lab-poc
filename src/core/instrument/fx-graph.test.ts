import { describe, expect, it } from 'vitest'
import { createDefaultFxGraph, flattenPatch, noteGraphFrom } from '../patch'
import { createDemoProject, groupNodesAsModule } from '../project'
import { SampleBank } from '../sample'
import { FxGraph } from './fx-graph'

const SAMPLE_RATE = 48000
const FRAMES = 128

const sine = (frequency: number, blocks = 40) =>
  Float32Array.from({ length: blocks * FRAMES }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

/** Runs a signal through a graph block by block and returns everything that came out. */
const run = (graph: FxGraph, input: Float32Array): Float32Array => {
  const out = new Float32Array(input.length)
  for (let at = 0; at < input.length; at += FRAMES) {
    out.set(graph.process(input.subarray(at, at + FRAMES), FRAMES).subarray(0, FRAMES), at)
  }
  return out
}

const rms = (buffer: Float32Array) => Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)

const through = (...middle: Array<{ id: string; type: string; params?: Record<string, number> }>) => {
  const ids = ['in', ...middle.map((node) => node.id), 'out']
  return noteGraphFrom(
    [{ id: 'in', type: 'trackIn' }, ...middle, { id: 'out', type: 'trackOut' }],
    ids.slice(1).map((id, index) => `${ids[index]}.out>${id}.in`),
  )
}

const fx = (patch: ReturnType<typeof through>) => new FxGraph(patch, SAMPLE_RATE, new SampleBank())

describe('FxGraph', () => {
  it('passes sound through the default graph bit for bit', () => {
    const input = sine(440)
    expect(run(fx(createDefaultFxGraph()), input)).toEqual(input)
  })

  it('is silent when nothing is wired to Track out', () => {
    const patch = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], [])
    expect(rms(run(fx(patch), sine(440)))).toBe(0)
  })

  it('processes the sound with what is wired in between', () => {
    const lowpass = through({ id: 'f', type: 'filter', params: { cutoff: 300 } })
    const input = sine(8000)
    expect(rms(run(fx(lowpass), input))).toBeLessThan(rms(input) * 0.05)
  })

  it('keeps a delay ringing after the input stops', () => {
    const delay = through({ id: 'd', type: 'delay', params: { time: 0.01, feedback: 0.5, mix: 1 } })
    const graph = fx(delay)
    const burst = new Float32Array(10 * FRAMES)
    burst.fill(0.5, 0, FRAMES)
    const out = run(graph, burst)
    expect(rms(out.subarray(2 * FRAMES))).toBeGreaterThan(0.01)
  })

  it('lets a knob change keep the tail', () => {
    const graph = fx(through({ id: 'd', type: 'delay', params: { time: 0.01, feedback: 0.5, mix: 1 } }))
    const burst = new Float32Array(FRAMES).fill(0.5)
    const quiet = new Float32Array(8 * FRAMES) // the first echo comes 480 samples after the burst
    run(graph, burst)
    graph.setParam('d', 'mix', 0.9)
    expect(rms(run(graph, quiet))).toBeGreaterThan(0)
  })

  it('ignores a parameter for a node it does not have', () => {
    expect(() => fx(createDefaultFxGraph()).setParam('nope', 'x', 1)).not.toThrow()
  })

  it('runs a module placed in the graph', () => {
    const project = createDemoProject()
    const track = project.tracks[0]!
    const lowpass = through({ id: 'f', type: 'filter', params: { cutoff: 300 } })
    const withFx = { ...project, tracks: [{ ...track, fx: lowpass }, ...project.tracks.slice(1)] }
    const grouped = groupNodesAsModule(withFx, { trackId: track.id, graph: 'fx' }, ['f'], 'Dull')
    const patch = grouped.tracks[0]!.fx
    expect(patch.nodes.some((node) => node.type === 'module')).toBe(true)

    const input = sine(8000)
    const out = run(fx(flattenPatch(patch, grouped.modules) as ReturnType<typeof through>), input)
    expect(rms(out)).toBeLessThan(rms(input) * 0.05)
  })
})
