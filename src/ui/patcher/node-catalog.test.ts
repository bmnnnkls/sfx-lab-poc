import { describe, expect, it } from 'vitest'
import { type ModuleDefinition, noteNodeDefinitions, nodeDefinitions } from '@core'
import { buildCatalog, searchCatalog } from './node-catalog'

const catalog = buildCatalog(nodeDefinitions.filter((definition) => definition.insertOnly !== true), [])
const labels = (query: string, scope = catalog) => searchCatalog(scope, query).map((entry) => entry.label)

const module = (id: string, name: string): ModuleDefinition => ({ id, name, patch: { nodes: [], connections: [] }, inputs: [], outputs: [], knobs: [] })

describe('buildCatalog', () => {
  it('lists the categories that have something, in the picker order, with their counts', () => {
    expect(catalog.categories.map((category) => category.name)).toEqual(['Sources', 'Controls', 'Modulation', 'Math', 'Filters', 'Effects', 'Routing'])
    expect(catalog.categories.find((category) => category.name === 'Math')?.count).toBe(13)
    expect(catalog.categories.reduce((sum, category) => sum + category.count, 0)).toBe(catalog.entries.length)
  })

  it('puts the modules of the project last, under Modules, with their name', () => {
    const withModules = buildCatalog(nodeDefinitions, [module('m1', 'Wobble core'), module('m2', 'Bass tone')])
    expect(withModules.categories.at(-1)).toEqual({ name: 'Modules', count: 2 })
    expect(withModules.entries.filter((entry) => entry.kind === 'module').map((entry) => [entry.ref, entry.label])).toEqual([['m1', 'Wobble core'], ['m2', 'Bass tone']])
  })

  it('has no category for a graph that offers nothing in it, and an empty catalog when nothing is offered', () => {
    expect(buildCatalog([], []).categories).toEqual([])
    const notes = buildCatalog(noteNodeDefinitions, [])
    expect(notes.categories.map((category) => category.name)).toEqual(['Sources', 'Effects', 'Routing'])
  })

  it('files every node of both registries under a real category (nothing falls back)', () => {
    for (const definition of [...nodeDefinitions, ...noteNodeDefinitions]) expect(definition.category, definition.type).toBeDefined()
  })
})

describe('searchCatalog', () => {
  it('an empty query gives everything, in catalog order, or one category', () => {
    expect(searchCatalog(catalog, '').map((entry) => entry.ref)).toEqual(catalog.entries.map((entry) => entry.ref))
    expect(searchCatalog(catalog, '  ')).toHaveLength(catalog.entries.length)
    expect(searchCatalog(catalog, '', 'Filters').map((entry) => entry.label)).toEqual(['Filter'])
    expect(searchCatalog(catalog, '', 'Controls').map((entry) => entry.label)).toEqual(['Control', 'XY pad', 'Switch'])
  })

  it('ranks the label first: equal, then prefix, then the start of a word, then contained', () => {
    expect(labels('gain')[0]).toBe('Gain')
    expect(labels('osc')[0]).toBe('Oscillator')
    expect(labels('pad')[0]).toBe('XY pad') // a word of the label
    expect(labels('hz').slice(0, 2)).toEqual(['Hz to MIDI', 'MIDI to Hz']) // prefix, then a later word
    expect(labels('ver')[0]).toBe('Reverb') // contained
  })

  it('is case-insensitive and ignores extra spaces', () => {
    expect(labels('  GAIN ')).toEqual(labels('gain'))
    expect(labels('MaP rAnGe')[0]).toBe('Map range')
  })

  it('finds a label by its letters in order, after the stronger matches', () => {
    expect(labels('mrng')).toContain('Map range')
    expect(labels('mrng')[0]).toBe('Map range')
  })

  it('then the category, the keywords and the description', () => {
    const effects = labels('effects')
    expect(effects.slice(0, 3)).toEqual(expect.arrayContaining(['Gain', 'Delay', 'Reverb']))
    expect(labels('vibrato')).toEqual(['LFO']) // a keyword
    expect(labels('lowpass')[0]).toBe('Filter') // a keyword
    expect(labels('echoes')).toContain('Delay') // the description
  })

  it('a label match beats a keyword match, which beats a description match', () => {
    const a = labels('delay') // Delay (label) before anything that only mentions it
    expect(a[0]).toBe('Delay')
    const tiers = labels('echo')
    expect(tiers.indexOf('Delay')).toBeLessThan(tiers.indexOf('Reverb') === -1 ? 99 : tiers.indexOf('Reverb'))
  })

  it('several words must all be found, anywhere', () => {
    expect(labels('math midi')).toEqual(expect.arrayContaining(['MIDI to Hz', 'Hz to MIDI']))
    expect(labels('math midi')).not.toContain('Add')
    expect(labels('slow echo wobble')).toEqual([])
  })

  it('a whole-label match beats a spread-out one: "map range" is Map range first', () => {
    expect(labels('map range')[0]).toBe('Map range')
    expect(labels('midi to hz')[0]).toBe('MIDI to Hz')
  })

  it('no match is an empty list, not an error', () => {
    expect(labels('zzzz')).toEqual([])
    expect(labels('((')).toEqual([])
  })

  it('ties go to the shorter label, then to catalog order', () => {
    const tied = buildCatalog(
      [
        { type: 'b', label: 'Beta tone', category: 'Sources' },
        { type: 'a', label: 'Alpha tone', category: 'Sources' },
        { type: 'c', label: 'Tone', category: 'Sources' },
      ],
      [],
    )
    expect(labels('tone', tied)[0]).toBe('Tone')
    expect(labels('tone', tied).slice(1)).toEqual(['Beta tone', 'Alpha tone'])
  })

  it('finds modules by name, and by the word module', () => {
    const withModules = buildCatalog(nodeDefinitions, [module('m1', 'Wobble core')])
    expect(labels('wobble', withModules)[0]).toBe('Wobble core')
    expect(labels('module', withModules)[0]).toBe('Wobble core')
    expect(searchCatalog(withModules, '', 'Modules').map((entry) => entry.label)).toEqual(['Wobble core'])
  })

  it('searches the note graph catalog the same way', () => {
    const notes = buildCatalog(noteNodeDefinitions, [])
    expect(labels('arp', notes)[0]).toBe('Arpeggiator')
    expect(labels('split', notes)[0]).toBe('Range split')
    expect(labels('instrument', notes)[0]).toBe('To instrument')
  })
})
