import { type LibraryCatalog, captureLibraryAsset, emptyLibrary, insertLibraryAsset, linkOf, saveProjectPreset, trashLibraryEntry } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { recallLinkedSound } from '../preset-actions'
import { useProjectStore } from '../project-store'
import { describeActions, runAction, soundSubject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project

/** The demo's Bass saved as *Big bass*, and inserted into the project as a new track; returns the library and that track. */
const linkedBass = () => {
  const bass = project().tracks.find((track) => track.name === 'Bass')!
  const catalog = captureLibraryAsset(emptyLibrary(), project(), { owner: { kind: 'track', trackId: bass.id }, domain: 'patch' }, 'Big bass', null)
  const { project: inserted, scope } = insertLibraryAsset(project(), catalog, catalog.items[0]!, { mode: 'new-track' })
  useProjectStore.getState().resetProject(inserted)
  return { catalog, scope }
}

/** A library service over an in-memory catalog: `read`, and `addPresetToSound` / `savePreset` recorded. */
const libraryOver = (start: LibraryCatalog) => {
  let catalog = start
  const calls: string[] = []
  const library = {
    read: async () => catalog,
    addPresetToSound: async (presetId: string) => { calls.push(`add ${presetId}`); catalog = { ...catalog, items: [...catalog.items, { id: 'added', name: 'Deep', folderId: null, content: catalog.items[0]!.content }] }; return catalog },
    savePreset: async (presetId: string) => { calls.push(`save ${presetId}`); return catalog },
  } as unknown as PersonalLibrary
  return { library, calls }
}

beforeEach(() => {
  loadDemo()
  useLibraryStore.setState({ catalog: emptyLibrary() })
})

describe('Save to library on a preset of a linked sound', () => {
  it('adds it to the library sound it came from, and says so', async () => {
    const { catalog, scope } = linkedBass()
    useProjectStore.getState().resetProject(saveProjectPreset(project(), scope, 'Deep'))
    const deep = project().presets!.at(-1)!
    const { library, calls } = libraryOver(catalog)
    const context = fakeContext({ library })
    expect(describeActions(soundSubject(deep.id, true), context).find((action) => action.id === 'sound.save-to-library')?.tooltip).toBe('Adds this preset to the library sound it came from')
    const reports: unknown[] = []
    await runAction('sound.save-to-library', soundSubject(deep.id, true), context, { report: (...args: unknown[]) => reports.push(args) })
    expect(calls).toEqual([`add ${deep.id}`])
    expect(JSON.stringify(reports)).toContain('Added Deep to Big bass')
    expect(useLibraryStore.getState().catalog.items.some((item) => item.id === 'added')).toBe(true)
  })

  it('falls back to a sound of its own when the library sound is in the trash, or the preset has no link', async () => {
    const { catalog, scope } = linkedBass()
    useProjectStore.getState().resetProject(saveProjectPreset(project(), scope, 'Deep'))
    const deep = project().presets!.at(-1)!
    const trashed = libraryOver(trashLibraryEntry(catalog, catalog.items[0]!.id))
    await runAction('sound.save-to-library', soundSubject(deep.id, true), fakeContext({ library: trashed.library }))
    expect(trashed.calls).toEqual([`save ${deep.id}`])
    const bass = project().tracks.find((track) => track.name === 'Bass')!
    useProjectStore.getState().resetProject(saveProjectPreset(project(), { owner: { kind: 'track', trackId: bass.id }, domain: 'patch' }, 'Plain'))
    const plain = project().presets!.at(-1)!
    expect(describeActions(soundSubject(plain.id, true), fakeContext()).find((action) => action.id === 'sound.save-to-library')?.tooltip).toMatch(/^A new library sound/)
  })
})

describe('recalling a library state onto a linked track', () => {
  it('recalls it onto the track as an ordinary recall, and refuses once the graph is rewired', () => {
    const { catalog, scope } = linkedBass()
    const origin = linkOf(project(), scope.owner, 'patch')!.origin
    const state = (catalog.items[0]!.content as { state: Parameters<typeof recallLinkedSound>[1] }).state
    expect(recallLinkedSound(origin, state)).toMatch(/controls recalled$/)
    const trackId = (scope.owner as { trackId: string }).trackId
    useProjectStore.getState().resetProject({ ...project(), tracks: project().tracks.map((track) => (track.id === trackId && track.kind === 'instrument' ? { ...track, patch: { ...track.patch, connections: [] } } : track)) })
    expect(() => recallLinkedSound(origin, state)).toThrow('This sound has changed since it came from the library')
  })
})
