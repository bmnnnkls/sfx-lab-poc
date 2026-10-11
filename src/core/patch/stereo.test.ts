import { describe, expect, it } from 'vitest'
import { canConnect, createDefaultFxGraph, describeNode, noteGraphFrom } from '.'

const graph = noteGraphFrom(
  [
    { id: 'in', type: 'trackIn' },
    { id: 'pan', type: 'pan' },
    { id: 'width', type: 'width' },
    { id: 'sum', type: 'monoSum' },
    { id: 'filter', type: 'filter' },
    { id: 'out', type: 'trackOut' },
    { id: 'osc', type: 'oscillator' },
  ],
  [],
)
const ref = (node: string, port: string) => ({ node, port })

describe('stereo ports', () => {
  it('a mono output may feed a stereo input (it is heard in both channels)', () => {
    expect(canConnect(graph, ref('in', 'out'), ref('width', 'in'))).toBe(true)
    expect(canConnect(graph, ref('in', 'out'), ref('out', 'in'))).toBe(true)
  })

  it('a stereo output may not feed a mono input: going back to mono is the Mono sum node', () => {
    expect(canConnect(graph, ref('pan', 'out'), ref('filter', 'in'))).toBe(false)
    expect(canConnect(graph, ref('width', 'out'), ref('filter', 'cutoff'))).toBe(false)
    expect(canConnect(graph, ref('width', 'out'), ref('sum', 'in'))).toBe(true)
    expect(canConnect(graph, ref('sum', 'out'), ref('filter', 'in'))).toBe(true)
  })

  it('stereo feeds stereo', () => {
    expect(canConnect(graph, ref('pan', 'out'), ref('width', 'in'))).toBe(true)
    expect(canConnect(graph, ref('width', 'out'), ref('out', 'in'))).toBe(true)
  })

  it('the default insert graph is a mono signal wired into the stereo Track out', () => {
    const fx = createDefaultFxGraph()
    const kinds = fx.nodes.map((node) => describeNode(node)).map((shape) => [shape?.inputs[0]?.kind, shape?.outputs[0]?.kind])
    expect(kinds).toEqual([[undefined, undefined], ['stereo', undefined]])
    expect(fx.connections).toHaveLength(1)
  })

  it('only the nodes that opt in can run in stereo, and they say so', () => {
    const capable = (type: string) => describeNode({ id: 'x', type, x: 0, y: 0, params: {} })?.stereoCapable === true
    expect(['filter', 'gain', 'delay'].every(capable)).toBe(true)
    expect(['oscillator', 'reverb', 'lfo', 'pan', 'trackOut'].some(capable)).toBe(false)
  })

  it('a node running in stereo has stereo signal ports and keeps its modulation port mono', () => {
    const shape = describeNode({ id: 'x', type: 'gain', x: 0, y: 0, params: {}, stereo: true })!
    expect(shape.inputs.map((port) => port.kind ?? 'signal')).toEqual(['stereo', 'signal'])
    expect(shape.outputs.map((port) => port.kind ?? 'signal')).toEqual(['stereo'])
  })
})
