import { describe, expect, it } from 'vitest'
import { noteNodeDefinitions } from './registry'
import { noteNodeDocs } from './node-docs'

const sentence = (text: string | undefined) => text !== undefined && text.trim() === text && text.length >= 8 && text.length <= 200 && /[.)]$/.test(text)

describe('note node words: nothing is registered without them', () => {
  it.each(noteNodeDefinitions.map((definition) => [definition.type, definition] as const))('%s has a category, a sentence, and a sentence for every port and parameter', (type, definition) => {
    expect(['Sources', 'Effects', 'Routing'], `${type} category`).toContain(definition.category)
    expect(sentence(definition.description), `${type} description: ${definition.description}`).toBe(true)
    for (const port of [...definition.inputs, ...definition.outputs]) {
      expect(sentence(port.description), `${type} port ${port.id}: ${port.description}`).toBe(true)
    }
    for (const spec of definition.params) {
      expect(sentence(spec.description), `${type} param ${spec.id}: ${spec.description}`).toBe(true)
    }
  })

  it('has no entry for a node, port or parameter that does not exist', () => {
    for (const [type, docs] of Object.entries(noteNodeDocs)) {
      const definition = noteNodeDefinitions.find((candidate) => candidate.type === type)
      expect(definition, `docs for unknown node ${type}`).toBeDefined()
      for (const [kind, words] of [['inputs', docs.inputs], ['outputs', docs.outputs], ['params', docs.params]] as const) {
        const ids = new Set(definition![kind].map((item) => item.id))
        for (const id of Object.keys(words ?? {})) expect(ids.has(id), `${type} ${kind} ${id}`).toBe(true)
      }
    }
  })

  it('the sockets of a note node take the words and range of their parameter', async () => {
    const { describeNode, createNode } = await import('../patch')
    for (const definition of noteNodeDefinitions) {
      const shape = describeNode(createNode(definition.type, 0, 0))!
      const numeric = definition.params.filter((spec) => spec.options === undefined)
      expect(shape.inputs.filter((port) => port.param !== undefined).map((port) => port.param), definition.type).toEqual(numeric.map((spec) => spec.id))
      for (const socket of shape.inputs.filter((port) => port.param !== undefined)) {
        expect(sentence(socket.description), `${definition.type} ${socket.id}`).toBe(true)
        expect(socket.range, `${definition.type} ${socket.id}`).toBeDefined()
      }
    }
  })

  it('follows the plan: sources, effects, routing', () => {
    const categoryOf = (type: string) => noteNodeDefinitions.find((definition) => definition.type === type)?.category
    expect([categoryOf('clipNotes'), categoryOf('trackNotes'), categoryOf('noteOut'), categoryOf('arpeggiator')]).toEqual(['Sources', 'Sources', 'Routing', 'Effects'])
  })
})
