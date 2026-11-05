import { type LibraryCatalog, type LibraryItem, createDemoProject, emptyLibrary, insertLibraryAsset, linkOf, linkedSounds, loadFactoryModule, saveLibraryFolder, saveProjectPreset } from '@core'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { catalogOf, fromOf, loadFactory, useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject, subjectName } from '.'
import { dropFor } from './drops'
import { fakeContext, loadDemo } from './test-support'

let factory: LibraryCatalog
let notes: Readonly<Record<string, string>>
beforeAll(async () => {
  const module = await loadFactoryModule()
  factory = module.createFactoryCatalog()
  notes = module.factoryNotes
})

const project = () => useProjectStore.getState().project
const KICK = 'factory:drums/kick'
const item = (itemId: string) => ({ kind: 'library-item', itemId }) as const
const folder = (folderId: string) => ({ kind: 'library-folder', folderId }) as const

/** A library that records what it was asked to insert and preview, and from which catalog. */
const calls: string[] = []
const library = {
  read: async () => emptyLibrary(),
  insert: async (picked: LibraryItem, destination: { mode: string }, scene?: number, _replace?: boolean, from?: LibraryCatalog) => {
    calls.push(`insert ${picked.id} ${destination.mode} ${scene ?? '-'} from ${from === factory ? 'factory' : (from ?? 'storage')}`)
    return 'Inserted'
  },
  preview: async (picked: LibraryItem, _onStop?: () => void, from?: LibraryCatalog) => {
    calls.push(`preview ${picked.id} from ${from === factory ? 'factory' : 'storage'}`)
    return 'started'
  },
  stopPreview: () => {},
} as unknown as PersonalLibrary
const context = () => fakeContext({ library })
const titles = (subject: Subject) => describeActions(subject, context()).map((entry) => entry.title)

beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
  calls.length = 0
  useLibraryStore.setState({ catalog: saveLibraryFolder(emptyLibrary(), 'Mine', null, 'mine-folder'), factory, factoryNotes: notes, active: null, selected: [] })
})

describe('Factory items and folders', () => {
  it('are used, never edited: no Rename, Duplicate, Move or Trash', () => {
    expect(titles(item(KICK))).toEqual(['Preview', 'Insert new instrument track', 'Replace selected graph', 'Export as .sfxlib…'])
    expect(titles(item('factory:clips/low-light/groove-kick'))).toEqual(['Preview', 'Insert new instrument track', 'Insert into Bass', 'Replace clip in Bass', 'Export as .sfxlib…'])
    expect(titles(item('factory:effects/returns/room'))).toEqual(['Preview', 'Insert new instrument track', 'Replace selected graph', 'Export as .sfxlib…'])
    expect(titles(folder('factory:drums'))).toEqual(['Open', 'Export as .sfxlib…'])
    expect(titles(folder('factory:effects/returns'))).toEqual(['Open', 'Export as .sfxlib…'])
    // A personal folder keeps its whole menu.
    expect(titles(folder('mine-folder'))).toEqual(['Open', 'Rename', 'New folder inside', 'Duplicate', 'Move to', 'Export as .sfxlib…', 'Trash'])
  })

  it('are named, and read, from the Factory catalog', () => {
    expect(subjectName(item(KICK))).toBe('Kick')
    expect(subjectName(folder('factory:effects/returns'))).toBe('Returns')
    expect(catalogOf(KICK)).toBe(factory)
    expect(catalogOf('mine-folder')).toBe(useLibraryStore.getState().catalog)
    expect(fromOf(KICK)).toBe(factory)
    expect(fromOf('mine-folder')).toBeUndefined()
  })

  it('insert and preview from the Factory catalog, not storage', async () => {
    await runAction('library-item.insert-track', item(KICK), context())
    await runAction('library-item.preview', item(KICK), context())
    const bass = project().tracks.find((track) => track.name === 'Bass')!
    useSelectionStore.getState().selectTrack(bass.id)
    await runAction('library-item.replace', item('factory:bass/sub'), context())
    await runAction('library-item.insert-into', item('factory:clips/low-light/groove-bass'), context(), { choice: '3' })
    expect(calls).toEqual([
      `insert ${KICK} new-track - from factory`,
      `preview ${KICK} from factory`,
      'insert factory:bass/sub replace - from factory',
      'insert factory:clips/low-light/groove-bass replace 3 from factory',
    ])
  })

  it('drop onto a track from the Factory, and nothing drops onto the Factory', () => {
    const bass = project().tracks.find((track) => track.name === 'Bass')!
    expect(dropFor(item('factory:bass/sub'), { kind: 'track', trackId: bass.id }, context())?.id).toBe('drop.library-item-on-track')
    expect(dropFor(item('factory:effects/master/dj-filter'), { kind: 'master' }, context())?.id).toBe('drop.library-item-on-master')
    expect(dropFor(item('factory:effects/master/dj-filter'), { kind: 'track', trackId: bass.id }, context())).toBeUndefined()
    // A Factory folder takes nothing, and a Factory item isn't moved into My library (step 3 copies it).
    expect(dropFor(item(KICK), folder('factory:bass'), context())).toBeUndefined()
    expect(dropFor({ kind: 'track', trackId: bass.id }, folder('factory:bass'), context())).toBeUndefined()
    expect(dropFor(item(KICK), { kind: 'library-root', root: 'trash' }, context())).toBeUndefined()
  })
})

describe('loading the Factory', () => {
  it('loads once into the store, and a failure lets the next call try again', async () => {
    useLibraryStore.setState({ factory: null, factoryNotes: {} })
    let loads = 0
    await expect(loadFactory(async () => { loads++; throw new Error('offline') })).rejects.toThrow('offline')
    const load = async () => { loads++; return { catalog: factory, notes } }
    const [a, b] = await Promise.all([loadFactory(load), loadFactory(load)])
    expect([a, b]).toEqual([factory, factory])
    expect(loads).toBe(2)
    expect(useLibraryStore.getState().factory).toBe(factory)
    expect(useLibraryStore.getState().factoryNotes[KICK]).toMatch(/kick/)
    await loadFactory(load)
    expect(loads).toBe(2)
  })
})

describe('a sound inserted from the Factory', () => {
  it('links to its Factory item, so Sounds and Used on find it in the Factory catalog, and its presets save as a sound of their own', async () => {
    const kick = factory.items.find((candidate) => candidate.id === KICK)!
    const inserted = insertLibraryAsset(createDemoProject(), factory, kick, { mode: 'new-track' }).project
    const track = inserted.tracks.at(-1)!
    const found = linkOf(inserted, { kind: 'track', trackId: track.id }, 'patch')
    expect(found).toMatchObject({ live: true, origin: { itemId: KICK } })
    // The personal catalog doesn't know it; the Factory's does.
    expect(linkedSounds(emptyLibrary(), found!.origin).sound).toBeUndefined()
    expect(linkedSounds(catalogOf(found!.origin.itemId), found!.origin)).toMatchObject({ sound: { id: KICK }, trashed: false, states: [{ id: KICK }] })
    // Save to library on a preset of it makes a sound of its own: the Factory is read-only.
    const withPreset = saveProjectPreset(inserted, { owner: { kind: 'track', trackId: track.id }, domain: 'patch' }, 'Tight')
    useProjectStore.getState().resetProject(withPreset)
    const preset = withPreset.presets!.find((candidate) => candidate.name === 'Tight')!
    expect(describeActions({ kind: 'sound', soundId: preset.id, preset: true }, context()).find((entry) => entry.id === 'sound.save-to-library')?.tooltip).toBe("A new library sound from this preset's own graph, holding only this preset")
  })
})
