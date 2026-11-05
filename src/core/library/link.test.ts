import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createEmptyProject, createTrack, duplicateTrack, type InstrumentTrack, type Project } from '../project'
import { createModuleUse, createNode, type ModuleDefinition } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { captureAsset, type SnapshotScope } from '../preset'
import { captureLibraryAsset, carryLibraryLinks, emptyLibrary, insertLibraryAsset, linkOf, linkShape, type LibraryCatalog } from './index'

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
