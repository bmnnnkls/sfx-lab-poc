import { type LibraryCatalog, captureLibraryAsset, captureLibraryClip, emptyLibrary, saveLibraryFolder, saveProjectPreset, trashLibraryEntry } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from '../layout-store'
import type { PersonalLibrary } from '../library'
import { openFolder, openFolderOf, useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject, subjectName } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const titles = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => item.title)
const entry = (subject: Subject, id: string) => describeActions(subject, fakeContext()).find((item) => item.id === id)

let catalog: LibraryCatalog
const calls: string[] = []
const library = {
  read: async () => catalog,
  update: async (edit: (value: LibraryCatalog) => LibraryCatalog) => (catalog = edit(catalog)),
  insert: async (item: { name: string }, destination: { mode: string; scope?: { owner: { trackId?: string } } }, scene?: number, replace?: boolean) => {
    calls.push(`${replace ? 'replace' : 'insert'} ${item.name} ${destination.scope?.owner.trackId} ${scene}`)
    return 'Inserted'
  },
  stopPreview: () => {},
} as unknown as PersonalLibrary
const context = () => fakeContext({ library })
const id = (name: string) => catalog.items.find((item) => item.name === name)!.id
const item = (name: string): Subject => ({ kind: 'library-item', itemId: id(name) })
const folder = (folderId: string): Subject => ({ kind: 'library-folder', folderId })

/** Drums > Kicks, Pads; Synth (Bass's instrument, with its preset Bright) in Kicks; Riff (Bass's first clip) at the top level. */
beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
  useRenameStore.getState().stop()
  calls.length = 0
  const bass = track('Bass').id
  useProjectStore.getState().resetProject(saveProjectPreset(project(), { owner: { kind: 'track', trackId: bass }, domain: 'patch' }, 'Bright'))
  catalog = saveLibraryFolder(saveLibraryFolder(saveLibraryFolder(emptyLibrary(), 'Drums', null, 'drums'), 'Kicks', 'drums', 'kicks'), 'Pads', null, 'pads')
  catalog = captureLibraryAsset(catalog, project(), { owner: { kind: 'track', trackId: bass }, domain: 'patch' }, 'Synth', 'kicks')
  catalog = captureLibraryClip(catalog, project(), bass, (track('Bass') as { clips: readonly ({ id: string } | null)[] }).clips[0]!.id, 'Riff', null)
  useLibraryStore.setState({ catalog, active: null, selected: [], request: null })
})

describe('library items', () => {
  it('offers a clip its scenes on the selected track of its kind, and a trashed item only Restore', async () => {
    expect(titles(item('Riff'))).toEqual(['Preview', 'Rename', 'Duplicate', 'Insert new instrument track', 'Insert into Bass', 'Replace clip in Bass', 'Move to', 'Export as .sfxlib…', 'Cut', 'Copy', 'Trash'])
    expect(titles(item('Synth'))).toEqual(['Preview', 'Rename', 'Duplicate', 'Insert new instrument track', 'Replace selected graph', 'Move to', 'Export as .sfxlib…', 'Cut', 'Copy', 'Trash'])
    useLibraryStore.setState({ catalog: (catalog = trashLibraryEntry(catalog, id('Riff'))) })
    expect(titles(item('Riff'))).toEqual(['Restore'])
  })

  it('disables Insert into for occupied scenes, and Replace clip in for empty ones, saying why', async () => {
    const insert = entry(item('Riff'), 'library-item.insert-into')!
    const bass = track('Bass') as { clips: readonly unknown[] }
    expect(insert.choices).toHaveLength(project().sceneCount)
    insert.choices!.forEach((choice, scene) => expect(choice.enabled).toBe(!bass.clips[scene]))
    expect(insert.choices!.find((choice) => !choice.enabled)).toMatchObject({ title: 'Scene 1', tooltip: 'Bass has a clip there' })
    const replace = entry(item('Riff'), 'library-item.replace-clip')!
    replace.choices!.forEach((choice, scene) => expect(choice.enabled).toBe(!!bass.clips[scene]))
    const empty = insert.choices!.findIndex((choice) => choice.enabled)
    await runAction('library-item.insert-into', item('Riff'), context(), { choice: String(empty) })
    await runAction('library-item.replace-clip', item('Riff'), context(), { choice: '0' })
    expect(calls).toEqual([`insert Riff ${track('Bass').id} ${empty}`, `replace Riff ${track('Bass').id} 0`])
    // With Lead selected, the clip goes there instead.
    useSelectionStore.getState().selectTrack(track('Lead').id)
    expect(entry(item('Riff'), 'library-item.insert-into')?.title).toBe('Insert into Lead')
  })

  it('moves to My library or a folder, by path, not where it already is; a preset has no Move to', async () => {
    expect(entry(item('Synth'), 'library-item.move')?.choices).toEqual([
      { id: '-', title: 'My library', enabled: true },
      { id: 'drums', title: 'Drums', enabled: true },
      { id: 'kicks', title: 'Drums / Kicks', enabled: false },
      { id: 'pads', title: 'Pads', enabled: true },
    ])
    const presets = catalog.items.filter((candidate) => candidate.content.kind === 'preset')
    expect(presets.length).toBeGreaterThan(0)
    expect(entry({ kind: 'library-item', itemId: presets[0]!.id }, 'library-item.move')).toBeUndefined()
    await runAction('library-item.move', item('Synth'), context(), { choice: 'pads' })
    expect(catalog.items.filter((candidate) => candidate.content.kind !== 'midi-clip').every((candidate) => candidate.folderId === 'pads')).toBe(true)
    await runAction('library-item.move', item('Synth'), context(), { choice: '-' })
    expect(catalog.items.find((candidate) => candidate.name === 'Synth')?.folderId).toBeNull()
  })

  it('asks the Library view to review an export, and shows it', async () => {
    await runAction('library-item.export', item('Synth'), context())
    expect(useLibraryStore.getState().request).toEqual({ kind: 'export', selection: { itemIds: [id('Synth')] }, name: 'Synth' })
    expect(useLayoutStore.getState().visible).toContain('library')
  })
})

describe('library folders', () => {
  it("moves anywhere but into itself or a folder inside it, and duplicates beside itself", async () => {
    expect(entry(folder('drums'), 'library-folder.move')?.choices).toEqual([
      { id: '-', title: 'My library', enabled: false },
      { id: 'pads', title: 'Pads', enabled: true },
    ])
    expect(entry(folder('kicks'), 'library-folder.move')?.choices?.map((choice) => [choice.title, choice.enabled])).toEqual([['My library', true], ['Drums', false], ['Pads', true]])
    await runAction('library-folder.move', folder('kicks'), context(), { choice: 'pads' })
    expect(catalog.folders.find((candidate) => candidate.id === 'kicks')?.parentId).toBe('pads')
    await runAction('library-folder.duplicate', folder('pads'), context())
    expect(catalog.folders.map((candidate) => candidate.name).sort()).toEqual(['Drums', 'Kicks', 'Kicks', 'Pads', 'Pads copy'])
    await runAction('library-folder.export', folder('pads'), context())
    expect(useLibraryStore.getState().request).toEqual({ kind: 'export', selection: { folderIds: ['pads'] }, name: 'Pads' })
  })
})

describe('library roots', () => {
  const mine: Subject = { kind: 'library-root', root: 'mine' }
  const trash: Subject = { kind: 'library-root', root: 'trash' }

  it('are named My library and Trash, and offer a new folder, import and export, or restoring everything', async () => {
    expect([subjectName(mine), subjectName(trash)]).toEqual(['My library', 'Trash'])
    expect(titles(mine)).toEqual(['New folder', 'Import .sfxlib…', 'Export all…', 'Paste here'])
    expect(titles(trash)).toEqual(['Restore all'])
    expect(entry(trash, 'library-root.restore-all')?.enabled).toBe(false)
    await runAction('library-root.import', mine, context())
    expect(useLibraryStore.getState().request).toEqual({ kind: 'import' })
    await runAction('library-root.export-all', mine, context())
    expect(useLibraryStore.getState().request).toMatchObject({ kind: 'export', name: 'My library', selection: { folderIds: ['drums', 'kicks', 'pads'] } })
  })

  it('make a new folder at the top level and name it in place, and restore everything trashed', async () => {
    await runAction('library-root.new-folder', mine, fakeContext({ library, origin: 'library' }))
    const made = catalog.folders.find((candidate) => candidate.name === 'New folder')!
    expect(made.parentId).toBeNull()
    expect(useLibraryStore.getState().active).toEqual({ kind: 'folder', id: made.id })
    expect(useRenameStore.getState().renaming).toEqual({ subject: { kind: 'library-folder', folderId: made.id }, origin: 'library' })
    catalog = trashLibraryEntry(trashLibraryEntry(catalog, 'drums'), id('Riff'))
    useLibraryStore.setState({ catalog })
    expect(entry(trash, 'library-root.restore-all')?.enabled).toBe(true)
    await runAction('library-root.restore-all', trash, context())
    expect([...catalog.folders, ...catalog.items].some((candidate) => candidate.trashed)).toBe(false)
  })
})

describe('the open folder', () => {
  it("is the active folder, or the active item's (its sound's for a preset), or the top level", () => {
    const preset = catalog.items.find((candidate) => candidate.content.kind === 'preset')!
    const stray = { ...catalog, items: catalog.items.map((candidate) => (candidate.id === preset.id ? { ...candidate, folderId: 'pads' } : candidate)) }
    expect(openFolderOf({ catalog: stray, active: { kind: 'item', id: preset.id } })).toBe('kicks')
    expect(openFolderOf({ catalog, active: { kind: 'folder', id: 'pads' } })).toBe('pads')
    expect(openFolderOf({ catalog, active: { kind: 'item', id: id('Riff') } })).toBeNull()
    expect(openFolderOf({ catalog, active: { kind: 'root', id: 'mine' } })).toBeNull()
    expect(openFolderOf({ catalog: trashLibraryEntry(catalog, 'pads'), active: { kind: 'folder', id: 'pads' } })).toBeNull()
    useLibraryStore.getState().setActive({ kind: 'folder', id: 'drums' })
    expect(openFolder()).toBe('drums')
  })
})
