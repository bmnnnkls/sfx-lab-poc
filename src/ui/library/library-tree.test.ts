import { describe, expect, it } from 'vitest'
import { ancestorsOf, expandedFor, folderKey, INITIAL_EXPANDED, itemKey, libraryRows, type LibraryRow, treeKey } from './library-tree'

const folder = (id: string, name: string, parentId: string | null, trashed = false) => ({ id, name, parentId, ...(trashed ? { trashed } : {}) })
const item = (id: string, name: string, folderId: string | null, kind = 'instrument', trashed = false) => ({ id, name, folderId, content: { kind }, ...(trashed ? { trashed } : {}) })
const preset = (id: string, name: string, assetId: string, folderId: string | null, trashed = false) => ({ id, name, folderId, content: { kind: 'preset', assetId }, ...(trashed ? { trashed } : {}) })

/**
 * Drums > Kicks (Kick 10, Kick 2 with presets Tight and Boom, Boom kept in Pads), Backbeat; Pads (Pad, Orphan: a preset
 * whose sound is gone); a top-level Sweep. In the trash: Old (with Snare inside) and Hat trashed alone from Drums.
 */
const catalog = {
  folders: [folder('drums', 'Drums', null), folder('kicks', 'Kicks', 'drums'), folder('pads', 'Pads', null), folder('old', 'Old', null, true)],
  items: [
    item('k10', 'Kick 10', 'kicks'), item('k2', 'Kick 2', 'kicks'), preset('tight', 'Tight', 'k2', 'kicks'), preset('boom', 'Boom', 'k2', 'pads'),
    item('beat', 'Backbeat', 'drums', 'midi-clip'), item('pad', 'Pad', 'pads'), preset('orphan', 'Orphan', 'gone', 'pads'), item('sweep', 'Sweep', null, 'audio-clip'),
    item('snare', 'Snare', 'old', 'sample', true), item('hat', 'Hat', 'drums', 'sample', true),
  ],
} as unknown as Parameters<typeof libraryRows>[0]
const ALL = new Set(['mine', 'trash', folderKey('drums'), folderKey('kicks'), folderKey('pads'), folderKey('old'), itemKey('k2')])
const names = (rows: readonly LibraryRow[]) => rows.map((row) => `${'  '.repeat(row.level - 1)}${row.name}`)

describe('library tree rows', () => {
  it('shows both roots, folders first and then items, by name with numbers in order, presets under their sound', () => {
    const rows = libraryRows(catalog, { expanded: ALL })
    expect(names(rows)).toEqual([
      'My library', '  Drums', '    Kicks', '      Kick 2', '        Boom', '        Tight', '      Kick 10', '    Backbeat', '  Pads', '    Orphan', '    Pad', '  Sweep',
      'Trash', '  Old', '    Snare', '  Hat',
    ])
    expect(rows.map((row) => row.kind).join(' ')).toBe('root folder folder item preset preset item item folder item item item root folder item item')
    expect(rows.find((row) => row.name === 'Kick 2')).toMatchObject({ kind: 'item', presets: 2, expanded: true, parent: folderKey('kicks') })
    expect(rows.find((row) => row.name === 'Boom')).toMatchObject({ kind: 'preset', assetId: 'k2', parent: itemKey('k2'), level: 5 })
    expect(rows.find((row) => row.name === 'Hat')).toMatchObject({ root: 'trash', parent: 'trash', level: 2 })
  })

  it('counts the items in each folder and root, and starts with only My library open', () => {
    const rows = libraryRows(catalog, { expanded: ALL })
    const count = (name: string) => (rows.find((row) => row.name === name) as { count: number }).count
    expect([count('My library'), count('Drums'), count('Kicks'), count('Pads'), count('Trash'), count('Old')]).toEqual([6, 1, 2, 2, 2, 1])
    expect(names(libraryRows(catalog, { expanded: INITIAL_EXPANDED }))).toEqual(['My library', '  Drums', '  Pads', '  Sweep', 'Trash'])
  })

  it('searches names with their folders above them, presets by their sound too, and the trash only while open', () => {
    expect(names(libraryRows(catalog, { expanded: new Set(), query: 'kick 2' }))).toEqual(['My library', '  Drums', '    Kicks', '      Kick 2', '        Boom', '        Tight', 'Trash'])
    expect(names(libraryRows(catalog, { expanded: new Set(), query: 'TIGHT' }))).toEqual(['My library', '  Drums', '    Kicks', '      Kick 2', '        Tight', 'Trash'])
    expect(names(libraryRows(catalog, { expanded: new Set(['trash']), query: 'a' }))).toContain('    Snare')
    expect(names(libraryRows(catalog, { expanded: new Set(), query: 'a' }))).not.toContain('    Snare')
    expect(names(libraryRows(catalog, { expanded: new Set(), kind: 'midi-clip' }))).toEqual(['My library', '  Drums', '    Backbeat', 'Trash'])
    expect(libraryRows(catalog, { expanded: new Set(), query: 'nothing' })[0]).toMatchObject({ hasChildren: false, count: 0 })
  })

  it("finds a row's ancestors, a preset's sound included, and expands them", () => {
    expect(ancestorsOf(catalog, itemKey('boom'))).toEqual([itemKey('k2'), folderKey('kicks'), folderKey('drums'), 'mine'])
    expect(ancestorsOf(catalog, itemKey('orphan'))).toEqual([folderKey('pads'), 'mine'])
    expect(ancestorsOf(catalog, itemKey('snare'))).toEqual([folderKey('old'), 'trash'])
    // Hat's folder is live, so in the trash it stands alone.
    expect(ancestorsOf(catalog, itemKey('hat'))).toEqual(['trash'])
    expect([...expandedFor(catalog, INITIAL_EXPANDED, itemKey('tight'))].sort()).toEqual([folderKey('drums'), folderKey('kicks'), itemKey('k2'), 'mine'].sort())
    const all = new Set(ALL)
    expect(expandedFor(catalog, all, itemKey('tight'))).toBe(all)
  })
})

describe('library tree keys', () => {
  it('moves the active row with the arrows, Home and End, over every kind of row', () => {
    const rows = libraryRows(catalog, { expanded: ALL })
    expect(treeKey(rows, 'mine', ALL, 'ArrowDown')).toEqual({ active: folderKey('drums') })
    expect(treeKey(rows, itemKey('k2'), ALL, 'ArrowDown')).toEqual({ active: itemKey('boom') })
    expect(treeKey(rows, itemKey('sweep'), ALL, 'ArrowDown')).toEqual({ active: 'trash' })
    expect(treeKey(rows, 'mine', ALL, 'ArrowUp')).toEqual({ active: 'mine' })
    expect(treeKey(rows, itemKey('tight'), ALL, 'Home')).toEqual({ active: 'mine' })
    expect(treeKey(rows, 'mine', ALL, 'End')).toEqual({ active: itemKey('hat') })
    expect(treeKey(rows, 'mine', ALL, 'Enter')).toBeUndefined()
  })

  it('expands with Right then moves in, and collapses with Left then goes to the parent, whatever it is', () => {
    let expanded: ReadonlySet<string> = new Set(['mine', folderKey('drums'), folderKey('kicks')])
    const press = (active: string, key: string) => treeKey(libraryRows(catalog, { expanded }), active, expanded, key)!
    // A sound with presets expands like a folder.
    expanded = press(itemKey('k2'), 'ArrowRight').expanded!
    expect(expanded.has(itemKey('k2'))).toBe(true)
    expect(press(itemKey('k2'), 'ArrowRight')).toEqual({ active: itemKey('boom') })
    expect(press(itemKey('boom'), 'ArrowRight')).toEqual({})
    expect(press(itemKey('boom'), 'ArrowLeft')).toEqual({ active: itemKey('k2') })
    expect(press(itemKey('k10'), 'ArrowLeft')).toEqual({ active: folderKey('kicks') })
    expect(press(folderKey('drums'), 'ArrowLeft').expanded!.has(folderKey('drums'))).toBe(false)
    expect(press(folderKey('pads'), 'ArrowLeft')).toEqual({ active: 'mine' })
    expect(press('trash', 'ArrowRight').expanded!.has('trash')).toBe(true)
    expect(press('trash', 'ArrowLeft')).toEqual({})
    expect(press(itemKey('beat'), 'ArrowRight')).toEqual({})
  })

  it('expands every sibling with children on *', () => {
    const expanded = new Set(['mine'])
    const move = treeKey(libraryRows(catalog, { expanded }), folderKey('pads'), expanded, '*')!
    expect([...move.expanded!].sort()).toEqual(['mine', folderKey('drums'), folderKey('pads')].sort())
  })
})
