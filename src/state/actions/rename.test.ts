import { type LibraryCatalog, captureSnapshot, emptyLibrary, putSnapshot, saveLibraryFolder, saveLibraryItem } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLayoutStore } from '../layout-store'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { commitRename, describeActions, runAction, type Subject } from '.'
import { fakeContext, kick, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const undoSteps = () => useProjectStore.getState().history.past.length

beforeEach(() => {
  loadDemo()
  useRenameStore.getState().stop()
})

describe('rename', () => {
  it('starts in the view the menu was opened in, and shows that view', () => {
    const track: Subject = { kind: 'track', trackId: project().tracks[0]!.id }
    runAction('track.rename', track, fakeContext({ origin: 'mixer' }))
    expect(useRenameStore.getState().renaming).toEqual({ subject: track, origin: 'mixer' })
    expect(useLayoutStore.getState().visible).toContain('mixer')
  })

  it("starts in the kind's own view from outside a view", () => {
    const sample: Subject = { kind: 'sample', sampleId: kick.id }
    runAction('sample.rename', sample, fakeContext())
    expect(useRenameStore.getState().renaming).toEqual({ subject: sample, origin: 'samples' })
  })

  it('is on the session clip menu', () => {
    const bass = project().tracks[0]!
    const clipId = bass.kind !== 'return' ? bass.clips[0]!.id : ''
    expect(describeActions({ kind: 'clip', trackId: bass.id, clipId }, fakeContext()).map((item) => item.title)).toContain('Rename')
  })

  it("commits with each kind's setter, one undo step each", () => {
    const [bass] = project().tracks
    if (bass?.kind !== 'instrument') throw new Error('Expected an instrument')
    const context = fakeContext()
    commitRename({ kind: 'track', trackId: bass.id }, ' Low end ', context)
    commitRename({ kind: 'clip', trackId: bass.id, clipId: bass.clips[0]!.id }, 'Low root', context)
    commitRename({ kind: 'scene', scene: 1 }, 'Verse', context)
    commitRename({ kind: 'sample', sampleId: kick.id }, 'Deep kick', context)
    const renamed = project()
    expect(renamed.tracks[0]).toMatchObject({ name: 'Low end', clips: [{ name: 'Low root' }, { name: 'Walk' }, null, null] })
    expect(renamed.sceneNames).toEqual(['', 'Verse'])
    expect(renamed.samples[0]?.name).toBe('Deep kick')
    expect(undoSteps()).toBe(4)
  })

  it('changes nothing for an empty name', () => {
    commitRename({ kind: 'track', trackId: project().tracks[0]!.id }, '   ', fakeContext())
    expect(undoSteps()).toBe(0)
  })

  it('renames modules and sounds', () => {
    const bass = project().tracks[0]!
    const snapshot = captureSnapshot(project(), { owner: { kind: 'track', trackId: bass.id }, domain: 'track' }, 'Loud')
    useProjectStore.getState().replaceProject(putSnapshot(project(), snapshot))
    commitRename({ kind: 'sound', soundId: snapshot.id, preset: false }, 'Louder', fakeContext())
    expect(project().snapshots?.[0]?.name).toBe('Louder')
  })

  it("renames library items and folders through the library, resolving with the catalog", async () => {
    let catalog: LibraryCatalog = saveLibraryFolder(emptyLibrary(), 'Folder', null, 'folder')
    const item = { id: 'item', name: 'Synth', folderId: null, content: { kind: 'sample', sampleId: kick.id } } as unknown as Parameters<typeof saveLibraryItem>[1]
    catalog = saveLibraryItem(catalog, item)
    const library = { update: async (edit: (value: LibraryCatalog) => LibraryCatalog) => (catalog = edit(catalog)) } as unknown as PersonalLibrary
    await commitRename({ kind: 'library-item', itemId: 'item' }, 'Bright synth', fakeContext({ library }))
    await commitRename({ kind: 'library-folder', folderId: 'folder' }, 'Leads', fakeContext({ library }))
    expect(catalog.items[0]?.name).toBe('Bright synth')
    expect(catalog.folders[0]?.name).toBe('Leads')
    await expect(commitRename({ kind: 'library-item', itemId: 'gone' }, 'X', fakeContext({ library }))).rejects.toThrow('gone')
  })
})
