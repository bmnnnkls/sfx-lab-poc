import { describe, expect, it } from 'vitest'
import { MODULE_NODE_TYPE, createNode, addNode, connect, exposeKnob, setModulePatch, setNodeParam } from '../patch'
import { addSamples, addTrack, createAudioTrack, createDemoProject, removeSample } from '../project'
import {
  addModuleUse,
  editPatchAt,
  groupNodesAsModule,
  moduleUsage,
  patchAt,
  removeModule,
  unlinkModuleNode,
  updateModule,
} from './module-edit'
import type { InstrumentTrack, Project } from './types'

const demo = createDemoProject()
const bass = demo.tracks[0] as InstrumentTrack
const lead = demo.tracks[1] as InstrumentTrack
const idOf = (track: InstrumentTrack, type: string) => track.patch.nodes.find((node) => node.type === type)!.id

/** The bass track with its oscillator and filter grouped into a module. */
const withModule = (): { project: Project; moduleId: string; useId: string } => {
  const project = groupNodesAsModule(demo, { trackId: bass.id }, [idOf(bass, 'oscillator'), idOf(bass, 'filter')], 'Core')
  const track = project.tracks[0] as InstrumentTrack
  const use = track.patch.nodes.find((node) => node.type === MODULE_NODE_TYPE)!
  return { project, moduleId: use.moduleId!, useId: use.id }
}

describe('insert graphs in the project', () => {
  const fxOf = (project: Project, trackId: string) => patchAt(project, { trackId, graph: 'fx' })!

  it('are reached through the same edit path as every other patch', () => {
    const next = editPatchAt(demo, { trackId: bass.id, graph: 'fx' }, (fx) => addNode(fx, createNode('reverb', 0, 0)))
    expect(fxOf(next, bass.id).nodes).toHaveLength(3)
    expect(fxOf(next, lead.id)).toBe(lead.fx)
  })

  it('exist on audio tracks too', () => {
    const project = addTrack(demo, createAudioTrack('Loop', 2))
    const audio = project.tracks.at(-1)!
    expect(patchAt(project, { trackId: audio.id, graph: 'fx' })).toBe(audio.fx)
    expect(patchAt(project, { trackId: audio.id })).toBeUndefined() // an audio track has no instrument patch
  })

  it('can hold a module, which counts as a use and follows edits of its definition', () => {
    const inFx = editPatchAt(demo, { trackId: bass.id, graph: 'fx' }, (fx) => addNode(fx, createNode('filter', 0, 0)))
    const filterId = fxOf(inFx, bass.id).nodes.find((n) => n.type === 'filter')!.id
    const grouped = groupNodesAsModule(inFx, { trackId: bass.id, graph: 'fx' }, [filterId], 'Dull')
    const moduleId = grouped.modules.at(-1)!.id
    expect(moduleUsage(grouped, moduleId).uses).toBe(1)
    expect(removeModule(grouped, moduleId)).toBe(grouped) // in use
  })

  it('a sampler left in one loses its sample when the sample is removed', () => {
    const sample = { id: 's'.repeat(64), name: 'S', extension: 'wav', durationSeconds: 1, sampleRate: 44100, channels: 1, bytes: 1 }
    const withSampler = editPatchAt(demo, { trackId: bass.id, graph: 'fx' }, (fx) => ({
      ...addNode(fx, { ...createNode('sampler', 0, 0), sampleId: sample.id }),
    }))
    const after = removeSample(addSamples(withSampler, [sample]), sample.id)
    expect(fxOf(after, bass.id).nodes.some((n) => n.sampleId !== undefined)).toBe(false)
  })

  it('connect works between its ends', () => {
    const fx = fxOf(demo, bass.id)
    const [source, sink] = [fx.nodes.find((n) => n.type === 'trackIn')!, fx.nodes.find((n) => n.type === 'trackOut')!]
    expect(connect({ ...fx, connections: [] }, { node: source.id, port: 'out' }, { node: sink.id, port: 'in' }).connections).toHaveLength(1)
  })
})

describe('project-level module edits', () => {
  it('grouping adds a module to the library and one use to the track', () => {
    const { project, moduleId } = withModule()
    expect(project.modules.map((module) => module.name)).toEqual(['Core'])
    expect(moduleUsage(project, moduleId)).toMatchObject({ uses: 1, tracks: ['Bass'] })
    expect((project.tracks[1] as InstrumentTrack).patch).toBe(lead.patch) // other tracks untouched
  })

  it('names modules by count when no name is given', () => {
    const project = groupNodesAsModule(demo, { trackId: bass.id }, [idOf(bass, 'delay')])
    expect(project.modules[0]!.name).toBe('Module 1')
  })

  it('a second use of the same module in another track shares the definition', () => {
    const { project, moduleId } = withModule()
    const second = addModuleUse(project, { trackId: lead.id }, moduleId, 10, 10)
    expect(moduleUsage(second, moduleId)).toMatchObject({ uses: 2, tracks: ['Bass', 'Lead'] })
    expect(second.modules).toBe(project.modules)
  })

  it('editing the definition changes what every track plays', () => {
    const { project, moduleId } = withModule()
    const second = addModuleUse(project, { trackId: lead.id }, moduleId, 10, 10)
    const filter = second.modules[0]!.patch.nodes.find((node) => node.type === 'filter')!
    const edited = updateModule(second, moduleId, (module) =>
      setModulePatch(module, setNodeParam(module.patch, filter.id, 'cutoff', 1234)),
    )
    expect(edited.modules[0]!.patch.nodes.find((node) => node.id === filter.id)!.params.cutoff).toBe(1234)
    expect(edited.tracks).toBe(second.tracks) // the tracks themselves did not change: the module did
  })

  it('removing an inner node prunes the ports, wires and knob values that depended on it', () => {
    const { project, moduleId, useId } = withModule()
    const filter = project.modules[0]!.patch.nodes.find((node) => node.type === 'filter')!
    const knobbed = updateModule(project, moduleId, (module) => exposeKnob(module, filter.id, 'cutoff', 'Tone'))
    const tuned = editPatchAt(knobbed, { trackId: bass.id }, (patch) => setNodeParam(patch, useId, `${filter.id}:cutoff`, 900))

    const without = updateModule(tuned, moduleId, (module) =>
      setModulePatch(module, { nodes: module.patch.nodes.filter((node) => node.id !== filter.id), connections: [] }),
    )
    expect(without.modules[0]!.knobs).toEqual([])
    expect(without.modules[0]!.outputs).toEqual([])
    const patch = patchAt(without, { trackId: bass.id })!
    expect(patch.nodes.find((node) => node.id === useId)!.params).toEqual({})
    expect(patch.connections.every((c) => c.from.node !== useId || c.from.port !== `${filter.id}:out`)).toBe(true)
  })

  it('unlinking leaves the definition and other uses alone', () => {
    const { project, moduleId, useId } = withModule()
    const second = addModuleUse(project, { trackId: lead.id }, moduleId, 10, 10)
    const unlinked = unlinkModuleNode(second, { trackId: bass.id }, useId)
    const bassPatch = patchAt(unlinked, { trackId: bass.id })!
    expect(bassPatch.nodes.some((node) => node.type === MODULE_NODE_TYPE)).toBe(false)
    expect(moduleUsage(unlinked, moduleId).uses).toBe(1)
    expect(unlinked.modules).toBe(second.modules)
  })

  it('a module in use cannot be deleted; an unused one can', () => {
    const { project, moduleId, useId } = withModule()
    expect(removeModule(project, moduleId)).toBe(project)
    const free = unlinkModuleNode(project, { trackId: bass.id }, useId)
    expect(removeModule(free, moduleId).modules).toEqual([])
  })

  it('a module cannot be placed inside itself, directly or through another', () => {
    const { project, moduleId } = withModule()
    expect(addModuleUse(project, { moduleId }, moduleId, 0, 0)).toBe(project)

    const outer = groupNodesAsModule(project, { trackId: bass.id }, [(project.tracks[0] as InstrumentTrack).patch.nodes.find((n) => n.type === MODULE_NODE_TYPE)!.id], 'Outer')
    const outerId = outer.modules[1]!.id
    expect(addModuleUse(outer, { moduleId }, outerId, 0, 0)).toBe(outer) // outer already contains the inner one
    expect(addModuleUse(outer, { moduleId: outerId }, moduleId, 0, 0)).not.toBe(outer) // the other way round is fine
  })

  it('returns the same project for no-op edits (no empty undo steps)', () => {
    const { project, moduleId } = withModule()
    expect(updateModule(project, moduleId, (module) => module)).toBe(project)
    expect(editPatchAt(project, { trackId: bass.id }, (patch) => patch)).toBe(project)
    expect(groupNodesAsModule(project, { trackId: bass.id }, [])).toBe(project)
    expect(addModuleUse(project, { trackId: bass.id }, 'nope', 0, 0)).toBe(project)
  })
})
