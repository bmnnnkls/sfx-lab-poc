import { type LibraryCatalog, captureSnapshot, emptyLibrary, putSnapshot, saveLibraryFolder, saveLibraryItem } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { openFolder, useLibraryStore } from '../library-store'
import { usePersistenceStore } from '../persistence-store'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { useSampleStore } from '../sample-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject } from '.'
import { fakeContext, kick, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const titles = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => item.title)

beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
  useRenameStore.getState().stop()
  usePersistenceStore.setState({ notices: [] })
})

describe('sample', () => {
  const sample: Subject = { kind: 'sample', sampleId: kick.id }

  it('previews and opens only once its audio is ready', () => {
    expect(titles(sample)).toEqual(['Preview', 'Open in wave editor', 'Rename', 'New sampler track', 'New audio track', 'Add to library', 'Remove from project'])
    expect(describeActions(sample, fakeContext())[0]?.enabled).toBe(false)
    useSampleStore.getState().setStatus(kick.id, 'ready')
    const context = fakeContext()
    runAction('sample.preview', sample, context)
    runAction('sample.open', sample, context)
    expect(context.calls).toEqual(['samples.preview("kick")'])
    expect(useSelectionStore.getState().sampleId).toBe(kick.id)
  })

  it('makes tracks from the sample and removes it', () => {
    runAction('sample.new-sampler-track', sample, fakeContext())
    runAction('sample.new-audio-track', sample, fakeContext())
    expect(project().tracks.slice(-2).map((track) => [track.kind, track.name])).toEqual([['instrument', 'Kick'], ['audio', 'Kick']])
    runAction('sample.remove', sample, fakeContext())
    expect(project().samples).toEqual([])
  })
})

describe('library', () => {
  let catalog: LibraryCatalog
  const calls: string[] = []
  const library = {
    update: async (edit: (value: LibraryCatalog) => LibraryCatalog) => (catalog = edit(catalog)),
    insert: async (item: { name: string }, destination: { mode: string }) => {
      calls.push(`insert ${item.name} ${destination.mode}`)
      return `${item.name} copied into project`
    },
    preview: async () => 'started' as const,
    stopPreview: () => calls.push('stop preview'),
  } as unknown as PersonalLibrary
  const context = () => fakeContext({ library })
  const item: Subject = { kind: 'library-item', itemId: 'synth' }
  const folder: Subject = { kind: 'library-folder', folderId: 'leads' }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  beforeEach(() => {
    calls.length = 0
    catalog = saveLibraryFolder(emptyLibrary(), 'Leads', null, 'leads')
    catalog = saveLibraryItem(catalog, { id: 'synth', name: 'Synth', folderId: 'leads', content: { kind: 'sample', sampleId: kick.id } } as never)
    useLibraryStore.setState({ catalog, active: null })
  })

  it('offers what an item can do, and only Restore in the trash', async () => {
    expect(titles(item)).toEqual(['Preview', 'Rename', 'Duplicate', 'Insert new instrument track', 'Add sample to project', 'Move to', 'Export as .sfxlib…', 'Trash'])
    expect(describeActions(item, context()).find((entry) => entry.id === 'library-item.insert-track')?.enabled).toBe(false)
    await runAction('library-item.trash', item, context())
    expect(useLibraryStore.getState().catalog.items[0]?.trashed).toBe(true)
    expect(titles(item)).toEqual(['Restore'])
    await runAction('library-item.restore', item, context())
    expect(useLibraryStore.getState().catalog.items[0]?.trashed).toBeFalsy()
    expect(usePersistenceStore.getState().notices.map((notice) => notice.message)).toEqual(['Moved to the trash', 'Restored'])
  })

  it('duplicates and inserts, reporting to the toasts or to a view', async () => {
    await runAction('library-item.duplicate', item, context())
    expect(useLibraryStore.getState().catalog.items.map((entry) => entry.name).sort()).toEqual(['Synth', 'Synth copy'])
    const reported: string[] = []
    await runAction('library-item.replace', item, context(), { report: (_kind, text) => reported.push(text) })
    expect(calls).toEqual(['insert Synth replace'])
    expect(reported).toEqual(['Synth copied into project'])
  })

  it('opens folders, makes one inside and names it in place, and trashes one with its contents', async () => {
    expect(titles(folder)).toEqual(['Open', 'Rename', 'New folder inside', 'Duplicate', 'Move to', 'Export as .sfxlib…', 'Trash'])
    runAction('library-folder.open', folder, context())
    expect(openFolder()).toBe('leads')
    await runAction('library-folder.new-folder', folder, fakeContext({ library, origin: 'library' }))
    const made = useLibraryStore.getState().catalog.folders.find((entry) => entry.parentId === 'leads')!
    expect(made.name).toBe('New folder')
    expect(openFolder()).toBe(made.id)
    expect(useRenameStore.getState().renaming).toEqual({ subject: { kind: 'library-folder', folderId: made.id }, origin: 'library' })
    runAction('library-folder.open', folder, context())
    await runAction('library-folder.trash', folder, context())
    await settle()
    expect(openFolder()).toBeNull()
    expect(useLibraryStore.getState().catalog.items[0]?.trashed).toBe(true)
  })

  it('reports an error from the library', async () => {
    library.update = async () => { throw new Error('Storage is full') }
    await runAction('library-item.duplicate', item, context())
    expect(usePersistenceStore.getState().notices.at(-1)).toMatchObject({ kind: 'error', message: 'Storage is full' })
  })
})

describe('sound', () => {
  it('recalls, updates, duplicates and deletes a snapshot', async () => {
    const bass = project().tracks[0]!
    const snapshot = captureSnapshot(project(), { owner: { kind: 'track', trackId: bass.id }, domain: 'track' }, 'Loud')
    useProjectStore.getState().resetProject(putSnapshot(project(), snapshot))
    const sound: Subject = { kind: 'sound', soundId: snapshot.id, preset: false }
    expect(titles(sound)).toEqual(['Recall', 'Update', 'Rename', 'Duplicate', 'Delete'])
    const reported: string[] = []
    await runAction('sound.recall', sound, fakeContext(), { report: (_kind, text) => reported.push(text) })
    expect(reported[0]).toMatch(/controls recalled/)
    await runAction('sound.duplicate', sound, fakeContext())
    expect(project().snapshots?.map((entry) => entry.name)).toEqual(['Loud', 'Loud copy'])
    await runAction('sound.delete', sound, fakeContext())
    expect(project().snapshots?.map((entry) => entry.name)).toEqual(['Loud copy'])
    expect(titles(sound)).toEqual([])
  })
})
