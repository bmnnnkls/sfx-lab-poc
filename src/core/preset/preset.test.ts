import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createNode, createModuleUse, type ModuleDefinition, type Patch } from '../patch'
import { createEmptyProject, editPatchAt, groupNodesAsModule, unlinkModuleNode, usedSampleIds, projectSampleDependencies, type InstrumentTrack, type Project } from '../project'
import { editControlBase, resolveControlTarget, projectWithControlValues, type ControlTarget } from '../control'
import { parseProject, serializeProject } from '../persistence'
import { diffProject } from '../sync'
import { captureSnapshot, recallSnapshot, putSnapshot, duplicateSnapshot, deleteSnapshot, morphSnapshots, saveProjectPreset, recallProjectPreset, enumerateSampleTargets, editSampleBinding, resolveSampleTarget, assetSignature, captureAsset, duplicateProjectPreset, deleteProjectPreset } from './index'
const sample = (letter: string) => ({ id: letter.repeat(64), name: letter, extension: 'wav', sampleRate: 8000, channels: 1, bytes: 16000, durationSeconds: 1 })
const read = (p: Project) => { const r = parseProject(serializeProject(p)); if (!r.ok) throw new Error(r.error); expect(r.warnings).toEqual([]); return r.project }
const setup = () => {
  let p = createEmptyProject()
  const track = p.tracks[0] as InstrumentTrack
  const sampler = { ...createNode('sampler', 0, 0), id: 'sample', sampleId: sample('a').id }
  const knob = { ...createNode('control', 0, 0), id: 'knob', params: { ...createNode('control', 0, 0).params, value: 100, min: 20, max: 20000, curve: 1 } }
  const toggle = { ...createNode('switch', 0, 0), id: 'toggle' }
  const button = { ...toggle, id: 'button', params: { ...toggle.params, mode: 1 } }
  const m: ModuleDefinition = { id: 'm', name: 'Sample voice', patch: { nodes: [sampler, knob, toggle, button], connections: [] }, inputs: [], outputs: [{ id: 'sample:out', label: 'Out', inner: { node: 'sample', port: 'out' } }], knobs: [] }
  const patch: Patch = { nodes: [{ ...createModuleUse(m, 0, 0), id: 'left' }, { ...createModuleUse(m, 0, 0), id: 'right' }], connections: [] }
  p = editPatchAt({ ...p, samples: [sample('a'), sample('b')], modules: [m] }, { trackId: track.id }, () => patch)
  const scope = { owner: { kind: 'track' as const, trackId: track.id }, domain: 'patch' as const }
  const target: ControlTarget = { kind: 'graph', owner: scope.owner, domain: 'patch', path: [{ nodeId: 'left', moduleId: 'm' }], nodeId: 'knob', nodeType: 'control', paramId: 'value' }
  return { p, scope, target }
}
describe('snapshots and immutable embedded presets', () => {
  it('saves two sounds, recalls and reloads both with independent instance bases and snapshot CRUD', () => {
    const { p, scope, target } = setup()
    const a = captureSnapshot(p, scope, 'A'), changed = editControlBase(p, target, 3000).project, b = captureSnapshot(changed, scope, 'B')
    let project = putSnapshot(putSnapshot(changed, a), b)
    project = read(project)
    for (const [snapshot, expected] of [[a, 100], [b, 3000]] as const) {
      const result = recallSnapshot(project, snapshot)
      expect(result.issues).toEqual([])
      expect(resolveControlTarget(read(result.project), target)).toMatchObject({ baseValue: expected })
    }
    expect(a.values.some(e => e.target.kind === 'graph' && e.target.nodeId === 'button')).toBe(false)
    expect(a.values.every(e => e.target.kind === 'graph')).toBe(true)
    project = duplicateSnapshot(project, a)
    expect(project.snapshots).toHaveLength(3)
    expect(deleteSnapshot(project, a.id).snapshots).toHaveLength(2)
    expect(putSnapshot(project, { ...a, name: 'Renamed' }).snapshots?.find(s => s.id === a.id)?.name).toBe('Renamed')
  })
  it('reports missing/replaced/wired targets and partially recalls survivors without replacing graphs', () => {
    const { p, scope, target } = setup(), s = captureSnapshot(p, scope, 'A')
    const removed = editPatchAt(editControlBase(p, target, 2000).project, { trackId: scope.owner.trackId }, patch => ({ ...patch, nodes: patch.nodes.filter(n => n.id !== 'right') }))
    const r = recallSnapshot(removed, s)
    expect(r.issues.length).toBeGreaterThan(0)
    expect(r.issues.every(i => i.status === 'missing')).toBe(true)
    expect(resolveControlTarget(r.project, target)).toMatchObject({ baseValue: 100 })
    const replaced = { ...s, values: [{ target: { ...target, nodeType: 'filter' }, value: 100 }] }
    expect(recallSnapshot(p, replaced).issues[0]?.status).toBe('incompatible')
  })
  it('preserves shared defaults, independently overrides two uses, captures explicit silence and dependencies', () => {
    const { p, scope } = setup(), [left, right] = enumerateSampleTargets(p)
    expect(left && right).toBeTruthy()
    let project = editSampleBinding(p, { target: left!, sampleId: sample('b').id })
    expect(resolveSampleTarget(project, right!)).toMatchObject({ sampleId: sample('a').id })
    expect(project.modules).toBe(p.modules)
    project = saveProjectPreset(project, scope, 'Different samples')
    const preset = project.presets![0]!
    project = editSampleBinding(editSampleBinding(project, { target: left!, sampleId: null }), { target: right!, sampleId: sample('b').id })
    project = saveProjectPreset(project, scope, 'Silent left')
    expect(project.assetRevisions).toHaveLength(1)
    project = read(project)
    const recalled = recallProjectPreset(project, preset)
    expect(recalled.issues).toEqual([])
    expect(resolveSampleTarget(recalled.project, left!)).toMatchObject({ sampleId: sample('b').id })
    expect(resolveSampleTarget(recalled.project, right!)).toMatchObject({ sampleId: sample('a').id })
    const silent = recallProjectPreset(recalled.project, project.presets![1]!).project
    expect(resolveSampleTarget(read(silent), left!)).toMatchObject({ sampleId: null })
    const projection = projectWithControlValues(recalled.project)
    const patch = (projection.tracks[0] as InstrumentTrack).patch
    expect(patch.nodes.find(n => n.id === 'left/sample')?.sampleId).toBe(sample('b').id)
    expect(patch.nodes.find(n => n.id === 'right/sample')?.sampleId).toBe(sample('a').id)
    expect(usedSampleIds(project)).toEqual(expect.arrayContaining([sample('a').id, sample('b').id]))
    expect(diffProject(p, recalled.project).some(c => c.type === 'track/setSample' || c.type === 'track/setPatch')).toBe(true)
    expect(preset).not.toHaveProperty('midiMappings')
    expect(project.assetRevisions![0]!.payload).not.toHaveProperty('clips')
  })
  it('retains instance sample choices through grouping/unlinking and shared-default edits', () => {
    const { p, scope } = setup(), left = enumerateSampleTargets(p)[0]!
    const override = editSampleBinding(p, { target: left, sampleId: sample('b').id })
    for (const transformed of [groupNodesAsModule(override, { trackId: scope.owner.trackId }, ['left']), unlinkModuleNode(override, { trackId: scope.owner.trackId }, 'left')]) {
      expect(resolveSampleTarget(transformed, transformed.sampleBindings![0]!.target)).toMatchObject({ sampleId: sample('b').id })
      expect(read(transformed).sampleBindings).toEqual(transformed.sampleBindings)
    }
    const shared = { ...override, modules: override.modules.map(m => ({ ...m, patch: { ...m.patch, nodes: m.patch.nodes.map(n => n.type === 'sampler' ? { ...n, sampleId: sample('b').id } : n) } })) }
    expect(enumerateSampleTargets(shared).map(t => resolveSampleTarget(shared, t))).toEqual(expect.arrayContaining([expect.objectContaining({ sampleId: sample('b').id })]))
    expect(resolveSampleTarget(override, enumerateSampleTargets(override)[1]!)).toMatchObject({ sampleId: sample('a').id })
  })
  it('checks structural revisions, supports another compatible owner and reports missing sample dependencies', () => {
    const { p, scope, target } = setup()
    const saved = saveProjectPreset(p, scope, 'A'), preset = saved.presets![0]!
    const changed = editControlBase(saved, target, 1000).project
    expect(assetSignature(captureAsset(changed, scope))).toBe(saved.assetRevisions![0]!.signature)
    const track = changed.tracks[0]!
    const second = { ...changed, tracks: [...changed.tracks, { ...track, id: 'copy' }] }
    expect(recallProjectPreset(second, preset, { ...scope, owner: { kind: 'track', trackId: 'copy' } }).issues).toEqual([])
    const broken = editPatchAt(saved, { trackId: scope.owner.trackId }, patch => ({ ...patch, nodes: patch.nodes.slice(1) }))
    expect(() => recallProjectPreset(broken, preset)).toThrow('Graph differs')
    const newRevision = saveProjectPreset(broken, scope, 'Changed structure')
    expect(newRevision.assetRevisions).toHaveLength(2)
    expect(recallProjectPreset({ ...saved, samples: [] }, preset).issues.some(i => i.reason.includes('Sample'))).toBe(true)
    const external = editPatchAt(saved, { trackId: scope.owner.trackId }, patch => ({ ...patch, nodes: [...patch.nodes, createNode('trackAudio', 0, 0)] }))
    expect(() => saveProjectPreset(external, scope, 'External')).toThrow('external')
  })
  it('morphs logarithmic scales, snaps discrete controls at 50%, refuses mismatches and excludes momentary switches', () => {
    const { p, scope, target } = setup(), a = captureSnapshot(p, scope, 'A')
    let changed = editControlBase(p, target, 10000).project
    const toggle = { ...target, nodeId: 'toggle', nodeType: 'switch', paramId: 'on' }
    changed = editControlBase(changed, toggle, 1).project
    const b = captureSnapshot(changed, scope, 'B'), mid = morphSnapshots(p, a, b, 0.5)
    expect(mid.values.find(e => JSON.stringify(e.target) === JSON.stringify(target))?.value).toBeCloseTo(1000)
    expect(mid.values.find(e => e.target.kind === 'graph' && e.target.nodeId === 'toggle' && e.target.path[0]?.nodeId === 'left')?.value).toBe(1)
    expect(morphSnapshots(p, a, b, 0.499).values.find(e => JSON.stringify(e.target) === JSON.stringify(toggle))?.value).toBe(0)
    expect(() => morphSnapshots(p, a, { ...b, values: [] }, 0.5)).toThrow('identical')
  })
  it('captures typed audio/note assets and keeps revisions immutable through preset CRUD', () => {
    const { p, scope } = setup()
    let project = saveProjectPreset(p, { ...scope, domain: 'fx' }, 'Effects')
    project = saveProjectPreset(project, { ...scope, domain: 'notes' }, 'Notes')
    expect(project.assetRevisions!.map(r => r.payload.kind)).toEqual(['audio-effect', 'note-effect'])
    const old = project.assetRevisions![0]!
    project = saveProjectPreset(project, { ...scope, domain: 'fx' }, 'Updated effects', project.presets![0]!.id)
    expect(project.presets).toHaveLength(2)
    expect(project.assetRevisions![0]).toBe(old)
    project = duplicateProjectPreset(project, project.presets![0]!)
    const copy = project.presets!.at(-1)!
    project = deleteProjectPreset(project, project.presets![0]!.id)
    expect(project.presets).toHaveLength(2)
    expect(project.assetRevisions!.some(r => r.id === copy.revisionId)).toBe(true)
    expect(read(project).presets).toEqual(project.presets)
  })
  it('collects saved sample dependencies separately from the samples needed for playback', () => {
    const { p, scope } = setup(), target = enumerateSampleTargets(p)[0]!
    let project = editSampleBinding(p, { target, sampleId: sample('b').id })
    project = saveProjectPreset(project, scope, 'B')
    project = { ...project, sampleBindings: [] }
    expect(usedSampleIds(project)).toEqual([sample('a').id])
    expect(projectSampleDependencies(project)).toEqual([sample('a').id, sample('b').id])
  })
  it('round trips v6, explicitly migrates older unknown fields and bounds hostile saved state', () => {
    const { p, scope } = setup()
    let project = saveProjectPreset(putSnapshot(p, captureSnapshot(p, scope, 'A')), scope, 'Preset A')
    project = editSampleBinding(project, { target: enumerateSampleTargets(p)[0]!, sampleId: sample('b').id })
    const fixture = serializeProject(project, 2)
    expect(read(project)).toEqual(project)
    const raw = JSON.parse(fixture)
    for (const version of [1, 2, 3, 4, 5]) { const r = parseProject(JSON.stringify({ ...raw, version })); expect(r.ok && r.project.presets).toBeUndefined() }
    raw.project.snapshots[0].values.push({ value: 'bad', target: {} })
    raw.project.sampleBindings.push({ target: {}, sampleId: 'x' })
    raw.project.assetRevisions.push({ id: 'bad', payload: {} })
    const hostile = parseProject(JSON.stringify(raw))
    expect(hostile.ok && hostile.warnings.length).toBeGreaterThanOrEqual(3)
    const committed = parseProject(readFileSync(new URL('../persistence/fixtures/v6-presets.sfxlab.json', import.meta.url), 'utf8'))
    expect(committed.ok && committed.warnings).toEqual([])
  })
})

it('remaps snapshot routes for root, nested and shared-definition group/unlink while keeping revisions immutable', () => {
  const { p, scope, target } = setup()
  const a = captureSnapshot(p, scope, 'A'), b = captureSnapshot(editControlBase(p, target, 2000).project, scope, 'B')
  const original = saveProjectPreset(putSnapshot(putSnapshot(p, a), b), scope, 'Immutable')
  const shared = groupNodesAsModule(original, { moduleId: 'm' }, ['knob'])
  const sharedUse = shared.modules.find(m => m.id === 'm')!.patch.nodes.find(n => n.type === 'module')!
  const root = groupNodesAsModule(original, { trackId: scope.owner.trackId }, ['left'])
  const rootUse = (root.tracks[0] as InstrumentTrack).patch.nodes.find(n => n.type === 'module' && n.id !== 'right')!
  const variants = [shared, root, unlinkModuleNode(original, { trackId: scope.owner.trackId }, 'left'), unlinkModuleNode(shared, { moduleId: 'm' }, sharedUse.id), unlinkModuleNode(root, { trackId: scope.owner.trackId }, rootUse.id)]
  for (const changed of variants) {
    expect(changed.presets).toBe(original.presets)
    expect(changed.assetRevisions).toBe(original.assetRevisions)
    const reloaded = read(changed)
    for (const snapshot of reloaded.snapshots!) expect(recallSnapshot(reloaded, snapshot).issues).toEqual([])
    expect(() => morphSnapshots(reloaded, reloaded.snapshots![0]!, reloaded.snapshots![1]!, 0.5)).not.toThrow()
    // Both uses of the shared definition retain their saved values.
    expect(reloaded.snapshots![0]!.values.length).toBe(a.values.length)
  }
})
it('keeps unrelated and already-stale snapshot routes through history and a project package round trip', async () => {
  const { createHistory, commit, undo, redo } = await import('../history')
  const { exportProject, importProject } = await import('../../storage')
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const root = { ...t, patch: { nodes: [{ ...createNode('control', 0, 0), id: 'k' }], connections: [] } }
  const other = { ...root, id: 'other' }, owner = { kind: 'track' as const, trackId: t.id }
  const base = { ...p, tracks: [root, other] }
  let saved = putSnapshot(base, captureSnapshot(base, { owner, domain: 'patch' }, 'Root'))
  const unrelated = captureSnapshot(base, { owner: { kind: 'track', trackId: 'other' }, domain: 'patch' }, 'Other')
  saved = putSnapshot(saved, unrelated)
  const value = saved.snapshots![0]!.values[0]!
  if (value.target.kind !== 'graph') throw new Error('Expected graph')
  const stale = { ...saved.snapshots![0]!, id: 'stale', values: [{ ...value, target: { ...value.target, nodeId: 'gone' } }] }
  saved = putSnapshot(saved, stale)
  const changed = groupNodesAsModule(saved, { trackId: t.id }, ['k'])
  expect(changed.snapshots![1]!.values).toEqual(unrelated.values)
  expect(changed.snapshots![2]!.values).toEqual(stale.values)
  expect(recallSnapshot(changed, changed.snapshots![2]!).issues).toHaveLength(1)
  const history = commit(createHistory(saved), changed, { now: 1 })
  expect(undo(history).present).toBe(saved); expect(redo(undo(history)).present).toBe(changed)
  const exported = await exportProject(changed, async () => undefined), imported = await importProject(exported.bytes)
  expect(imported.ok && imported.project).toEqual(changed)
  if (imported.ok) expect(recallSnapshot(imported.project, imported.project.snapshots![0]!).issues).toEqual([])
})
