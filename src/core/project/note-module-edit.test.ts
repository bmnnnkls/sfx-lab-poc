import { describe, expect, it } from 'vitest'
import { NOTE_MODULE_TYPE, exposeNoteKnob, setNoteModuleEffects } from '../notefx'
import { createDemoProject } from './demo-project'
import { addNoteEffect } from './note-effect-edit'
import {
  addNoteModuleUse,
  chainAt,
  editNoteChain,
  groupEffectsAsModule,
  noteModuleUsage,
  removeNoteModule,
  unlinkNoteModule,
  updateNoteModule,
} from './note-module-edit'
import type { InstrumentTrack, Project } from './types'

const demo = createDemoProject()
const bass = (demo.tracks[0] as InstrumentTrack).id
const lead = (demo.tracks[1] as InstrumentTrack).id
const track = (project: Project, index = 0) => project.tracks[index] as InstrumentTrack

const withModule = () => {
  const chained = ['scaleLock', 'chord', 'arpeggiator'].reduce((p, type) => addNoteEffect(p, bass, type), demo)
  const ids = track(chained).noteEffects.slice(1).map((effect) => effect.id)
  const project = groupEffectsAsModule(chained, { trackId: bass }, ids, 'Chord arp')
  const use = track(project).noteEffects.find((effect) => effect.type === NOTE_MODULE_TYPE)!
  return { project, moduleId: use.moduleId!, useId: use.id }
}

describe('project-level MIDI effect modules', () => {
  it('start with an empty library', () => {
    expect(demo.noteModules).toEqual([])
  })

  it('grouping adds a module and one use, and leaves other tracks alone', () => {
    const { project, moduleId } = withModule()
    expect(project.noteModules.map((module) => module.name)).toEqual(['Chord arp'])
    expect(noteModuleUsage(project, moduleId)).toMatchObject({ uses: 1, tracks: ['Bass'] })
    expect(track(project, 1)).toBe(track(demo, 1))
  })

  it('refuses to group effects that are not neighbours, or nothing', () => {
    const chained = ['scaleLock', 'chord', 'arpeggiator'].reduce((p, type) => addNoteEffect(p, bass, type), demo)
    const [first, , third] = track(chained).noteEffects
    expect(groupEffectsAsModule(chained, { trackId: bass }, [first!.id, third!.id])).toBe(chained)
    expect(groupEffectsAsModule(chained, { trackId: bass }, [])).toBe(chained)
  })

  it('another track can use the same module', () => {
    const { project, moduleId } = withModule()
    const second = addNoteModuleUse(project, { trackId: lead }, moduleId)
    expect(noteModuleUsage(second, moduleId)).toMatchObject({ uses: 2, tracks: ['Bass', 'Lead'] })
    expect(second.noteModules).toBe(project.noteModules)
  })

  it('editing the definition changes what every track gets, and only the module changes', () => {
    const { project, moduleId } = withModule()
    const second = addNoteModuleUse(project, { trackId: lead }, moduleId)
    const edited = updateNoteModule(second, moduleId, (module) => setNoteModuleEffects(module, module.effects.slice(0, 1)))
    expect(edited.noteModules[0]!.effects).toHaveLength(1)
    expect(edited.tracks).toBe(second.tracks)
  })

  it('removing a module knob forgets the value stored on every use', () => {
    const { project, moduleId, useId } = withModule()
    const arp = project.noteModules[0]!.effects[1]!
    const knobbed = updateNoteModule(project, moduleId, (module) => exposeNoteKnob(module, arp.id, 'gate', 'Length'))
    const tuned = editNoteChain(knobbed, { trackId: bass }, (effects) =>
      effects.map((effect) => (effect.id === useId ? { ...effect, params: { [`${arp.id}:gate`]: 0.9 } } : effect)),
    )
    const without = updateNoteModule(tuned, moduleId, (module) => setNoteModuleEffects(module, module.effects.slice(0, 1)))
    expect(without.noteModules[0]!.knobs).toEqual([])
    expect(track(without).noteEffects.find((effect) => effect.id === useId)!.params).toEqual({})
  })

  it('unlinking leaves the definition and other uses alone; unused modules can be deleted', () => {
    const { project, moduleId, useId } = withModule()
    const second = addNoteModuleUse(project, { trackId: lead }, moduleId)
    const unlinked = unlinkNoteModule(second, { trackId: bass }, useId)
    expect(track(unlinked).noteEffects.map((effect) => effect.type)).toEqual(['scaleLock', 'chord', 'arpeggiator'])
    expect(noteModuleUsage(unlinked, moduleId).uses).toBe(1)
    expect(removeNoteModule(unlinked, moduleId)).toBe(unlinked)
    const free = unlinkNoteModule(unlinked, { trackId: lead }, track(unlinked, 1).noteEffects[0]!.id)
    expect(removeNoteModule(free, moduleId).noteModules).toEqual([])
  })

  it('a module cannot be placed inside itself or inside something it contains', () => {
    const { project, moduleId, useId } = withModule()
    expect(addNoteModuleUse(project, { noteModuleId: moduleId }, moduleId)).toBe(project)
    const nested = groupEffectsAsModule(project, { trackId: bass }, [useId], 'Outer')
    const outerId = nested.noteModules[1]!.id
    expect(addNoteModuleUse(nested, { noteModuleId: moduleId }, outerId)).toBe(nested)
    expect(addNoteModuleUse(nested, { noteModuleId: outerId }, moduleId)).not.toBe(nested)
  })

  it('returns the same project for no-ops (no empty undo steps)', () => {
    const { project, moduleId } = withModule()
    expect(updateNoteModule(project, moduleId, (module) => module)).toBe(project)
    expect(editNoteChain(project, { trackId: bass }, (effects) => effects)).toBe(project)
    expect(addNoteModuleUse(project, { trackId: bass }, 'nope')).toBe(project)
    expect(chainAt(project, { noteModuleId: 'nope' })).toBeUndefined()
  })
})
