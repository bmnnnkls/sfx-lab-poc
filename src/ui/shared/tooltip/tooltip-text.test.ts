import { describe, expect, it } from 'vitest'
import { describeNode, createNode, liveSpec, requireNodeDefinition } from '@core'
import { nodeTooltip, paramFacts, paramTooltip, portTooltip } from './tooltip-text'

const spec = (type: string, id: string) => requireNodeDefinition(type).params.find((candidate) => candidate.id === id)!
const port = (type: string, id: string) => describeNode(createNode(type, 0, 0))!.inputs.find((candidate) => candidate.id === id)!

describe('tooltip text', () => {
  it('a parameter shows what it does, then range, default and unit; wide ranges say logarithmic', () => {
    const lines = paramTooltip(spec('filter', 'cutoff')).split('\n')
    expect(lines[0]).toBe(spec('filter', 'cutoff').description)
    expect(lines[1]).toBe('Range 20 Hz to 20000 Hz · default 2000 Hz · logarithmic')
    expect(lines).toHaveLength(2)
  })

  it('a linear parameter is not called logarithmic', () => {
    expect(paramFacts(spec('gain', 'gain'))).toBe('Range 0 to 2 · default 1')
  })

  it('an enum lists its options and its default by name', () => {
    expect(paramFacts(spec('oscillator', 'waveform'))).toBe('Options: sine, saw, square, triangle · default sine')
  })

  it('a MIDI note parameter is shown by note name', () => {
    expect(paramFacts(spec('sampler', 'root'))).toBe('Range C-1 to G9 · default C4')
  })

  it('a control value shows its own range', () => {
    const live = liveSpec(spec('control', 'value'), { min: 20, max: 20000, step: 0, curve: 1 })
    expect(paramFacts({ ...live, default: 440 })).toBe('Range 20 to 20000 · default 440 · logarithmic')
  })

  it('a driven parameter says what drives it, and that the wire wins', () => {
    const lines = paramTooltip(spec('filter', 'cutoff'), 'Control 2').split('\n')
    expect(lines.at(-1)).toBe('Driven by Control 2: the wire replaces this value.')
  })

  it('a socket describes its parameter and how to use it; wired, it says by what', () => {
    const socket = port('filter', 'param:resonance')
    const free = portTooltip(socket, spec('filter', 'resonance')).split('\n')
    expect(free[0]).toBe(spec('filter', 'resonance').description)
    expect(free[1]).toMatch(/^Range /)
    expect(free[2]).toMatch(/^Wire a control or a signal here to replace the value/)
    expect(portTooltip(socket, spec('filter', 'resonance'), 'LFO').split('\n').at(-1)).toBe('Driven by LFO: the wire replaces the stored value.')
  })

  it('an ordinary port says what it is for, and what it carries when that is not plain sound', () => {
    expect(portTooltip(port('oscillator', 'freq'))).toBe(port('oscillator', 'freq').description)
    const stereo = describeNode(createNode('width', 0, 0))!.inputs[0]!
    expect(portTooltip(stereo).split('\n')).toEqual([stereo.description, 'Stereo: a left and a right channel.'])
  })

  it('a node says what it does', () => {
    const shape = describeNode(createNode('delay', 0, 0))!
    expect(nodeTooltip(shape)).toBe(shape.description)
    expect(nodeTooltip(shape)).toMatch(/Runs once on the mix of all voices/)
  })

  it('every node, port and parameter of the registry has tooltip text, with no blank row', () => {
    for (const type of ['oscillator', 'filter', 'control', 'midiToHz', 'trackAudio']) {
      const shape = describeNode(createNode(type, 0, 0))!
      const texts = [
        nodeTooltip(shape),
        ...shape.params.map((p) => paramTooltip(p)),
        ...shape.inputs.map((p) => portTooltip(p, shape.params.find((q) => q.id === p.param))),
        ...shape.outputs.map((p) => portTooltip(p)),
      ]
      for (const text of texts) {
        expect(text.length, type).toBeGreaterThan(0)
        expect(text.split('\n').every((line) => line.trim() !== ''), `${type}: ${text}`).toBe(true)
      }
    }
  })
})
