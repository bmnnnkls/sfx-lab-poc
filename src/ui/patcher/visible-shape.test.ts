import { describe, expect, it } from 'vitest'
import { type Patch, addNode, connect, createNode, describeNode } from '@core'
import { drivenParams, visibleShape } from './visible-shape'

const setup = () => {
  const control = createNode('control', 0, 0)
  const filter = createNode('filter', 0, 0)
  let patch: Patch = [control, filter].reduce(addNode, { nodes: [], connections: [] } as Patch)
  patch = connect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:resonance' })
  return { control, filter, patch, shape: describeNode(filter)! }
}

describe('visibleShape', () => {
  it('hides unwired sockets, keeps wired ones and every ordinary port, in order', () => {
    const { filter, patch, shape } = setup()
    const shown = visibleShape(shape, filter.id, patch, false)
    expect(shown.inputs.map((port) => port.id)).toEqual(['in', 'cutoff', 'param:resonance'])
    expect(shown.outputs).toBe(shape.outputs)
  })

  it('shows every socket when asked, as the same object', () => {
    const { filter, patch, shape } = setup()
    expect(visibleShape(shape, filter.id, patch, true)).toBe(shape)
  })

  it('is the node shape itself for a node with no sockets to hide', () => {
    const { control, patch } = setup()
    const shape = describeNode(control)!
    expect(visibleShape(shape, control.id, patch, false)).toBe(shape)
  })

  it('lists the driven parameters with what drives them', () => {
    const { filter, control, patch, shape } = setup()
    const titleOf = (id: string) => (id === control.id ? 'Control' : 'Other')
    expect([...drivenParams(filter.id, shape, patch, titleOf)]).toEqual([['resonance', 'Control']])
    expect(drivenParams(control.id, describeNode(control)!, patch, titleOf).size).toBe(0)
  })

  it('names each driver once, however many wires it has', () => {
    const { filter, control, patch, shape } = setup()
    const twice = connect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:cutoff' })
    expect([...drivenParams(filter.id, shape, twice, () => 'Control')].map(([, from]) => from)).toEqual(['Control', 'Control'])
  })
})
