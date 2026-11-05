import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createClip, createEmptyProject, createNote, createTrack, duplicateTrack, type InstrumentTrack, type Project } from '../project'
import { type ControlTarget, editControlBase, enumerateControlTargets, resolveControlTarget } from '../control'
import { createModuleUse, createNode, type ModuleDefinition } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { captureAsset, captureSnapshot, editSampleBinding, enumerateSampleTargets, inSnapshotScope, resolveSampleTarget, saveProjectPreset, type ProjectPreset, type SampleTarget, type SnapshotScope } from '../preset'
import { captureLibraryAsset, carryLibraryLinks, emptyLibrary, insertLibraryAsset, linkOf, linkShape, linkedSounds, presetFromLibrary, presetLink, presetToLibrary, recallLinkedPreset, trashLibraryEntry, type LibraryCatalog, type LinkedOrigin } from './index'

const load = (project: Project) => { const result = parseProject(serializeProject(project)); if (!result.ok) throw new Error(result.error); expect(result.warnings).toEqual([]); return result.project }
const fixture = () => { const result = parseProject(readFileSync(new URL('../persistence/fixtures/v6-presets.sfxlab.json', import.meta.url), 'utf8')); if (!result.ok) throw new Error(result.error); return result.project }
const track = (trackId: string) => ({ kind: 'track' as const, trackId })
const scopeOf = (project: Project, domain: 'patch' | 'fx' | 'notes' = 'patch', index = 0): SnapshotScope => ({ owner: track(project.tracks[index]!.id), domain })

/** A library holding `scope` of `project` as one sound, and that sound's item. */
const libraryOf = (project: Project, scope: SnapshotScope, name = 'Big bass') => {
  const catalog = captureLibraryAsset(emptyLibrary(), project, scope, name, null)
  return { catalog, item: catalog.items.find(i => i.content.kind !== 'preset')! }
}

/** An instrument whose graph uses a module that uses another, with knobs on both. */
const nested = (): Project => {
  const project = createEmptyProject(), first = project.tracks[0] as InstrumentTrack
  const oscillator = { ...createNode('oscillator', 0, 0), id: 'osc' }, knob = { ...createNode('control', 0, 0), id: 'knob' }
  const inner: ModuleDefinition = { id: 'inner', name: 'Inner', patch: { nodes: [oscillator, knob], connections: [] }, inputs: [], outputs: [{ id: 'osc:out', label: 'Out', inner: { node: 'osc', port: 'out' } }], knobs: [{ id: 'osc:frequency', label: 'Tune', node: 'osc', param: 'frequency' }, { id: 'osc:detune', label: 'Detune', node: 'osc', param: 'detune' }] }
  const use = { ...createModuleUse(inner, 0, 0), id: 'inner-use' }
  const outer: ModuleDefinition = { id: 'outer', name: 'Outer', patch: { nodes: [use], connections: [] }, inputs: [], outputs: [{ id: 'inner-use:osc:out', label: 'Out', inner: { node: use.id, port: 'osc:out' } }], knobs: [{ id: 'inner-use:osc:frequency', label: 'Nested', node: use.id, param: 'osc:frequency' }] }
  const root = { ...createModuleUse(outer, 0, 0), id: 'root' }, output = { ...createNode('output', 0, 0), id: 'output' }
  const patch = { nodes: [root, output], connections: [{ id: 'wire', from: { node: root.id, port: 'inner-use:osc:out' }, to: { node: output.id, port: 'in' } }] }
  return load({ ...project, tracks: [{ ...first, patch }], modules: [inner, outer] })
}

describe('writing library links', () => {
  it('links an inserted instrument, effect and note effect with the shape of the graph it installed', () => {
    const source = fixture()
    for (const domain of ['patch', 'fx', 'notes'] as const) {
      const { catalog, item } = libraryOf(source, scopeOf(source, domain))
      const target = createEmptyProject()
      const { project, scope } = domain === 'patch'
        ? insertLibraryAsset(target, catalog, item, { mode: 'new-track' })
        : insertLibraryAsset(target, catalog, item, { mode: 'replace', scope: scopeOf(target, domain) })
      const found = linkOf(project, scope.owner, domain)!
      expect(found.live).toBe(true)
      expect(found.origin).toMatchObject({ itemId: item.id, owner: scope.owner, trackId: (scope.owner as { trackId: string }).trackId, domain })
      expect(found.origin.link.shape).toBe(linkShape(captureAsset(project, scope)))
      // Every library node is mapped to a node of the copy.
      const revision = catalog.revisions[0]!.payload, copied = captureAsset(project, scope)
      const nodesOf = (payload: typeof revision) => [...(payload.kind === 'instrument' ? [payload.patch, payload.noteGraph] : [payload.graph]), ...payload.modules.map(m => m.patch)].flatMap(g => g.nodes.map(n => n.id))
      expect(new Set(found.origin.link.nodes.map(([library]) => library))).toEqual(new Set(nodesOf(revision)))
      expect(new Set(found.origin.link.nodes.map(([, copy]) => copy))).toEqual(new Set(nodesOf(copied)))
      expect(load(project)).toEqual(project)
    }
  })

  it("maps a nested module's knobs and ports by index into the copied module", () => {
    const source = nested(), { catalog, item } = libraryOf(source, scopeOf(source))
    const { project, scope } = insertLibraryAsset(createEmptyProject(), catalog, item, { mode: 'new-track' })
    const { link } = linkOf(project, scope.owner, 'patch')!.origin
    const nodes = new Map(link.nodes), modules = new Map(link.modules)
    expect(link.modules).toHaveLength(2)
    for (const original of catalog.revisions[0]!.payload.modules) {
      const copy = project.modules.find(m => m.id === modules.get(original.id))!
      expect(copy.knobs.map(k => k.node)).toEqual(original.knobs.map(k => nodes.get(k.node)))
      expect(copy.knobs.map(k => k.label)).toEqual(original.knobs.map(k => k.label))
      expect(copy.outputs.map(p => p.inner.node)).toEqual(original.outputs.map(p => nodes.get(p.inner.node)))
    }
  })

  it('carries the link onto a duplicate, whose node IDs are the original\'s', () => {
    const source = fixture(), { catalog, item } = libraryOf(source, scopeOf(source))
    const inserted = insertLibraryAsset(createEmptyProject(), catalog, item, { mode: 'new-track' })
    const from = (inserted.scope.owner as { trackId: string }).trackId
    const duplicated = duplicateTrack(inserted.project, from)
    const project = carryLibraryLinks(duplicated.project, from, duplicated.trackId!)
    const copy = linkOf(project, track(duplicated.trackId!), 'patch')!, original = linkOf(project, track(from), 'patch')!
    expect(copy.live).toBe(true)
    expect(copy.origin).toEqual({ ...original.origin, trackId: duplicated.trackId, owner: track(duplicated.trackId!) })
    // A track with no link carries none.
    expect(carryLibraryLinks(project, project.tracks[0]!.id, from)).toBe(project)
  })

  it("carries the source's link onto a project graph copied to another owner, composed with the copy's maps", () => {
    const source = fixture(), { catalog, item } = libraryOf(source, scopeOf(source))
    const inserted = insertLibraryAsset(createEmptyProject(), catalog, item, { mode: 'new-track' })
    const from = inserted.scope
    // A throwaway capture of the inserted track, as *Copy to new track* makes.
    const throwaway: LibraryCatalog = captureLibraryAsset(emptyLibrary(), inserted.project, from, 'Big bass copy', null)
    const copy = insertLibraryAsset(inserted.project, throwaway, throwaway.items[0]!, { mode: 'new-track', carry: from })
    const found = linkOf(copy.project, copy.scope.owner, 'patch')!
    expect(found.live).toBe(true)
    expect(found.origin.itemId).toBe(item.id)
    expect(found.origin.revisionId).toBe(catalog.revisions[0]!.id)
    const source2 = new Map(linkOf(copy.project, from.owner, 'patch')!.origin.link.nodes), copied = new Map(found.origin.link.nodes)
    expect([...copied.keys()]).toEqual([...source2.keys()])
    expect([...copied.values()].some(id => [...source2.values()].includes(id))).toBe(false)
    // Without a live link at the source, the copy has none either.
    const plain = createEmptyProject(), other = captureLibraryAsset(emptyLibrary(), plain, scopeOf(plain), 'Plain', null)
    const unlinked = insertLibraryAsset(plain, other, other.items[0]!, { mode: 'new-track', carry: scopeOf(plain) })
    expect(linkOf(unlinked.project, unlinked.scope.owner, 'patch')).toBeUndefined()
    expect(unlinked.project.libraryOrigins!.at(-1)!.itemId).toBe(other.items[0]!.id)
  })

  it('records no link when the project is at the bound of link pairs', () => {
    const source = fixture(), { catalog, item } = libraryOf(source, scopeOf(source))
    const full = { ...createEmptyProject(), libraryOrigins: Array.from({ length: 8 }, (_, i) => ({ itemId: `x${i}`, link: { shape: '0123456789abcdef', nodes: Array.from({ length: 2048 }, (_, n) => [`a${n}`, `b${n}`] as const), modules: [] } })) }
    const { project, scope } = insertLibraryAsset(full, catalog, item, { mode: 'new-track' })
    expect(project.libraryOrigins!.at(-1)).toMatchObject({ itemId: item.id, owner: scope.owner })
    expect(project.libraryOrigins!.at(-1)!.link).toBeUndefined()
  })

  it('leaves a second track of the same sound with its own link', () => {
    const source = fixture(), { catalog, item } = libraryOf(source, scopeOf(source))
    const first = insertLibraryAsset(createEmptyProject(), catalog, item, { mode: 'new-track' })
    const second = insertLibraryAsset({ ...first.project, tracks: [...first.project.tracks, createTrack('Spare', 1)] }, catalog, item, { mode: 'new-track' })
    const a = linkOf(second.project, first.scope.owner, 'patch')!, b = linkOf(second.project, second.scope.owner, 'patch')!
    expect(a.live && b.live).toBe(true)
    expect(a.origin.link.shape).not.toBe(b.origin.link.shape)
  })
})

/**
 * A library whose sound (*Big bass*, the v6 sampler) has a preset *Bright*: a control turned and the first sample
 * choice set to the sample it doesn't use. The sound's own state is the fixture's.
 */
const brightLibrary = () => {
  const source = fixture(), scope = scopeOf(source)
  const control = enumerateControlTargets(source).find((t): t is Extract<ControlTarget, { kind: 'graph' }> => t.kind === 'graph' && inSnapshotScope(t, scope) && t.nodeType === 'control')!
  const choice = enumerateSampleTargets(source).filter(t => inSnapshotScope(t, scope))[0]!
  let bright = editControlBase(source, control, 37).project
  const current = resolveSampleTarget(source, choice)
  bright = editSampleBinding(bright, { target: choice, sampleId: source.samples.find(s => current.status !== 'available' || s.id !== current.sampleId)!.id })
  bright = saveProjectPreset(bright, scope, 'Bright')
  const withPreset = { ...source, presets: bright.presets, assetRevisions: bright.assetRevisions }
  const catalog = captureLibraryAsset(emptyLibrary(), withPreset, scope, 'Big bass', null)
  return { catalog, sound: catalog.items.find(i => i.content.kind !== 'preset')!, bright: catalog.items.find(i => i.name === 'Bright')! }
}
const stateOf = (item: { content: unknown }) => (item.content as { state: ProjectPreset }).state

/** An owner's values and sample choices, keyed in library IDs through the link backward: comparable across copies. */
const libraryView = (project: Project, scope: SnapshotScope, origin: LinkedOrigin) => {
  const nodes = new Map(origin.link.nodes.map(([library, copy]) => [copy, library])), modules = new Map(origin.link.modules.map(([library, copy]) => [copy, library]))
  const key = (t: ControlTarget | SampleTarget) => t.kind === 'graph' ? JSON.stringify([t.domain, t.path.map(s => [nodes.get(s.nodeId), modules.get(s.moduleId)]), nodes.get(t.nodeId), 'paramId' in t ? t.paramId : '']) : ''
  const scopes = [scope, { ...scope, domain: 'notes' as const }]
  return {
    values: Object.fromEntries(scopes.flatMap(each => captureSnapshot(project, each, '').values.map(v => [key(v.target), v.value]))),
    samples: Object.fromEntries(enumerateSampleTargets(project).filter(t => scopes.some(each => inSnapshotScope(t, each))).map(t => { const r = resolveSampleTarget(project, t); return [key(t), r.status === 'available' ? r.sampleId : r.status] })),
  }
}

describe('using library links', () => {
  it('recalls a library preset onto an inserted sound as inserting that preset does, values and sample choices both', () => {
    const { catalog, sound, bright } = brightLibrary()
    const inserted = insertLibraryAsset(createEmptyProject(), catalog, sound, { mode: 'new-track' })
    const origin = linkOf(inserted.project, inserted.scope.owner, 'patch')!.origin
    const states = linkedSounds(catalog, origin).states
    expect(states[0]).toBe(sound)
    expect(new Set(states.map(i => i.name))).toEqual(new Set(['Big bass', 'Bright', 'Preset A']))
    const recalled = recallLinkedPreset(inserted.project, origin, presetFromLibrary(origin, stateOf(bright)))
    expect(recalled.issues).toEqual([])
    const direct = insertLibraryAsset(createEmptyProject(), catalog, bright, { mode: 'new-track' })
    const expected = libraryView(direct.project, direct.scope, linkOf(direct.project, direct.scope.owner, 'patch')!.origin)
    const actual = libraryView(recalled.project, inserted.scope, origin)
    expect(actual).toEqual(expected)
    // Bright differs from the sound in a value and in a sample choice, so the recall did something.
    const before = libraryView(inserted.project, inserted.scope, origin)
    expect(actual.values).not.toEqual(before.values)
    expect(actual.samples).not.toEqual(before.samples)
  })

  it('stays live through a knob change and dies with a rewire, after which a recall refuses', () => {
    const { catalog, sound, bright } = brightLibrary()
    const { project, scope } = insertLibraryAsset(createEmptyProject(), catalog, sound, { mode: 'new-track' })
    const control = enumerateControlTargets(project).find(t => t.kind === 'graph' && inSnapshotScope(t, scope) && t.nodeType === 'control')!
    const turned = editControlBase(project, control, 12).project
    expect(linkOf(turned, scope.owner, 'patch')!.live).toBe(true)
    const owner = scope.owner as { trackId: string }
    const rewired: Project = { ...turned, tracks: turned.tracks.map(t => t.id === owner.trackId && t.kind === 'instrument' ? { ...t, patch: { ...t.patch, nodes: [...t.patch.nodes, { ...createNode('gain', 0, 0), id: 'added' }] } } : t) }
    const dead = linkOf(rewired, scope.owner, 'patch')!
    expect(dead.live).toBe(false)
    expect(() => recallLinkedPreset(rewired, dead.origin, presetFromLibrary(dead.origin, stateOf(bright)))).toThrow('This sound has changed since it came from the library')
  })

  it('keeps automation lanes and MIDI mappings through a library recall', () => {
    const { catalog, sound, bright } = brightLibrary()
    const inserted = insertLibraryAsset(createEmptyProject(), catalog, sound, { mode: 'new-track' })
    const owner = inserted.scope.owner as { trackId: string }
    const control = enumerateControlTargets(inserted.project).find(t => t.kind === 'graph' && inSnapshotScope(t, inserted.scope) && t.nodeType === 'control')!
    const lane = { id: 'lane', target: control, enabled: true, points: [{ id: 'p0', beat: 0, value: 20, interpolation: 'linear' as const }, { id: 'p1', beat: 2, value: 80, interpolation: 'linear' as const }] }
    const mapping = { id: 'map', deviceId: 'dev', deviceName: 'Knobs', channel: 0, cc: 21, target: control, pickup: false }
    const project: Project = { ...inserted.project, midiMappings: [mapping], tracks: inserted.project.tracks.map(t => t.id === owner.trackId && t.kind === 'instrument' ? { ...t, clips: [{ ...createClip('Tone', 4, [createNote(60, 0, 4)]), automation: [lane] }, ...t.clips.slice(1)] } : t) }
    const origin = linkOf(project, inserted.scope.owner, 'patch')!.origin
    const recalled = recallLinkedPreset(project, origin, presetFromLibrary(origin, stateOf(bright))).project
    expect(recalled.midiMappings).toEqual([mapping])
    const clipOf = (value: Project) => (value.tracks.find(t => t.id === owner.trackId) as InstrumentTrack).clips[0]!
    expect(clipOf(recalled).automation).toEqual([lane])
    expect(resolveControlTarget(recalled, control)).toMatchObject({ status: 'available' })
  })

  it('saves a project preset back into the library sound, which a fresh project then recalls', () => {
    const { catalog, sound } = brightLibrary()
    const inserted = insertLibraryAsset(createEmptyProject(), catalog, sound, { mode: 'new-track' })
    const control = enumerateControlTargets(inserted.project).find(t => t.kind === 'graph' && inSnapshotScope(t, inserted.scope) && t.nodeType === 'control')!
    const deep = saveProjectPreset(editControlBase(inserted.project, control, 63).project, inserted.scope, 'Deep')
    const preset = deep.presets!.find(p => p.name === 'Deep')!
    const origin = presetLink(deep, preset)!
    expect(origin.itemId).toBe(sound.id)
    const saved = presetToLibrary(deep, catalog, origin, preset)
    expect(saved.item).toMatchObject({ name: 'Deep', folderId: sound.folderId, content: { kind: 'preset', assetId: sound.id, revisionId: origin.revisionId } })
    expect(stateOf(saved.item).scope.owner).toEqual(stateOf(sound).scope.owner)
    // A fresh project, with the sound inserted again: Deep is one of its states, and recalls as it was saved.
    const fresh = insertLibraryAsset(createEmptyProject(), saved.catalog, sound, { mode: 'new-track' })
    const link = linkOf(fresh.project, fresh.scope.owner, 'patch')!.origin
    const deepItem = linkedSounds(saved.catalog, link).states.find(i => i.name === 'Deep')!
    const recalled = recallLinkedPreset(fresh.project, link, presetFromLibrary(link, stateOf(deepItem)))
    expect(recalled.issues).toEqual([])
    expect(libraryView(recalled.project, fresh.scope, link)).toEqual(libraryView(deep, inserted.scope, origin))
  })

  it('refuses to save back into a trashed or gone sound, and finds no link for a preset saved after a rewire', () => {
    const { catalog, sound } = brightLibrary()
    const inserted = insertLibraryAsset(createEmptyProject(), catalog, sound, { mode: 'new-track' })
    const deep = saveProjectPreset(inserted.project, inserted.scope, 'Deep'), preset = deep.presets!.at(-1)!
    const origin = presetLink(deep, preset)!
    expect(linkedSounds(trashLibraryEntry(catalog, sound.id), origin)).toMatchObject({ trashed: true, states: [] })
    expect(() => presetToLibrary(deep, trashLibraryEntry(catalog, sound.id), origin, preset)).toThrow('The library sound is in the trash')
    expect(() => presetToLibrary(deep, emptyLibrary(), origin, preset)).toThrow('The library sound is gone')
    const owner = inserted.scope.owner as { trackId: string }
    const rewired: Project = { ...deep, tracks: deep.tracks.map(t => t.id === owner.trackId && t.kind === 'instrument' ? { ...t, patch: { ...t.patch, nodes: [...t.patch.nodes, { ...createNode('gain', 0, 0), id: 'added' }] } } : t) }
    const later = saveProjectPreset(rewired, inserted.scope, 'Later')
    expect(presetLink(later, later.presets!.at(-1)!)).toBeUndefined()
    expect(presetLink(later, preset)).toEqual(origin)
  })

  it('resolves an origin naming a preset to its sound', () => {
    const { catalog, sound, bright } = brightLibrary()
    const { project, scope } = insertLibraryAsset(createEmptyProject(), catalog, bright, { mode: 'new-track' })
    const origin = linkOf(project, scope.owner, 'patch')!.origin
    expect(origin.itemId).toBe(bright.id)
    expect(linkedSounds(catalog, origin).sound).toBe(sound)
  })
})
