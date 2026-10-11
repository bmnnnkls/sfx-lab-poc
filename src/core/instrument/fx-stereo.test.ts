import { describe, expect, it } from 'vitest'
import { RIGHT } from '../dsp'
import { type Patch, describeNode, flattenPatch, noteGraphFrom, setNodeStereo } from '../patch'
import { createDemoProject, groupNodesAsModule, patchAt } from '../project'
import { SampleBank } from '../sample'
import { FxGraph } from './fx-graph'

const SAMPLE_RATE = 48000
const FRAMES = 128
const BLOCKS = 30

const sine = (frequency: number) =>
  Float32Array.from({ length: BLOCKS * FRAMES }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

const run = (patch: Patch, input: Float32Array) => {
  const graph = new FxGraph(patch, SAMPLE_RATE, new SampleBank())
  const left = new Float32Array(input.length)
  const right = new Float32Array(input.length)
  for (let at = 0; at < input.length; at += FRAMES) {
    const out = graph.process(input.subarray(at, at + FRAMES), FRAMES)
    left.set(out.subarray(0, FRAMES), at)
    right.set(out.subarray(RIGHT, RIGHT + FRAMES), at)
  }
  return { left, right }
}

type Spec = { id: string; type: string; params?: Record<string, number>; stereo?: boolean }
const graph = (nodes: Spec[], wires: string[]): Patch => {
  const patch = noteGraphFrom(nodes, wires)
  return { ...patch, nodes: patch.nodes.map((node) => (nodes.find((n) => n.id === node.id)?.stereo ? { ...node, stereo: true } : node)) }
}

const FILTER = { cutoff: 700 }

describe('stereo in an insert graph', () => {
  const input = sine(1500)

  it('a mono signal reaching Track out is heard in both channels', () => {
    const { left, right } = run(graph([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in']), input)
    expect(left).toEqual(input)
    expect(right).toEqual(input)
  })

  it('a stereo-lifted filter equals two mono ones with the same settings', () => {
    const mono = run(graph([{ id: 'in', type: 'trackIn' }, { id: 'f', type: 'filter', params: FILTER }, { id: 'out', type: 'trackOut' }], ['in.out>f.in', 'f.out>out.in']), input)
    const lifted = run(
      graph(
        [{ id: 'in', type: 'trackIn' }, { id: 'p', type: 'pan', params: { pan: 0.5 } }, { id: 'f', type: 'filter', params: FILTER, stereo: true }, { id: 'out', type: 'trackOut' }],
        ['in.out>p.in', 'p.out>f.in', 'f.out>out.in'],
      ),
      input,
    )
    const angle = ((0.5 + 1) * Math.PI) / 4
    for (const i of [200, 1000, 2500]) {
      // The filter is linear, so filtering the panned channels is the panned filtered signal.
      expect(lifted.left[i]).toBeCloseTo(mono.left[i]! * Math.cos(angle), 4)
      expect(lifted.right[i]).toBeCloseTo(mono.left[i]! * Math.sin(angle), 4)
    }
  })

  it('a mono signal into a stereo-lifted filter comes out the same in both channels', () => {
    const { left, right } = run(graph([{ id: 'in', type: 'trackIn' }, { id: 'f', type: 'filter', params: FILTER, stereo: true }, { id: 'out', type: 'trackOut' }], ['in.out>f.in', 'f.out>out.in']), input)
    expect(left).toEqual(right)
    expect(left.some((v) => v !== 0)).toBe(true)
  })

  it('a modulation input is shared: one LFO moves both channels together', () => {
    const wires = ['in.out>p.in', 'p.out>f.in', 'l.out>f.cutoff', 'f.out>out.in']
    const patch = graph(
      [{ id: 'in', type: 'trackIn' }, { id: 'p', type: 'pan', params: { pan: 0 } }, { id: 'l', type: 'lfo' }, { id: 'f', type: 'filter', params: FILTER, stereo: true }, { id: 'out', type: 'trackOut' }],
      wires,
    )
    const { left, right } = run(patch, input)
    expect(left.some((v) => v !== 0)).toBe(true)
    expect(left).toEqual(right) // centre pan gives equal channels, and the same modulation reaches both
    expect(describeNode(patch.nodes.find((n) => n.id === 'f')!)?.inputs.map((p) => p.kind ?? 'signal')).toEqual(['stereo', 'signal'])
  })

  it('a stereo delay keeps each channel apart', () => {
    const impulse = new Float32Array(BLOCKS * FRAMES)
    impulse[0] = 1
    const patch = graph(
      [{ id: 'in', type: 'trackIn' }, { id: 'p', type: 'pan', params: { pan: -1 } }, { id: 'd', type: 'delay', params: { time: 0.01, feedback: 0, mix: 1 }, stereo: true }, { id: 'out', type: 'trackOut' }],
      ['in.out>p.in', 'p.out>d.in', 'd.out>out.in'],
    )
    const { left, right } = run(patch, impulse)
    expect(left[480]).toBeCloseTo(1, 3)
    expect(right.every((v) => Math.abs(v) < 1e-6)).toBe(true)
  })

  it('a lifted node inside a module keeps its stereo ports, through grouping and flattening', () => {
    const project = createDemoProject()
    const track = project.tracks[0]!
    const fx = graph(
      [{ id: 'in', type: 'trackIn' }, { id: 'p', type: 'pan', params: { pan: 1 } }, { id: 'f', type: 'filter', params: FILTER, stereo: true }, { id: 'out', type: 'trackOut' }],
      ['in.out>p.in', 'p.out>f.in', 'f.out>out.in'],
    )
    const grouped = groupNodesAsModule({ ...project, tracks: [{ ...track, fx }, ...project.tracks.slice(1)] }, { trackId: track.id, graph: 'fx' }, ['f'], 'Dull')
    const moduleFx = patchAt(grouped, { trackId: track.id, graph: 'fx' })!
    const use = moduleFx.nodes.find((n) => n.type === 'module')!
    expect(describeNode(use, grouped.modules)?.inputs[0]?.kind).toBe('stereo')
    expect(describeNode(use, grouped.modules)?.outputs[0]?.kind).toBe('stereo')

    const { left, right } = run(flattenPatch(moduleFx, grouped.modules), input)
    expect(left.every((v) => Math.abs(v) < 1e-6)).toBe(true) // panned hard right
    expect(right.some((v) => Math.abs(v) > 0.01)).toBe(true)
  })

  it('switching a node back to mono drops the wires that no longer fit', () => {
    const patch = graph(
      [{ id: 'in', type: 'trackIn' }, { id: 'p', type: 'pan' }, { id: 'f', type: 'filter', stereo: true }, { id: 'g', type: 'gain' }, { id: 'out', type: 'trackOut' }],
      ['in.out>p.in', 'p.out>f.in', 'f.out>out.in'],
    )
    const mono = setNodeStereo(patch, 'f', false)
    expect(mono.connections.map((c) => `${c.from.node}>${c.to.node}`)).toEqual(['in>p', 'f>out']) // pan (stereo) -> mono filter is gone
    expect(setNodeStereo(patch, 'f', true)).toBe(patch) // already stereo: same object
    expect(setNodeStereo(patch, 'p', true)).toBe(patch) // pan cannot run in stereo
  })
})
