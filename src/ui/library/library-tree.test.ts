import { type Project, createDemoProject, createGroupBus, findExampleProject, saveProjectPreset } from '@core'
import { describe, expect, it } from 'vitest'
import { ancestorsOf, expandedFor, folderKey, INITIAL_EXPANDED, itemKey, libraryRows, type LibraryRow, projectModel, projectRows, treeKey } from './library-tree'

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

describe('this project rows', () => {
  const lowLight = () => findExampleProject('low-light')!.create()
  const glassRain = () => findExampleProject('glass-rain')!.create()
  /** Every row under the root open, as the tree draws them. */
  const everything = (project: Project, options: { query?: string; kind?: string } = {}) => {
    const model = projectModel(project)
    const keys = new Set<string>(['project'])
    // Opening a row shows the rows under it; repeat until nothing new opens.
    for (let size = -1; size !== keys.size;) {
      size = keys.size
      for (const row of projectRows(model, { expanded: keys })) if (row.hasChildren) keys.add(row.key)
    }
    return projectRows(model, { expanded: keys, ...options })
  }
  const reasons = (rows: readonly LibraryRow[]) =>
    rows.flatMap((row) => (row.kind === 'project' && row.entry.kind === 'graph' && row.entry.reason ? [`${rows.find((owner) => owner.key === row.parent)!.name} ${row.name}: ${row.entry.reason}`] : []))

  it('starts collapsed, named after the project, first in the tree', () => {
    const rows = projectRows(projectModel(createDemoProject()), { expanded: INITIAL_EXPANDED })
    expect(rows).toEqual([expect.objectContaining({ kind: 'root', key: 'project', name: 'Demo project', root: 'project', hasChildren: true, expanded: false })])
  })

  it('shows each track, then the master, with the graphs that hold something and the clips; empty graphs are left out', () => {
    expect(names(everything(createDemoProject()))).toEqual([
      'Demo project',
      '  Bass', '    Instrument', '    Clips', '      Root', '      Walk',
      '  Lead', '    Instrument', '    Clips', '      Arp', '      Hook',
      '  Pad', '    Instrument', '    Clips', '      Cm', '      Ab',
      '  Master',
    ])
    const rows = everything(createDemoProject())
    expect(rows.find((row) => row.name === 'Clips')).toMatchObject({ kind: 'project', count: 2, entry: { kind: 'heading', heading: 'clips' } })
    expect(rows.find((row) => row.name === 'Master')).toMatchObject({ hasChildren: false, entry: { kind: 'owner', owner: { kind: 'master' } } })
  })

  it("lists Low Light's tracks in order, then its returns, the master and its modules, with ⚠ on what reads another track", () => {
    const rows = everything(lowLight())
    expect(rows.filter((row) => row.level === 2).map((row) => row.name)).toEqual([
      'Kick', 'Clap', 'Hat', 'Open hat', 'Shaker', 'Knocks', 'Bass', 'Stab', 'Arp', 'Drone', 'Riser', 'Crash', 'Dust', 'Room', 'Echo', 'Hall', 'Master', 'Modules',
    ])
    const under = (name: string) => rows.filter((row) => row.parent === rows.find((owner) => owner.level === 2 && owner.name === name)!.key).map((row) => row.name)
    expect(under('Kick')).toEqual(['Instrument', 'Clips'])
    expect(under('Stab')).toEqual(['Instrument', 'Effects', 'Notes', 'Clips'])
    expect(under('Room')).toEqual(['Effects'])
    expect(under('Master')).toEqual(['Effects'])
    expect(rows.find((row) => row.name === 'Modules')).toMatchObject({ count: 4 })
    expect(rows.filter((row) => row.parent === rows.find((owner) => owner.name === 'Kick')!.key + '/clips')).toHaveLength(7)
    expect(reasons(rows)).toEqual([
      'Bass Effects: Uses Track audio from Kick', 'Stab Effects: Uses Track audio from Kick', 'Arp Effects: Uses Track audio from Kick', 'Drone Effects: Uses Track audio from Kick', 'Echo Effects: Uses Track audio from Kick',
    ])
  })

  it("puts ⚠ on Glass Rain's Arp notes, and on its instrument, whose save takes the notes along", () => {
    const rows = everything(glassRain())
    expect(reasons(rows)).toEqual(['Arp Instrument: Uses Track notes from Pad', 'Arp Notes: Uses Track notes from Pad'])
    expect(rows.filter((row) => row.parent === rows.find((owner) => owner.name === 'Arp')!.key).map((row) => row.name)).toEqual(['Instrument', 'Effects', 'Notes'])
  })

  it('shows presets under their graph, counted, a group bus after the returns, and the samples', () => {
    let project = createDemoProject()
    const bass = project.tracks[0]!
    project = saveProjectPreset(project, { owner: { kind: 'track', trackId: bass.id }, domain: 'patch' }, 'Warm')
    project = saveProjectPreset(project, { owner: { kind: 'track', trackId: bass.id }, domain: 'patch' }, 'Bright')
    project = { ...project, groups: [{ id: 'grp', name: 'Low end', colour: 'red', bus: createGroupBus() }], tracks: project.tracks.map((track, index) => (index === 0 ? { ...track, groupId: 'grp' } : track)) }
    project = { ...project, samples: [{ id: 's1', name: 'Kick.wav', extension: 'wav', durationSeconds: 1, sampleRate: 48000, channels: 1, bytes: 10 }] }
    const rows = everything(project)
    expect(rows.find((row) => row.name === 'Instrument')).toMatchObject({ count: 2, hasChildren: true, entry: { kind: 'graph', presets: 2 } })
    expect(names(rows).slice(1, 8)).toEqual(['  Bass', '    Instrument', '      Warm', '      Bright', '    Clips', '      Root', '      Walk'])
    expect(rows.filter((row) => row.level === 2).map((row) => row.name)).toEqual(['Bass', 'Lead', 'Pad', 'Low end bus', 'Master', 'Samples'])
    expect(rows.find((row) => row.name === 'Kick.wav')).toMatchObject({ entry: { kind: 'sample', sampleId: 's1' }, parent: 'p:samples' })
  })

  it('searches while the root is open: an owner by its name, the rest by theirs, with the type filter; modules by search only', () => {
    const model = projectModel(lowLight())
    expect(names(projectRows(model, { expanded: new Set(), query: 'stab' }))).toEqual(['Low Light'])
    const open = new Set(['project'])
    const stab = names(projectRows(model, { expanded: open, query: 'stab' }))
    expect(stab.slice(0, 6)).toEqual(['Low Light', '  Stab', '    Instrument', '    Effects', '    Notes', '    Clips'])
    expect(stab).toHaveLength(6 + 5)
    expect(names(projectRows(model, { expanded: open, kind: 'note-effect' }))).toEqual(['Low Light', '  Stab', '    Notes', '  Arp', '    Notes'])
    expect(names(projectRows(model, { expanded: open, query: 'bass', kind: 'audio-effect' }))).toEqual(['Low Light', '  Bass', '    Effects'])
    const moduleName = lowLight().modules[0]!.name
    expect(names(projectRows(model, { expanded: open, query: moduleName }))).toContain(`    ${moduleName}`)
    expect(names(projectRows(model, { expanded: open, query: moduleName, kind: 'instrument' }))).not.toContain(`    ${moduleName}`)
    expect(projectRows(model, { expanded: open, query: 'nothing at all' })[0]).toMatchObject({ hasChildren: false, expanded: false })
  })

  it('is memoized on the project, and an edit that changes no row gives the same model', () => {
    const project = lowLight()
    const model = projectModel(project)
    expect(projectModel(project)).toBe(model)
    const kick = project.tracks[0]!
    const louder = { ...project, tracks: project.tracks.map((track) => (track.id === kick.id ? { ...track, volume: 0.5 } : track)) }
    expect(projectModel(louder)).toBe(model)
    const renamed = { ...project, tracks: project.tracks.map((track) => (track.id === kick.id ? { ...track, name: 'Big kick' } : track)) }
    expect(projectModel(renamed)).not.toBe(model)
  })
})
