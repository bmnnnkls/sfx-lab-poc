import { describe, expect, it } from 'vitest'
import {
  MODULE_NODE_TYPE,
  addControl,
  addNode,
  createNode,
  exposeKnob,
  hideKnob,
  moveControl,
  removeNode,
  renameControl,
  setNodeParam,
} from '../patch'
import { diffProject } from '../sync'
import { createDemoProject } from './demo-project'
import { editPatchAt, groupNodesAsModule, patchAt, unlinkModuleNode, updateModule } from './module-edit'
import type { InstrumentTrack, Project } from './types'

const demo = createDemoProject()
const bass = demo.tracks[0] as InstrumentTrack
const target = { trackId: bass.id }
const nodeOf = (type: string) => bass.patch.nodes.find((node) => node.type === type)!
const filter = nodeOf('filter')
const osc = nodeOf('oscillator')

const panelOf = (project: Project) => patchAt(project, target)?.panel ?? []

/** The bass track with a knob on the filter's cutoff and one on the oscillator's frequency. */
const withPanel = (): Project => {
  let project = editPatchAt(demo, target, (patch, modules) => addControl(patch, modules, { kind: 'knob', bind: { node: filter.id, param: 'cutoff' } }))
  project = editPatchAt(project, target, (patch, modules) => addControl(patch, modules, { kind: 'knob', bind: { node: osc.id, param: 'frequency' } }))
  return project
}

describe('the panel in a project', () => {
  it('is edited through the same path as the patch', () => {
    expect(panelOf(withPanel()).map((control) => control.bind.param)).toEqual(['cutoff', 'frequency'])
  })

  it('loses the controls of a deleted node and keeps the rest', () => {
    const next = editPatchAt(withPanel(), target, (patch) => removeNode(patch, osc.id))
    expect(panelOf(next).map((control) => control.bind.param)).toEqual(['cutoff'])
  })

  it('works for the master graph and insert graphs too', () => {
    const withGain = editPatchAt(demo, { master: true }, (patch) => addNode(patch, createNode('gain', 0, 100)))
    const gain = patchAt(withGain, { master: true })!.nodes.find((node) => node.type === 'gain')!
    const next = editPatchAt(withGain, { master: true }, (patch, modules) => addControl(patch, modules, { kind: 'knob', bind: { node: gain.id, param: 'gain' } }))
    expect(patchAt(next, { master: true })?.panel).toHaveLength(1)
    const gone = editPatchAt(next, { master: true }, (patch) => removeNode(patch, gain.id))
    expect(patchAt(gone, { master: true })?.panel).toBeUndefined()

    const fx = editPatchAt(demo, { trackId: bass.id, graph: 'fx' }, (patch) => addNode(patch, createNode('filter', 0, 100)))
    const fxFilter = patchAt(fx, { trackId: bass.id, graph: 'fx' })!.nodes.find((node) => node.type === 'filter')!
    const panelled = editPatchAt(fx, { trackId: bass.id, graph: 'fx' }, (patch, modules) => addControl(patch, modules, { kind: 'knob', bind: { node: fxFilter.id, param: 'cutoff' } }))
    expect(patchAt(panelled, { trackId: bass.id, graph: 'fx' })?.panel).toHaveLength(1)
    expect(panelOf(panelled)).toHaveLength(0) // the instrument's own panel is separate
  })

  it('grouping nodes into a module drops the controls on them but keeps the others', () => {
    const grouped = groupNodesAsModule(withPanel(), target, [osc.id], 'Tone')
    expect(panelOf(grouped).map((control) => control.bind.param)).toEqual(['cutoff'])
  })

  describe('with a module use', () => {
    const grouped = groupNodesAsModule(demo, target, [osc.id, filter.id], 'Core')
    const use = (grouped.tracks[0] as InstrumentTrack).patch.nodes.find((node) => node.type === MODULE_NODE_TYPE)!
    const module = grouped.modules.find((candidate) => candidate.id === use.moduleId)!
    const exposed = updateModule(grouped, module.id, (definition) => exposeKnob(definition, filter.id, 'cutoff', 'Cutoff'))
    const knobId = exposed.modules[0]!.knobs[0]!.id
    const bound = editPatchAt(exposed, target, (patch, modules) => addControl(patch, modules, { kind: 'knob', bind: { node: use.id, param: knobId } }))

    it('can bind a module knob', () => {
      expect(exposed.modules[0]!.knobs).toHaveLength(1)
      expect(panelOf(bound)).toHaveLength(1)
    })

    it('loses the control when the module stops showing that knob', () => {
      const hidden = updateModule(bound, module.id, (definition) => hideKnob(definition, knobId))
      expect(panelOf(hidden)).toHaveLength(0)
      expect('panel' in patchAt(hidden, target)!).toBe(false)
    })

    it('loses the control when the use is unlinked', () => {
      const unlinked = unlinkModuleNode(bound, target, use.id)
      expect(panelOf(unlinked)).toHaveLength(0)
    })

    it('keeps a module\'s own panel on its definition', () => {
      const inner = editPatchAt(exposed, { moduleId: module.id }, (patch, modules) =>
        addControl(patch, modules, { kind: 'knob', bind: { node: filter.id, param: 'resonance' } }),
      )
      expect(patchAt(inner, { moduleId: module.id })?.panel).toHaveLength(1)
      const emptied = editPatchAt(inner, { moduleId: module.id }, (patch) => removeNode(patch, filter.id))
      expect(patchAt(emptied, { moduleId: module.id })?.panel).toBeUndefined()
    })
  })
})

describe('the panel and the engine', () => {
  const before = withPanel()
  const first = panelOf(before)[0]!

  it('editing only the panel sends nothing', () => {
    expect(diffProject(before, editPatchAt(before, target, (patch) => moveControl(patch, first.id, 1)))).toEqual([])
    expect(diffProject(before, editPatchAt(before, target, (patch) => renameControl(patch, first.id, 'Tone')))).toEqual([])
    const added = editPatchAt(before, target, (patch, modules) => addControl(patch, modules, { kind: 'xy', bind: { node: filter.id, param: 'cutoff' }, bindY: { node: filter.id, param: 'resonance' } }))
    expect(diffProject(before, added)).toEqual([])
  })

  it('turning the parameter a control is bound to is an ordinary parameter change', () => {
    const turned = editPatchAt(before, target, (patch) => setNodeParam(patch, filter.id, 'cutoff', 777))
    expect(diffProject(before, turned)).toEqual([{ type: 'track/setParam', trackId: bass.id, nodeId: filter.id, paramId: 'cutoff', value: 777 }])
  })

  it('a project that has a panel starts the engine with a graph that has none', () => {
    const commands = diffProject(null, before)
    const added = JSON.stringify(commands.find((command) => command.type === 'track/add'))
    expect(added).toContain('"nodes"')
    expect(added).not.toContain('"panel"')
  })
})
