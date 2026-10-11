import { describe, expect, it } from 'vitest'
import { liveSpec, nodeDefinitions, paramOfPort, paramPortId, paramSockets, requireNodeDefinition } from '.'

describe('parameter sockets', () => {
  it('a socket is named param:<id> and the name round-trips', () => {
    expect(paramPortId('cutoff')).toBe('param:cutoff')
    expect(paramOfPort('param:cutoff')).toBe('cutoff')
    expect(paramOfPort('cutoff')).toBeUndefined()
    expect(paramOfPort('in')).toBeUndefined()
  })

  it('every numeric parameter gets one control input, in parameter order, and enums get none', () => {
    const filter = requireNodeDefinition('filter')
    const sockets = paramSockets(filter)
    const numeric = filter.params.filter((spec) => spec.options === undefined)
    expect(sockets.map((port) => port.param)).toEqual(numeric.map((spec) => spec.id))
    expect(sockets.every((port) => port.kind === 'control' && port.id === `param:${port.param}`)).toBe(true)
    expect(filter.params.some((spec) => spec.options !== undefined)).toBe(true)
    expect(sockets.some((port) => filter.params.find((spec) => spec.id === port.param)?.options)).toBe(false)
  })

  it('no socket shares an id with a port of its node, and none is generated for the control nodes', () => {
    for (const definition of nodeDefinitions) {
      const own = new Set(definition.inputs.map((port) => port.id))
      for (const socket of paramSockets(definition)) expect(own.has(socket.id), `${definition.type} ${socket.id}`).toBe(false)
    }
    for (const type of ['control', 'xyPad', 'selector']) expect(paramSockets(requireNodeDefinition(type))).toEqual([])
  })

  it('a switch has sockets for the two values it outputs, not for its state or its pulse-making mode', () => {
    expect(paramSockets(requireNodeDefinition('switch')).map((socket) => socket.param)).toEqual(['offValue', 'onValue', 'pulse'])
  })

  it('a socket carries the parameter label, so a card and a tooltip can name it', () => {
    const gain = paramSockets(requireNodeDefinition('gain'))
    expect(gain).toEqual([
      {
        id: 'param:gain',
        label: 'Gain',
        kind: 'control',
        param: 'gain',
        description: requireNodeDefinition('gain').params[0]!.description,
        range: { min: 0, max: 2, default: 1 },
      },
    ])
  })
})

describe('liveSpec', () => {
  const value = requireNodeDefinition('control').params.find((spec) => spec.id === 'value')!

  it('takes a control value range from the node own min, max and step', () => {
    const live = liveSpec(value, { min: 20, max: 20000, step: 5 })
    expect([live.min, live.max, live.step]).toEqual([20, 20000, 5])
    expect(liveSpec(value, { min: 20000, max: 20, step: 0 })).toMatchObject({ min: 20, max: 20000, step: undefined })
  })

  it('is the spec itself when it has no range, or the node does not have the parameters', () => {
    const cutoff = requireNodeDefinition('filter').params.find((spec) => spec.id === 'cutoff')!
    expect(liveSpec(cutoff, { min: 1, max: 2 })).toBe(cutoff)
    expect(liveSpec(value, {})).toBe(value)
    expect(liveSpec(value, { min: Number.NaN, max: 1 })).toBe(value)
  })
})
