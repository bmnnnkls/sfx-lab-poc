import { describe, expect, it } from 'vitest'
import { NODE_CATEGORIES, nodeDefinitions, paramSockets, requireNodeDefinition } from '.'
import { nodeDocs } from './node-docs'

const sentence = (text: string | undefined) => text !== undefined && text.trim() === text && text.length >= 8 && text.length <= 200 && /[.)]$/.test(text)

describe('node words: nothing is registered without them', () => {
  it.each(nodeDefinitions.map((definition) => [definition.type, definition] as const))('%s has a category, a sentence, and a sentence for every port and parameter', (type, definition) => {
    expect(NODE_CATEGORIES, `${type} category`).toContain(definition.category)
    expect(sentence(definition.description), `${type} description: ${definition.description}`).toBe(true)
    for (const port of [...definition.inputs, ...definition.outputs]) {
      expect(sentence(port.description), `${type} port ${port.id}: ${port.description}`).toBe(true)
    }
    for (const spec of definition.params) {
      expect(sentence(spec.description), `${type} param ${spec.id}: ${spec.description}`).toBe(true)
    }
  })

  it('has no entry for a node, port or parameter that does not exist', () => {
    for (const [type, docs] of Object.entries(nodeDocs)) {
      const definition = nodeDefinitions.find((candidate) => candidate.type === type)
      expect(definition, `docs for unknown node ${type}`).toBeDefined()
      const has = (kind: 'inputs' | 'outputs' | 'params') => new Set(definition![kind].map((item) => item.id))
      for (const [kind, words] of [['inputs', docs.inputs], ['outputs', docs.outputs], ['params', docs.params]] as const) {
        for (const id of Object.keys(words ?? {})) expect(has(kind).has(id), `${type} ${kind} ${id}`).toBe(true)
      }
    }
  })

  it('files nodes under categories that are all in use, and keywords are plain words', () => {
    expect(new Set(nodeDefinitions.map((definition) => definition.category))).toEqual(new Set(NODE_CATEGORIES))
    for (const definition of nodeDefinitions) {
      for (const word of definition.keywords ?? []) expect(word.trim()).toBe(word)
    }
  })

  it('puts the control and math nodes where the plan says', () => {
    const categoryOf = (type: string) => requireNodeDefinition(type).category
    expect(['control', 'xyPad', 'switch'].map(categoryOf)).toEqual(['Controls', 'Controls', 'Controls'])
    expect(['add', 'multiply', 'invert', 'min', 'max', 'clamp', 'mapRange', 'quantize', 'smooth', 'mix', 'compare', 'midiToHz', 'hzToMidi'].every((type) => categoryOf(type) === 'Math')).toBe(true)
    expect(['lfo', 'envelope'].map(categoryOf)).toEqual(['Modulation', 'Modulation'])
    expect(['note', 'oscillator', 'sampler'].map(categoryOf)).toEqual(['Sources', 'Sources', 'Sources'])
    expect(categoryOf('filter')).toBe('Filters')
  })
})

describe('socket words', () => {
  it('a socket says what its parameter does and carries the parameter range, default and unit', () => {
    const cutoff = paramSockets(requireNodeDefinition('filter')).find((port) => port.param === 'cutoff')!
    const spec = requireNodeDefinition('filter').params.find((candidate) => candidate.id === 'cutoff')!
    expect(cutoff.description).toBe(spec.description)
    expect(cutoff.range).toEqual({ min: 20, max: 20000, default: 2000, unit: 'Hz' })
  })

  it('every socket of every node has a description and a range', () => {
    for (const definition of nodeDefinitions) {
      for (const socket of paramSockets(definition)) {
        expect(sentence(socket.description), `${definition.type} ${socket.id}`).toBe(true)
        expect(socket.range, `${definition.type} ${socket.id}`).toBeDefined()
      }
    }
  })
})
