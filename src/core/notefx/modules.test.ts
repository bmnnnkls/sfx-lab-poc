import { describe, expect, it } from 'vitest'
import {
  appendNewNoteEffect,
  exposeNoteKnob,
  hideNoteKnob,
  moveNoteEffectIn,
  renameNoteModule,
  setNoteEffectParamIn,
  setNoteModuleEffects,
} from './chain-edit'
import { describeNoteEffect } from './effect-shape'
import { containsNoteModule, flattenNoteEffects, unlinkNoteModuleUse } from './flatten'
import { createNoteModuleUse, groupIntoNoteModule, isContiguous, pruneNoteModuleKnobs, pruneNoteModuleUses } from './group'
import { NOTE_MODULE_TYPE, type NoteModuleDefinition } from './module-types'
import { NoteChain } from './chain'
import type { NoteEffect } from './types'

const chainOf = (...types: string[]): readonly NoteEffect[] => types.reduce<readonly NoteEffect[]>((effects, type) => appendNewNoteEffect(effects, type), [])
const types = (effects: readonly NoteEffect[]) => effects.map((effect) => effect.type)

/** scaleLock, chord, arpeggiator, echo -> the middle two grouped. */
const grouped = () => {
  const effects = chainOf('scaleLock', 'chord', 'arpeggiator', 'echo')
  const result = groupIntoNoteModule(effects, [effects[1]!.id, effects[2]!.id], 'Chord arp')!
  return result
}

describe('grouping MIDI effects into a module', () => {
  it('replaces a run of neighbours by one use, in the same place', () => {
    const { module, effects, use } = grouped()
    expect(types(effects)).toEqual(['scaleLock', NOTE_MODULE_TYPE, 'echo'])
    expect(effects[1]).toBe(use)
    expect(types(module.effects)).toEqual(['chord', 'arpeggiator'])
    expect(module.knobs).toEqual([])
  })

  it('refuses a selection with gaps, or nothing, because it would reorder the chain', () => {
    const effects = chainOf('scaleLock', 'chord', 'arpeggiator')
    expect(groupIntoNoteModule(effects, [effects[0]!.id, effects[2]!.id], 'x')).toBeNull()
    expect(groupIntoNoteModule(effects, [], 'x')).toBeNull()
    expect(groupIntoNoteModule(effects, ['nope'], 'x')).toBeNull()
    expect(isContiguous(effects, [effects[1]!.id, effects[2]!.id])).toBe(true)
  })

  it('flattening gives back the same effects in the same order', () => {
    const { module, effects, use } = grouped()
    const flat = flattenNoteEffects(effects, [module])
    expect(types(flat)).toEqual(['scaleLock', 'chord', 'arpeggiator', 'echo'])
    expect(flat[1]!.id).toBe(`${use.id}/${module.effects[0]!.id}`)
  })

  it('a use describes itself with the knobs the module shows', () => {
    const { module, use } = grouped()
    const arp = module.effects[1]!
    const withKnob = exposeNoteKnob(module, arp.id, 'gate', 'Length')
    const shape = describeNoteEffect(use, [withKnob])!
    expect(shape.label).toBe('Chord arp')
    expect(shape.params).toHaveLength(1)
    expect(shape.params[0]).toMatchObject({ label: 'Length', min: 0.1, max: 1, default: arp.params.gate })
    expect(describeNoteEffect(use, [])).toBeUndefined()
  })
})

describe('using a module', () => {
  it('knob settings reach the matching inner effect when flattened, per use', () => {
    const { module, use } = grouped()
    const arp = module.effects[1]!
    const withKnob = exposeNoteKnob(module, arp.id, 'gate', 'Length')
    const tuned = setNoteEffectParamIn([use], use.id, `${arp.id}:gate`, 0.9, [withKnob])
    const other = createNoteModuleUse(withKnob)
    const flat = flattenNoteEffects([...tuned, other], [withKnob])
    expect(flat.filter((effect) => effect.type === 'arpeggiator').map((effect) => effect.params.gate)).toEqual([0.9, arp.params.gate])
  })

  it('editing the definition changes every use', () => {
    const { module } = grouped()
    const a = createNoteModuleUse(module)
    const b = createNoteModuleUse(module)
    const edited = setNoteModuleEffects(module, moveNoteEffectIn(module.effects, module.effects[1]!.id, -1))
    expect(types(flattenNoteEffects([a, b], [edited]))).toEqual(['arpeggiator', 'chord', 'arpeggiator', 'chord'])
  })

  it('bypassing a use bypasses everything inside it', () => {
    const { module, use } = grouped()
    const flat = flattenNoteEffects([{ ...use, bypassed: true }], [module])
    expect(flat.every((effect) => effect.bypassed)).toBe(true)
  })

  it('returns the same chain when there is nothing to expand', () => {
    const effects = chainOf('chord')
    expect(flattenNoteEffects(effects, [])).toBe(effects)
  })

  it('a use of a missing module vanishes instead of breaking the chain', () => {
    const { use } = grouped()
    expect(flattenNoteEffects([use, ...chainOf('echo')], [])).toHaveLength(1)
  })

  it('sounds exactly like the same effects written out', () => {
    const { module, effects, use } = grouped()
    const plain = new NoteChain()
    plain.sync(effects.flatMap((effect) => (effect.id === use.id ? [...module.effects] : [effect])))
    const viaModule = new NoteChain()
    viaModule.sync(flattenNoteEffects(effects, [module]))
    const input = [
      { beat: 0, kind: 'noteOn' as const, pitch: 60, velocity: 0.8 },
      { beat: 1.5, kind: 'noteOff' as const, pitch: 60 },
    ]
    expect(viaModule.process(input, 0, 4)).toEqual(plain.process(input, 0, 4))
  })

  it('turning a module knob keeps the running state of its effects (the arpeggio does not restart)', () => {
    const { module, effects, use } = grouped()
    const arp = module.effects[1]!
    const withKnob = exposeNoteKnob(module, arp.id, 'gate', 'Length')
    const chain = new NoteChain()
    chain.sync(flattenNoteEffects(effects, [withKnob]))
    chain.process([], 0, 0) // start-up all-off
    const held = [60, 64, 67].map((pitch) => ({ beat: 0, kind: 'noteOn' as const, pitch, velocity: 0.8 }))
    chain.process(held, 0, 0.6)

    const turned = setNoteEffectParamIn(effects, use.id, `${arp.id}:gate`, 0.9, [withKnob])
    chain.sync(flattenNoteEffects(turned, [withKnob]))
    const next = chain.process([], 0.6, 1.2)
    expect(next.some((event) => event.kind === 'allOff')).toBe(false)
    expect(next.some((event) => event.kind === 'noteOn')).toBe(true)
  })
})

describe('nesting', () => {
  it('expands recursively, with ids that nest', () => {
    const { module: inner } = grouped()
    const outerUse = createNoteModuleUse(inner)
    const outer = groupIntoNoteModule([outerUse], [outerUse.id], 'Outer')!
    const flat = flattenNoteEffects([createNoteModuleUse(outer.module)], [inner, outer.module])
    expect(types(flat)).toEqual(['chord', 'arpeggiator'])
    expect(flat[0]!.id.split('/')).toHaveLength(3)
  })

  it('knobs can point through a nested module', () => {
    const { module: inner } = grouped()
    const arp = inner.effects[1]!
    const innerKnob = exposeNoteKnob(inner, arp.id, 'gate', 'Length')
    const use = createNoteModuleUse(innerKnob)
    const outer = groupIntoNoteModule([use], [use.id], 'Outer')!
    const outerKnob = exposeNoteKnob(outer.module, use.id, `${arp.id}:gate`, 'Hold')
    const top = { ...createNoteModuleUse(outerKnob), params: { [`${use.id}:${arp.id}:gate`]: 0.77 } }
    const flat = flattenNoteEffects([top], [innerKnob, outerKnob])
    expect(flat.find((effect) => effect.type === 'arpeggiator')!.params.gate).toBe(0.77)
  })

  it('detects containment, and cuts off a module that contains itself', () => {
    const { module: inner } = grouped()
    const use = createNoteModuleUse(inner)
    const outer = groupIntoNoteModule([use], [use.id], 'Outer')!.module
    expect(containsNoteModule([inner, outer], outer.id, inner.id)).toBe(true)
    expect(containsNoteModule([inner, outer], inner.id, outer.id)).toBe(false)

    const loop: NoteModuleDefinition = { id: 'loop', name: 'Loop', knobs: [], effects: [...chainOf('chord'), createNoteModuleUse({ id: 'loop' } as NoteModuleDefinition)] }
    expect(flattenNoteEffects([createNoteModuleUse(loop)], [loop]).every((effect) => effect.type !== NOTE_MODULE_TYPE)).toBe(true)
  })
})

describe('unlinking and consistency', () => {
  it('unlinking gives independent effects with fresh ids', () => {
    const { module, effects, use } = grouped()
    const copy = unlinkNoteModuleUse(effects, use.id, [module])
    expect(types(copy)).toEqual(['scaleLock', 'chord', 'arpeggiator', 'echo'])
    const ids = new Set(copy.map((effect) => effect.id))
    expect(ids.size).toBe(4)
    for (const inner of module.effects) expect(ids.has(inner.id)).toBe(false)
  })

  it('knobs that point at removed effects are dropped, and uses forget their values', () => {
    const { module, use } = grouped()
    const arp = module.effects[1]!
    const withKnob = exposeNoteKnob(module, arp.id, 'gate', 'Length')
    const tuned = setNoteEffectParamIn([use], use.id, `${arp.id}:gate`, 0.9, [withKnob])
    expect(pruneNoteModuleUses(tuned, [withKnob])).toBe(tuned)

    const gone = setNoteModuleEffects(withKnob, [module.effects[0]!])
    const pruned = pruneNoteModuleKnobs(gone, [])
    expect(pruned.knobs).toEqual([])
    expect(pruneNoteModuleKnobs(withKnob, [])).toBe(withKnob)
    expect(Object.keys(pruneNoteModuleUses(tuned, [pruned])[0]!.params)).toEqual([])
  })

  it('exposing twice and renaming are harmless', () => {
    const { module } = grouped()
    const arp = module.effects[1]!
    const once = exposeNoteKnob(module, arp.id, 'gate', 'Length')
    expect(exposeNoteKnob(once, arp.id, 'gate', 'Again')).toBe(once)
    expect(hideNoteKnob(once, 'nope')).toBe(once)
    expect(renameNoteModule(once, once.name)).toBe(once)
  })
})
