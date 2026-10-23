import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { enumerateControlTargets } from '../control'
import { captureLibraryAsset, captureLibraryClip, emptyLibrary, insertLibraryClip, validateLibraryCatalog } from '../library'
import { createClip, createEmptyProject, createNote, type InstrumentTrack, type Project } from '../project'
import { assetSignature, captureAsset, recallProjectPreset, type AssetPayload } from '../preset'
import type { Patch } from '../patch'
import { parseProject } from './project-file'
import { canonicalPortableSignature, upgradeLibraryCatalog } from './index'
import type { LibraryCatalog } from '../library'

const legacyAssetSignature = (payload: AssetPayload, locale: string): string => {
  const shape = (graph: Patch) => ({
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id, locale)).map(n => ({
      id: n.id, type: n.type, moduleId: n.moduleId, stereo: n.stereo ?? false, bypassed: n.bypassed ?? false,
      config: ['control', 'xy', 'switch', 'selector'].includes(n.type)
        ? Object.fromEntries(Object.entries(n.params).filter(([key]) => !['value', 'x', 'y', 'on', 'index'].includes(key)).sort(([a], [b]) => a.localeCompare(b, locale)))
        : undefined,
    })),
    connections: graph.connections.map(c => [c.from.node, c.from.port, c.to.node, c.to.port]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), locale)),
  })
  return JSON.stringify([
    payload.kind,
    payload.kind === 'instrument' ? [shape(payload.patch), shape(payload.noteGraph), payload.voices] : shape(payload.graph),
    [...payload.modules].sort((a, b) => a.id.localeCompare(b.id, locale)).map(m => [m.id,
      m.inputs.map(p => [p.id, p.inner.node, p.inner.port]).sort(),
      m.outputs.map(p => [p.id, p.inner.node, p.inner.port]).sort(),
      m.knobs.map(k => [k.id, k.node, k.param]).sort(), shape(m.patch),
    ]),
  ])
}

const replaceRootNodeIds = (payload: AssetPayload): AssetPayload => {
  if (payload.kind !== 'instrument') return payload
  const replacement = ['ä', 'z', 'A', 'a-']
  const ids = new Map(payload.patch.nodes.map((node, index) => [node.id, replacement[index] ?? node.id]))
  const patch: Patch = {
    ...payload.patch,
    nodes: payload.patch.nodes.map(node => ({ ...node, id: ids.get(node.id)! })),
    connections: payload.patch.connections.map(connection => ({
      ...connection,
      from: { ...connection.from, node: ids.get(connection.from.node)! },
      to: { ...connection.to, node: ids.get(connection.to.node)! },
    })),
  }
  return { ...payload, patch }
}

const projectFixture = (): Project => {
  const text = readFileSync(new URL('./fixtures/v6-presets.sfxlab.json', import.meta.url), 'utf8')
  const parsed = parseProject(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.project
}

const assetCatalogFixture = () => {
  const project = createEmptyProject()
  const track = project.tracks[0] as InstrumentTrack
  const scope = { owner: { kind: 'track' as const, trackId: track.id }, domain: 'patch' as const }
  const captured = captureAsset(project, scope)
  if (captured.kind !== 'instrument') throw new Error('Expected instrument payload')
  const payload = replaceRootNodeIds(captured)
  const catalog = captureLibraryAsset(emptyLibrary(), project, scope, 'Asset', null)
  const revision = catalog.revisions[0]!
  const v1 = { ...catalog, version: 1, revisions: [{ ...revision, payload, signature: legacyAssetSignature(payload, 'en') }] }
  return { catalog: v1, payload, revision }
}

const legacyCatalog = (catalog: LibraryCatalog, locale: string) => ({
  ...catalog,
  version: 1,
  revisions: catalog.revisions.map(revision => ({ ...revision, signature: legacyAssetSignature(revision.payload, locale) })),
})

const portableFixture = () => {
  let project = createEmptyProject(), track = project.tracks[0] as InstrumentTrack
  const target = enumerateControlTargets(project).find(t => t.kind === 'graph' && t.owner.kind === 'track' && t.owner.trackId === track.id)
  if (!target || target.kind !== 'graph') throw new Error('Expected graph control target')
  const clip = { ...createClip('MIDI', 4, [createNote(60, 0, 1)]), automation: [{ id: 'lane', enabled: true, target, points: [] }] }
  track = { ...track, clips: [clip, ...track.clips.slice(1)] }
  project = { ...project, tracks: [track] }
  const catalog = captureLibraryClip(emptyLibrary(), project, track.id, clip.id, 'Clip', null)
  const item = catalog.items[0]!
  if (item.content.kind !== 'midi-clip') throw new Error('Expected MIDI clip')
  const lane = item.content.lanes[0]!
  if (lane.target.kind !== 'graph') throw new Error('Expected graph lane')
  return { project, track, clip, catalog, item, lane }
}

describe('signature format migration', () => {
  it('converts en and sv legacy collations and preserves revision IDs and payload meaning', () => {
    const { catalog, payload, revision } = assetCatalogFixture()
    const before = structuredClone(catalog)
    const en = legacyAssetSignature(payload, 'en')
    const sv = legacyAssetSignature(payload, 'sv')
    expect(en).not.toBe(sv)

    for (const signature of [en, sv]) {
      const v1 = { ...(catalog as object), revisions: [{ ...revision, payload, signature }] }
      const upgraded = upgradeLibraryCatalog(v1)
      expect(upgraded.version).toBe(2)
      expect(upgraded.revisions[0]).toMatchObject({ id: revision.id, payload })
      expect(upgraded.revisions[0]!.signature).toBe(assetSignature(payload))
    }
    expect(catalog).toEqual(before)
  })

  it('migrates nested module assets and sample closure without changing opaque IDs or metadata', () => {
    const project = projectFixture()
    const track = project.tracks.find(t => t.kind === 'instrument') as InstrumentTrack | undefined
    if (!track) throw new Error('Fixture has no instrument track')
    const catalog = captureLibraryAsset(emptyLibrary(), project, { owner: { kind: 'track', trackId: track.id }, domain: 'patch' }, 'Nested', null)
    expect(catalog.revisions.some(r => r.payload.modules.length > 0)).toBe(true)
    expect(catalog.samples.length).toBeGreaterThan(0)
    const before = structuredClone(catalog)
    const v1 = legacyCatalog(catalog, 'sv')
    const upgraded = upgradeLibraryCatalog(v1)

    expect(upgraded.version).toBe(2)
    expect(upgraded.folders.map(f => f.id)).toEqual(before.folders.map(f => f.id))
    expect(upgraded.items.map(i => i.id)).toEqual(before.items.map(i => i.id))
    expect(upgraded.revisions.map(r => r.id)).toEqual(before.revisions.map(r => r.id))
    expect(upgraded.samples).toEqual(before.samples)
    expect(upgraded.revisions.map(r => r.payload)).toEqual(before.revisions.map(r => r.payload))
    expect(upgraded.revisions.flatMap(r => r.payload.modules.map(m => m.id))).toEqual(before.revisions.flatMap(r => r.payload.modules.map(m => m.id)))
    expect(upgraded.items.flatMap(i => 'state' in i.content ? [i.content.state.id] : [])).toEqual(before.items.flatMap(i => 'state' in i.content ? [i.content.state.id] : []))
    expect(upgraded.items).toEqual(before.items)
  })

  it('rejects opaque or forged legacy asset signatures instead of normalizing them into trust', () => {
    const { catalog } = assetCatalogFixture()
    const revisions = (catalog as { revisions: { signature: string }[] }).revisions
    for (const signature of ['forged', JSON.stringify(['instrument', {}, []]), `${revisions[0]!.signature.slice(0, -1)},"extra"]`]) {
      const bad = { ...(catalog as object), revisions: [{ ...revisions[0]!, signature }] }
      expect(() => upgradeLibraryCatalog(bad)).toThrow(/Original data retained/)
    }
  })

  it('canonicalizes portable config and connection order while retaining flattened node order and indexes', () => {
    const legacy = JSON.stringify([
      [
        ['control', false, false, [['z-key', 10], ['A-key', 1], ['a-key', 2]]],
        ['filter', false, false, null],
        ['switch', true, false, [['offValue', 0], ['mode', 1]]],
      ],
      [[1, 'out', 0, 'value'], [2, 'out', 1, 'in']],
    ])
    const canonical = canonicalPortableSignature(legacy)
    const [nodes, connections] = JSON.parse(canonical)
    expect(nodes.map((node: unknown[]) => node[0])).toEqual(['control', 'filter', 'switch'])
    expect(nodes[0]![3]).toEqual([['A-key', 1], ['a-key', 2], ['z-key', 10]])
    expect(connections).toEqual([[1, 'out', 0, 'value'], [2, 'out', 1, 'in']])
    expect(canonicalPortableSignature(JSON.stringify([nodes, [...connections].reverse()]))).toBe(canonical)

    const malformed = [
      [[['filter', false, false, null]], [[1, 'out', 0, 'in']]],
      [[['control', false, false, [['min', 1], ['min', 2]]]], []],
      [[['control', false, false, [['min', 'bad']]]], []],
    ]
    for (const value of malformed) expect(() => canonicalPortableSignature(JSON.stringify(value))).toThrow(/Original data retained/)
  })

  it('rejects portable lane index and node-type mismatches during migration', () => {
    const { catalog, item, lane } = portableFixture()
    if (item.content.kind !== 'midi-clip') throw new Error('Expected MIDI clip')
    const badIndex = { ...catalog, version: 1, items: [{ ...item, content: { ...item.content, lanes: [{ ...lane, nodeIndex: 10000 }] } }] }
    const badType = { ...catalog, version: 1, items: [{ ...item, content: { ...item.content, lanes: [{ ...lane, target: { ...lane.target, nodeType: 'forged' } }] } }] }
    expect(() => upgradeLibraryCatalog(badIndex)).toThrow(/Original data retained/)
    expect(() => upgradeLibraryCatalog(badType)).toThrow(/Original data retained/)
  })

  it('upgrades a portable clip and inserts its lane into a compatible destination', () => {
    const { project, track, item, lane, catalog } = portableFixture()
    if (item.content.kind !== 'midi-clip' || lane.target.kind !== 'graph') throw new Error('Expected graph MIDI lane')
    const parsed = JSON.parse(lane.graphSignature!) as [unknown[][], unknown[][]]
    const legacySignature = JSON.stringify([parsed[0], [...parsed[1]].reverse()])
    const v1 = { ...catalog, version: 1, items: [{ ...item, content: { ...item.content, lanes: [{ ...lane, graphSignature: legacySignature }] } }] }
    const upgraded = upgradeLibraryCatalog(v1)
    const upgradedItem = upgraded.items[0]!
    const inserted = insertLibraryClip(project, upgraded, upgradedItem, track.id, 1)
    expect(inserted.issues).toEqual([])
    const destination = inserted.project.tracks.find(t => t.id === track.id) as InstrumentTrack
    expect(destination.clips[1]?.automation).toHaveLength(1)
  })

  it('strict catalog validation rejects opaque current portable signatures', () => {
    const { catalog, item, lane } = portableFixture()
    const opaque = { ...catalog, version: 2, items: [{ ...item, content: { ...item.content, lanes: [{ ...lane, graphSignature: 'opaque' }] } }] }
    expect(() => validateLibraryCatalog(opaque)).toThrow(/portable|signature|Invalid library/)
  })

  it('reads a v8 project fixture as v9, recomputes its signatures, and recalls its preset', () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/v6-presets.sfxlab.json', import.meta.url), 'utf8'))
    raw.version = 8
    const oldSignature = raw.project.assetRevisions[0].signature
    const parsed = parseProject(JSON.stringify(raw))
    if (!parsed.ok) throw new Error(parsed.error)
    expect(typeof oldSignature).toBe('string')
    expect(parsed.project.assetRevisions?.[0]?.signature).toBe(assetSignature(parsed.project.assetRevisions![0]!.payload))
    const preset = parsed.project.presets?.[0]
    if (!preset) throw new Error('Fixture has no preset')
    expect(recallProjectPreset(parsed.project, preset).issues).toEqual([])
  })

  it('asset signatures never call localeCompare', () => {
    const project = createEmptyProject(), track = project.tracks[0] as InstrumentTrack
    const payload = captureAsset(project, { owner: { kind: 'track', trackId: track.id }, domain: 'patch' })
    const spy = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => { throw new Error('localeCompare must not be used') })
    try {
      expect(assetSignature(payload)).toContain('"instrument"')
    } finally {
      spy.mockRestore()
    }
  })
})
