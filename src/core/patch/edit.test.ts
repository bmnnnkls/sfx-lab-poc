import { describe, expect, it } from 'vitest'
import { addNode, canConnect, connect, createDefaultPatch, createNode, removeNode, topologicalOrder } from '.'

describe('patch editing', () => {
  const empty = { nodes: [], connections: [] }

  it('connects an output port to an input port', () => {
    const osc = createNode('oscillator', 0, 0)
    const out = createNode('output', 0, 0)
    const patch = [osc, out].reduce(addNode, empty)

    const connected = connect(patch, { node: osc.id, port: 'out' }, { node: out.id, port: 'in' })
    expect(connected.connections).toHaveLength(1)
  })

  it('rejects duplicates, wrong directions, unknown ports and self-loops', () => {
    const a = createNode('gain', 0, 0)
    const b = createNode('gain', 0, 0)
    const patch = connect([a, b].reduce(addNode, empty), { node: a.id, port: 'out' }, { node: b.id, port: 'in' })

    expect(canConnect(patch, { node: a.id, port: 'out' }, { node: b.id, port: 'in' })).toBe(false)
    expect(canConnect(patch, { node: a.id, port: 'in' }, { node: b.id, port: 'out' })).toBe(false)
    expect(canConnect(patch, { node: a.id, port: 'nope' }, { node: b.id, port: 'in' })).toBe(false)
    expect(canConnect(patch, { node: a.id, port: 'out' }, { node: a.id, port: 'in' })).toBe(false)
  })

  it('refuses connections that would create a cycle', () => {
    const a = createNode('gain', 0, 0)
    const b = createNode('gain', 0, 0)
    const patch = connect([a, b].reduce(addNode, empty), { node: a.id, port: 'out' }, { node: b.id, port: 'in' })

    expect(canConnect(patch, { node: b.id, port: 'out' }, { node: a.id, port: 'in' })).toBe(false)
  })

  it('removes a node together with its wires', () => {
    const patch = createDefaultPatch()
    const victim = patch.nodes.find((node) => node.type === 'filter')!
    const next = removeNode(patch, victim.id)

    expect(next.nodes).toHaveLength(patch.nodes.length - 1)
    expect(next.connections.some((c) => c.from.node === victim.id || c.to.node === victim.id)).toBe(false)
  })

  it('orders the default patch with sources before sinks', () => {
    const patch = createDefaultPatch()
    const order = topologicalOrder(patch)!
    const index = (type: string) => order.indexOf(patch.nodes.find((n) => n.type === type)!.id)

    expect(index('note')).toBeLessThan(index('oscillator'))
    expect(index('gain')).toBeLessThan(index('output'))
  })
})
