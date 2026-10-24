import { expect, it, vi } from 'vitest'
import { captureLibraryAsset } from './assets'
import { emptyLibrary } from './types'
import { validateLibraryCatalog, selectLibraryBundle } from './bundle'
import { createEmptyProject } from '../project'
import * as assets from './assets'

it('validates a legal 1024-folder chain without repeated linear searches and still rejects cycles/missing/duplicate IDs', () => {
  for (const n of [128, 512, 1024]) {
    const folders = Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: 'Folder', parentId: i ? `f${i - 1}` : null }))
    const catalog = { ...emptyLibrary(), folders }
    const find = vi.spyOn(folders, 'find')
    expect(validateLibraryCatalog(catalog)).toBe(catalog)
    expect(find).not.toHaveBeenCalled(); find.mockRestore()
    expect(selectLibraryBundle(catalog, { folderIds: [`f${n - 1}`] }).folders).toHaveLength(n)
    expect(() => validateLibraryCatalog({ ...catalog, folders: [{ ...folders[0]!, parentId: `f${n - 1}` }, ...folders.slice(1)] })).toThrow(/cycle/)
    expect(() => validateLibraryCatalog({ ...catalog, folders: [{ ...folders[0]!, parentId: 'missing' }, ...folders.slice(1)] })).toThrow(/missing folder/)
    expect(() => validateLibraryCatalog({ ...catalog, folders: [...folders.slice(0, -1), folders[0]] })).toThrow(/duplicate/)
  }
})
it('shares graph instantiation only for identical sounds while every state still receives strict validation', () => {
  const p = createEmptyProject(), scope = { owner: { kind: 'track' as const, trackId: p.tracks[0]!.id }, domain: 'patch' as const }
  const catalog = captureLibraryAsset(emptyLibrary(), p, scope, 'Asset', null), asset = catalog.items[0]!
  if (!('state' in asset.content)) throw new Error('missing asset')
  const content = asset.content
  const shared = { ...catalog, items: [asset, ...Array.from({ length: 64 }, (_, i) => ({ ...asset, id: `sound${i}`, content: { kind: 'preset' as const, assetId: asset.id, revisionId: content.revisionId, state: { ...content.state, id: `state${i}`, name: `Sound ${i}` } } }))] }
  const insert = vi.spyOn(assets, 'insertLibraryAsset')
  try {
    validateLibraryCatalog(shared); expect(insert).toHaveBeenCalledTimes(1)
    const forged = structuredClone(shared)
    Object.assign(forged.items.at(-1)!.content, { extra: 'reject' })
    expect(() => validateLibraryCatalog(forged)).toThrow(/unknown fields/)
    const badValue = structuredClone(shared), last = badValue.items.at(-1)!.content
    if (!('state' in last)) throw new Error('missing state')
    Object.assign(last.state, { values: [{ target: { kind: 'graph', owner: scope.owner, domain: 'patch', path: [], nodeId: 'missing', nodeType: 'control', paramId: 'value' }, value: 0.5 }] })
    expect(() => validateLibraryCatalog(badValue)).toThrow(/unavailable/)
  } finally { insert.mockRestore() }
})
it('refuses embedded project-owner clip lanes in strict portable records instead of silently rebinding them', () => {
  const catalog = { ...emptyLibrary(), items: [{ id: 'clip', name: 'C', folderId: null, content: { kind: 'midi-clip' as const, clip: { id: 'c', name: 'C', lengthBeats: 4, notes: [], automation: [{ id: 'foreign', enabled: true, target: { kind: 'mixer' as const, owner: { kind: 'master' as const }, control: 'volume' as const }, points: [] }] }, lanes: [] } }] }
  expect(() => validateLibraryCatalog(catalog)).toThrow(/owner-relative/)
})
