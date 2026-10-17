import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createEmptyProject, createTrack, createAudioTrack, createReturnTrack, createClip, createAudioClip, createNote, type Project, type InstrumentTrack } from '../project'
import { createNode, createModuleUse, type ModuleDefinition } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { editControlBase, enumerateControlTargets, resolveControlTarget } from '../control'
import { editSampleBinding, enumerateSampleTargets, recallProjectPreset, resolveSampleTarget, saveProjectPreset } from '../preset'
import { renderProject } from '../engine'
import { emptyLibrary, captureLibraryAsset, insertLibraryAsset, saveLibraryFolder, saveLibraryItem, trashLibraryEntry, browseLibrary, captureLibraryClip, insertLibraryClip, captureLibrarySample, libraryPreviewProject } from './index'
const sample = (letter: string) => ({ id: letter.repeat(64), name: letter, extension: 'wav', sampleRate: 8000, channels: 1, bytes: 16000, durationSeconds: 1 })
const load = (project: Project) => { const result = parseProject(serializeProject(project)); if (!result.ok) throw new Error(result.error); expect(result.warnings).toEqual([]); return result.project }
const setup = () => {
  const raw = readFileSync(new URL('../persistence/fixtures/v6-presets.sfxlab.json', import.meta.url), 'utf8')
  const result = parseProject(raw)
  if (!result.ok) throw new Error(result.error)
  return result.project
}
const scopeOf = (project: Project, domain: 'patch' | 'fx' | 'notes' = 'patch') => ({ owner: { kind: 'track' as const, trackId: project.tracks[0]!.id }, domain })
describe('library catalog', () => {
  it('allows duplicate names, filters by type/name/folder and refuses direct and indirect folder cycles', () => {
    let c = saveLibraryFolder(emptyLibrary(), 'Duplicate', null, 'a')
    c = saveLibraryFolder(c, 'Duplicate', 'a', 'b')
    expect(() => saveLibraryFolder(c, 'Cycle', 'b', 'a')).toThrow(/itself/)
    expect(() => saveLibraryFolder(c, 'Cycle', 'a', 'a')).toThrow(/itself/)
    expect(() => saveLibraryFolder(c, 'Bad', 'missing')).toThrow(/unavailable/)
    c = saveLibraryItem(c, { id: 'i', name: 'Kick', folderId: 'b', content: { kind: 'sample', sampleId: sample('a').id } })
    c = saveLibraryItem(c, { ...c.items[0]!, id: 'j' })
    expect(browseLibrary(c, { folderId: 'b', query: 'KIC', kind: 'sample' })).toHaveLength(2)
    expect(browseLibrary(c, { kind: 'instrument' })).toEqual([])
    c = trashLibraryEntry(c, 'a')
    expect(browseLibrary(c)).toEqual([])
    expect(browseLibrary(c, { trash: true })).toHaveLength(2)
    c = trashLibraryEntry(c, 'a', false)
    expect(browseLibrary(c)).toHaveLength(2)
    expect(c.folders.every(f => !f.trashed)).toBe(true)
  })
  it('saves complete asset and preset sample closure, then remaps independent copies and preserves recalls across reload', () => {
    const base = setup(), original = saveProjectPreset(base, scopeOf(base), 'Second'), scope = scopeOf(original)
    const catalog = captureLibraryAsset(emptyLibrary(), original, scope, 'Sampler', null)
    expect(catalog.items.filter(i => i.content.kind === 'preset').length).toBeGreaterThanOrEqual(2)
    expect(new Set(catalog.revisions[0]!.payload.sampleIds)).toEqual(new Set(original.samples.map(s => s.id)))
    let project = insertLibraryAsset(createEmptyProject(), catalog, catalog.items[0]!, { mode: 'new-track' }).project
    const first = project.tracks.at(-1) as InstrumentTrack
    const firstModuleIds = new Set(project.modules.map(m => m.id))
    project = insertLibraryAsset(project, catalog, catalog.items[0]!, { mode: 'new-track' }).project
    expect(project.modules.filter(m => firstModuleIds.has(m.id))).toHaveLength(firstModuleIds.size)
    expect(new Set(project.modules.map(m => m.id)).size).toBe(project.modules.length)
    const second = project.tracks.at(-1) as InstrumentTrack
    expect(second.patch.nodes.map(n => n.id).some(id => first.patch.nodes.some(n => n.id === id))).toBe(false)
    project = load(project)
    for (const preset of project.presets!) {
      const result = recallProjectPreset(project, preset)
      expect(result.issues).toEqual([])
      for (const value of preset.values) expect(resolveControlTarget(result.project, value.target)).toMatchObject({ status: 'available', baseValue: value.value })
      for (const binding of preset.samples) expect(resolveSampleTarget(result.project, binding.target)).toMatchObject({ status: 'available', sampleId: binding.sampleId })
    }
    expect(project.libraryOrigins).toHaveLength(2)
    expect(load(project)).toEqual(project)
    const deleted = trashLibraryEntry(catalog, catalog.items[0]!.id)
    expect(browseLibrary(deleted)).toHaveLength(0)
    expect(load(project)).toEqual(project)
  })
  it('remaps nested module interfaces, automatic controls, explicit knobs and nested-use overrides without changing rendered audio', () => {
    let project = createEmptyProject(), track = project.tracks[0] as InstrumentTrack
    const oscillator = { ...createNode('oscillator', 0, 0), id: 'osc' }, output = { ...createNode('output', 0, 0), id: 'output' }
    const knob = { ...createNode('control', 0, 0), id: 'knob' }
    const inner: ModuleDefinition = { id: 'inner', name: 'Inner', patch: { nodes: [oscillator, knob], connections: [] }, inputs: [], outputs: [{ id: 'osc:out', label: 'Out', inner: { node: 'osc', port: 'out' } }], knobs: [{ id: 'osc:frequency', label: 'Tune', node: 'osc', param: 'frequency' }] }
    const use = { ...createModuleUse(inner, 0, 0), id: 'inner-use', params: { 'osc:frequency': 330, 'knob:value': 0.7 } }
    const outer: ModuleDefinition = { id: 'outer', name: 'Outer', patch: { nodes: [use], connections: [] }, inputs: [], outputs: [{ id: 'inner-use:osc:out', label: 'Out', inner: { node: use.id, port: inner.outputs[0]!.id } }], knobs: [{ id: 'inner-use:osc:frequency', label: 'Nested', node: use.id, param: 'osc:frequency' }] }
    const root = { ...createModuleUse(outer, 0, 0), id: 'root', params: { 'inner-use:osc:frequency': 440 } }
    track = { ...track, patch: { nodes: [root, output], connections: [{ id: 'wire', from: { node: root.id, port: outer.outputs[0]!.id }, to: { node: output.id, port: 'in' } }] }, clips: [createClip('Tone', 4, [createNote(60, 0, 4)]), ...track.clips.slice(1)] }
    project = { ...project, tracks: [track], modules: [inner, outer] }
    const target = enumerateControlTargets(project).find(t => t.kind === 'graph' && t.nodeId === 'knob' && t.paramId === 'value')!
    project = editControlBase(project, target, 0.4).project
    project = load(project)
    project = saveProjectPreset(project, scopeOf(project), 'Nested')
    const c = captureLibraryAsset(emptyLibrary(), project, scopeOf(project), 'Nested', null)
    const inserted = insertLibraryAsset(project, c, c.items[0]!, { mode: 'replace', scope: scopeOf(project) }).project
    const reloaded = load(inserted)
    expect(recallProjectPreset(reloaded, reloaded.presets!.at(-1)!).issues).toEqual([])
    const options = { scope: { kind: 'scene' as const, scene: 0 }, bars: 0.25, maxTail: 0 }
    expect(renderProject(reloaded, [], options).left).toEqual(renderProject(project, [], options).left)
    expect(reloaded.modules.at(-1)!.knobs[0]!.id).not.toBe('inner-use:osc:frequency')
  })
  it('rejects external routing inside nested dependencies and requires an explicit compatible replacement domain', () => {
    const p = setup(), module = p.modules[0]!
    const routed = { ...p, modules: [{ ...module, patch: { ...module.patch, nodes: [...module.patch.nodes, createNode('trackAudio', 0, 0)] } }, ...p.modules.slice(1)] }
    expect(() => captureLibraryAsset(emptyLibrary(), routed, scopeOf(p), 'Unsafe', null)).toThrow(/external/)
    const c = captureLibraryAsset(emptyLibrary(), p, scopeOf(p), 'Safe', null)
    expect(() => insertLibraryAsset(p, c, c.items[0]!, { mode: 'replace', scope: scopeOf(p, 'fx') })).toThrow(/compatible/)
    expect(() => insertLibraryAsset(p, c, c.items[0]!, { mode: 'replace' })).toThrow(/scope/)
    const item = c.items[0]!, content = item.content
    if (!('state' in content)) throw new Error('Expected saved sound')
    const external = { ...item, content: { ...content, state: { ...content.state, values: [{ target: { kind: 'mixer' as const, owner: content.state.scope.owner, control: 'send' as const, returnId: 'unrelated' }, value: 1 }] } } }
    expect(() => insertLibraryAsset(p, c, external, { mode: 'new-track' })).toThrow(/outside its asset scope/)
    expect(() => insertLibraryAsset({ ...createEmptyProject(), samples: [] }, { ...c, samples: [] }, item, { mode: 'new-track' })).toThrow(/metadata missing/)
    const cyclic = { ...p, modules: p.modules.map(m => m.id === module.id ? { ...m, patch: { ...m.patch, nodes: [...m.patch.nodes, { ...createModuleUse(m, 0, 0), id: 'cycle' }] } } : m) }
    expect(() => captureLibraryAsset(emptyLibrary(), cyclic, scopeOf(p), 'Cycle', null)).toThrow(/Cyclic/)

  })
  it('records every per-use sample override and saves effects with associated presets', () => {
    let p = setup()
    const binding = enumerateSampleTargets(p)[0]!
    p = editSampleBinding(p, { target: binding, sampleId: sample('b').id })
    let c = captureLibraryAsset(emptyLibrary(), p, scopeOf(p), 'Sampler', null)
    const result = insertLibraryAsset(createEmptyProject(), c, c.items[0]!, { mode: 'new-track' }).project
    expect(resolveSampleTarget(result, enumerateSampleTargets(result).at(-2)!)).toMatchObject({ sampleId: sample('b').id })
    const scope = scopeOf(p, 'fx')
    p = saveProjectPreset(saveProjectPreset(p, scope, 'Dry'), scope, 'Dry 2')
    c = captureLibraryAsset(c, p, scope, 'Effect', null)
    const effect = c.items.find(i => i.content.kind === 'audio-effect')!
    expect(c.items.filter(i => i.content.kind === 'preset' && i.content.assetId === effect.id)).toHaveLength(2)
    const loaded = load(insertLibraryAsset(result, c, effect, { mode: 'replace', scope: scopeOf(result, 'fx') }).project)
    expect(loaded.presets?.filter(p => p.scope.domain === 'fx')).toHaveLength(3)
  })
})
describe('portable library clips and samples', () => {
  it('copies MIDI notes and portable mixer lanes with fresh identities, refuses occupied slots and reports incompatible graph lanes', () => {
    let p = createEmptyProject(), track = p.tracks[0] as InstrumentTrack
    const owner = { kind: 'track' as const, trackId: track.id }, graphTarget = enumerateControlTargets(p).find(t => t.kind === 'graph' && t.owner.kind === 'track' && t.owner.trackId === track.id)!
    const clip = { ...createClip('MIDI', 4, [createNote(60, 0, 1)]), automation: [{ id: 'lane', enabled: true, target: { kind: 'mixer' as const, owner, control: 'pan' as const }, points: [{ id: 'point', beat: 0, value: 0.7, interpolation: 'hold' as const }] }, { id: 'graph', enabled: true, target: graphTarget, points: [] }] }
    track = { ...track, clips: [clip, ...track.clips.slice(1)] }; p = { ...p, tracks: [track] }
    const c = captureLibraryClip(emptyLibrary(), p, track.id, clip.id, 'MIDI', null)
    expect(JSON.stringify(c.items[0]!.content)).not.toContain(track.id)
    const destination = createTrack('Destination', p.sceneCount)
    const result = insertLibraryClip({ ...p, tracks: [...p.tracks, destination] }, c, c.items[0]!, destination.id, 0)
    expect(result.issues).toEqual([])
    const copied = (result.project.tracks[1] as InstrumentTrack).clips[0]!
    expect(copied.id).not.toBe(clip.id); expect(copied.notes[0]!.id).not.toBe(clip.notes[0]!.id)
    expect(copied.automation![0]!.target.owner).toEqual({ kind: 'track', trackId: destination.id })
    expect(() => insertLibraryClip(result.project, c, c.items[0]!, destination.id, 0)).toThrow(/occupied/)
    const mismatch = { ...destination, patch: { nodes: [], connections: [] } }
    const incompatible = insertLibraryClip({ ...p, tracks: [mismatch] }, c, c.items[0]!, destination.id, 0)
    expect(incompatible.issues).toHaveLength(1)
    expect((incompatible.project.tracks[0] as InstrumentTrack).clips[0]!.automation).toHaveLength(1)
    expect(load(result.project)).toEqual(result.project)
  })
  it('keeps complete audio trim/loop/warp/fades/gain, reuses sample metadata and refuses external send lanes', () => {
    const s = sample('a'), track = createAudioTrack('Audio', 4)
    const clip = { ...createAudioClip(s, 120), start: 0.2, end: 0.7, warp: 'off' as const, loop: false, gain: 0.5, fadeIn: 0.01, fadeOut: 0.02 }
    const p = { ...createEmptyProject(), samples: [s], tracks: [{ ...track, clips: [clip, null, null, null] }] }
    let c = captureLibraryClip(emptyLibrary(), p, track.id, clip.id, 'Trimmed', null)
    c = captureLibrarySample(c, p, s.id, 'Same bytes', null)
    expect(c.samples).toHaveLength(1)
    const dest = createAudioTrack('Fresh', 4)
    const r = insertLibraryClip({ ...createEmptyProject(), tracks: [dest] }, c, c.items[0]!, dest.id, 0)
    const saved = load(r.project)
    const copied = saved.tracks[0]!.kind === 'audio' && saved.tracks[0]!.clips[0]
    expect(copied).toMatchObject({ ...clip, id: expect.any(String), name: 'Trimmed' })
    const invalid = { ...p, tracks: [{ ...p.tracks[0]!, clips: [{ ...clip, automation: [{ id: 'send', enabled: true, target: { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: track.id }, control: 'send' as const, returnId: 'unrelated' }, points: [] }] }] }] }
    expect(() => captureLibraryClip(c, invalid, track.id, clip.id, 'Unsafe', null)).toThrow(/external routing/)
  })
  it('loads the committed v7 origin fixture and drops unknown origins during migration from v6', () => {
    const raw = JSON.parse(readFileSync(new URL('../persistence/fixtures/v7-library.sfxlab.json', import.meta.url), 'utf8'))
    const result = parseProject(JSON.stringify(raw))
    expect(result.ok && result.project.libraryOrigins?.[0]?.itemId).toBe('library-instrument')
    raw.version = 6
    const old = parseProject(JSON.stringify(raw))
    expect(old.ok && old.project.libraryOrigins).toBeUndefined()
    expect(load(setup()).libraryOrigins).toBeUndefined()
  })
})

describe('isolated library preview documents', () => {
  it('renders instruments, audio/note effects, master and return effects without consulting or changing the source project', () => {
    const p = createEmptyProject(), scope = scopeOf(p), original = serializeProject(p)
    const returned = createReturnTrack('Return'), withReturn = { ...p, tracks: [...p.tracks, returned] }
    const cases = [
      { project: p, scope },
      { project: p, scope: scopeOf(p, 'fx') },
      { project: p, scope: scopeOf(p, 'notes') },
      { project: p, scope: { owner: { kind: 'master' as const }, domain: 'fx' as const } },
      { project: withReturn, scope: { owner: { kind: 'track' as const, trackId: returned.id }, domain: 'fx' as const } },
    ]
    for (const entry of cases) {
      const c = captureLibraryAsset(emptyLibrary(), entry.project, entry.scope, 'Preview', null)
      const preview = libraryPreviewProject(c, c.items[0]!)
      const audio = renderProject(load(preview), [], { scope: { kind: 'scene', scene: 0 }, bars: 0.25, maxTail: 0 })
      expect(audio.left.every(Number.isFinite)).toBe(true)
      expect(audio.left.some(value => Math.abs(value) > 0.01)).toBe(true)
      expect(preview.tracks[0]!.id).not.toBe(p.tracks[0]!.id)
    }
    expect(serializeProject(p)).toBe(original)
    const c = captureLibraryAsset(emptyLibrary(), withReturn, { owner: { kind: 'track', trackId: returned.id }, domain: 'fx' }, 'Return', null)
    expect(() => insertLibraryAsset(p, c, c.items[0]!, { mode: 'replace', scope: scopeOf(p, 'fx') })).toThrow(/routing/)
  })
  it('restoring a child restores its parent path while leaving unrelated trashed items alone', () => {
    let c = saveLibraryFolder(saveLibraryFolder(emptyLibrary(), 'A', null, 'a'), 'B', 'a', 'b')
    c = saveLibraryItem(c, { id: 's', name: 'S', folderId: 'b', content: { kind: 'sample', sampleId: sample('a').id } })
    c = trashLibraryEntry(c, 'a')
    c = trashLibraryEntry(c, 's', false)
    expect(c.folders.every(f => !f.trashed)).toBe(true)
    expect(browseLibrary(c)).toHaveLength(1)
  })
})
