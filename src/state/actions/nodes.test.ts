import { type InstrumentTrack, type PatchTarget, addNode, createNode, editPatchAt } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphViewStore } from '../graph-view-store'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { describeActions, nodeClipboard, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name) as InstrumentTrack
const titles = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => item.title)
const enabled = (subject: Subject, id: string) => describeActions(subject, fakeContext()).find((item) => item.id === id)?.enabled
const idOf = (name: string, type: string, graph: 'patch' | 'noteGraph' | 'fx' = 'patch') => track(name)[graph].nodes.find((node) => node.type === type)!.id
const nodes = (name: string, types: readonly string[], graph?: 'patch' | 'fx' | 'notes'): Subject => ({
  kind: 'nodes',
  target: { trackId: track(name).id, ...(graph && { graph }) },
  path: [],
  nodeIds: types.map((type) => idOf(name, type, graph === 'notes' ? 'noteGraph' : graph === 'fx' ? 'fx' : 'patch')),
})
const canvas = (name: string, graph?: 'patch' | 'fx' | 'notes', path: readonly string[] = []): Subject => ({ kind: 'canvas', target: { trackId: track(name).id, ...(graph && { graph }) }, path, at: { x: 400, y: 300 } })

beforeEach(() => {
  loadDemo()
  nodeClipboard.set(null)
  useRenameStore.getState().stop()
  useGraphViewStore.setState({ paths: {}, addRequest: null, moduleInterface: true })
})

describe('nodes', () => {
  it('offers what applies to the nodes', () => {
    expect(titles(nodes('Bass', ['filter', 'envelope']))).toEqual(['Group into module', 'Copy', 'Cut', 'Duplicate', 'Delete'])
    // A graph's ends can be deleted, as with ×, but not copied.
    expect(titles(nodes('Bass', ['trackIn'], 'fx'))).toEqual(['Group into module', 'Delete'])
  })

  it('copies nodes with their wires into another instrument, not into effects', () => {
    runAction('nodes.copy', nodes('Bass', ['filter', 'envelope', 'gain']), fakeContext())
    expect(enabled(canvas('Bass', 'fx'), 'canvas.paste')).toBe(false)
    expect(enabled(canvas('Lead', 'notes'), 'canvas.paste')).toBe(false)
    const before = track('Lead').patch
    runAction('canvas.paste', canvas('Lead'), fakeContext())
    const after = track('Lead').patch
    expect(after.nodes.length).toBe(before.nodes.length + 3)
    const pasted = after.nodes.slice(-3)
    expect(Math.min(...pasted.map((node) => node.x))).toBe(400)
    const wires = (patch: typeof before, ids: Set<string>) => patch.connections.filter((wire) => ids.has(wire.from.node) && ids.has(wire.to.node)).length
    const bass = track('Bass').patch
    expect(wires(after, new Set(pasted.map((node) => node.id)))).toBe(wires(bass, new Set(['filter', 'envelope', 'gain'].map((type) => idOf('Bass', type)))))
    expect(useProjectStore.getState().history.past).toHaveLength(1)
  })

  it('cuts, duplicates and deletes', () => {
    const count = () => track('Bass').patch.nodes.length
    const start = count()
    runAction('nodes.duplicate', nodes('Bass', ['delay']), fakeContext())
    expect(count()).toBe(start + 1)
    expect(nodeClipboard.get()).toBeNull()
    const copy = track('Bass').patch.nodes.at(-1)!
    const original = track('Bass').patch.nodes.find((node) => node.id === idOf('Bass', 'delay'))!
    expect([copy.x - original.x, copy.y - original.y]).toEqual([32, 32])
    runAction('nodes.cut', nodes('Bass', ['filter']), fakeContext())
    expect(count()).toBe(start)
    expect(nodeClipboard.get()?.copied.nodes[0]?.type).toBe('filter')
    runAction('nodes.delete', { kind: 'nodes', target: { trackId: track('Bass').id }, path: [], nodeIds: [copy.id] }, fakeContext())
    expect(count()).toBe(start - 1)
  })

  it('groups into a module, opens it, and unlinks a use', () => {
    const bass = track('Bass').id
    runAction('nodes.group', nodes('Bass', ['filter', 'envelope']), fakeContext())
    const use = track('Bass').patch.nodes.find((node) => node.type === 'module')!
    const subject: Subject = { kind: 'nodes', target: { trackId: bass }, path: [], nodeIds: [use.id] }
    expect(titles(subject)).toEqual(['Open module', 'Group into module', 'Unlink', 'Copy', 'Cut', 'Duplicate', 'Delete'])
    runAction('nodes.open-module', subject, fakeContext())
    expect(useGraphViewStore.getState().paths[`${bass}:patch`]).toEqual([use.moduleId])
    // A module can't be pasted into itself.
    runAction('nodes.copy', subject, fakeContext())
    expect(enabled(canvas('Bass', undefined, [use.moduleId!]), 'canvas.paste')).toBe(false)
    expect(enabled(canvas('Lead'), 'canvas.paste')).toBe(true)
    runAction('nodes.unlink', subject, fakeContext())
    expect(track('Bass').patch.nodes.some((node) => node.type === 'module')).toBe(false)
  })

  it('edits the module open in the graph', () => {
    runAction('nodes.group', nodes('Bass', ['filter', 'envelope']), fakeContext())
    const moduleId = project().modules[0]!.id
    const inner = project().modules[0]!.patch.nodes.find((node) => node.type === 'filter')!
    runAction('nodes.delete', { kind: 'nodes', target: { trackId: track('Bass').id }, path: [moduleId], nodeIds: [inner.id] }, fakeContext())
    expect(project().modules[0]!.patch.nodes.some((node) => node.type === 'filter')).toBe(false)
  })

  it('renames controls, and bypasses note effects', () => {
    const lead = track('Lead').id
    const target: PatchTarget = { trackId: lead }
    const knob = createNode('control', 0, 0)
    const transpose = createNode('transpose', 0, 0)
    useProjectStore.getState().resetProject(editPatchAt(editPatchAt(project(), target, (patch) => addNode(patch, knob)), { trackId: lead, graph: 'notes' }, (patch) => addNode(patch, transpose)))
    const control: Subject = { kind: 'nodes', target, path: [], nodeIds: [knob.id] }
    expect(titles(control)).toContain('Rename')
    expect(titles(nodes('Lead', ['filter']))).not.toContain('Rename')
    runAction('nodes.rename', control, fakeContext({ origin: 'instrument' }))
    expect(useRenameStore.getState().renaming?.subject).toEqual(control)
    const effect: Subject = { kind: 'nodes', target: { trackId: lead, graph: 'notes' }, path: [], nodeIds: [transpose.id] }
    runAction('nodes.bypass', effect, fakeContext())
    expect(titles(effect)).toContain('Unbypass')
    expect(titles(nodes('Lead', ['filter']))).not.toContain('Bypass')
  })
})

describe('canvas', () => {
  it('asks the graph editor for the node picker at the point', () => {
    // The demo has a sample (Kick), so an instrument's canvas offers a sampler.
    expect(titles(canvas('Bass'))).toEqual(['Add node…', 'Add sampler', 'Paste'])
    runAction('canvas.add-node', canvas('Bass', 'fx'), fakeContext())
    expect(useGraphViewStore.getState().addRequest).toEqual({ graph: `${track('Bass').id}:fx`, at: { x: 400, y: 300 } })
  })
})

describe('module', () => {
  it('toggles the interface, and deletes only when unused', () => {
    runAction('nodes.group', nodes('Bass', ['filter', 'envelope']), fakeContext())
    const module: Subject = { kind: 'module', moduleId: project().modules[0]!.id }
    expect(titles(module)).toEqual(['Rename', 'Hide interface', 'Delete — remove or unlink every use first'])
    runAction('module.toggle-interface', module, fakeContext())
    expect(useGraphViewStore.getState().moduleInterface).toBe(false)
    runAction('module.delete', module, fakeContext())
    expect(project().modules).toHaveLength(1)
    const use = track('Bass').patch.nodes.find((node) => node.type === 'module')!
    runAction('nodes.unlink', { kind: 'nodes', target: { trackId: track('Bass').id }, path: [], nodeIds: [use.id] }, fakeContext())
    expect(enabled(module, 'module.delete')).toBe(true)
    runAction('module.delete', module, fakeContext())
    expect(project().modules).toHaveLength(0)
  })
})
