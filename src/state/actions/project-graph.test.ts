import { type LibraryCatalog, type LibraryItem, captureLibraryAsset, findExampleProject, saveProjectPreset } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLayoutStore } from '../layout-store'
import { useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject, subjectName } from '.'
import { projectGraphItem } from './project-graph'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const graph = (name: string, domain: 'patch' | 'fx' | 'notes'): Subject => ({ kind: 'project-graph', owner: { kind: 'track', trackId: track(name).id }, domain })
const entries = (subject: Subject) => describeActions(subject, fakeContext()).map((item) => `${item.title}${item.enabled ? '' : ` (${item.tooltip})`}`)

beforeEach(() => {
  loadDemo()
  useLibraryStore.setState({ catalog: { version: 2, folders: [], items: [], revisions: [], samples: [] }, active: null, previewing: null })
})

describe('a graph of This project', () => {
  it('is named after its owner and graph', () => {
    expect(subjectName(graph('Bass', 'patch'))).toBe('Bass instrument')
    expect(subjectName(graph('Bass', 'notes'))).toBe('Bass notes')
    expect(subjectName({ kind: 'project-graph', owner: { kind: 'master' }, domain: 'fx' })).toBe('Master effects')
  })

  it('offers an instrument Preview, Show, Save to library and Copy to new track; effects and notes no copy', () => {
    expect(entries(graph('Bass', 'patch'))).toEqual(['Preview', 'Show', 'Save to library', 'Copy to new track'])
    expect(entries(graph('Bass', 'fx'))).toEqual(['Preview', 'Show', 'Save to library'])
    expect(entries(graph('Bass', 'notes'))).toEqual(['Preview', 'Show', 'Save to library'])
    expect(entries({ kind: 'project-graph', owner: { kind: 'master' }, domain: 'fx' })).toEqual(['Preview', 'Show', 'Save to library'])
    // An audio track has no instrument to show.
    expect(entries(graph('Kick', 'patch'))).toEqual([])
  })

  it('refuses saving, copying and previewing what reads another track, with the reason; Show still works', () => {
    useProjectStore.getState().resetProject(findExampleProject('low-light')!.create())
    expect(entries(graph('Bass', 'fx'))).toEqual(['Preview (Uses Track audio from Kick)', 'Show', 'Save to library (Uses Track audio from Kick)'])
    useProjectStore.getState().resetProject(findExampleProject('glass-rain')!.create())
    expect(entries(graph('Arp', 'patch'))).toEqual(['Preview (Uses Track notes from Pad)', 'Show', 'Save to library (Uses Track notes from Pad)', 'Copy to new track (Uses Track notes from Pad)'])
  })

  it('shows its owner selected and its editor', () => {
    runAction('project-graph.show', graph('Lead', 'notes'), fakeContext())
    expect(useSelectionStore.getState().trackId).toBe(track('Lead').id)
    expect(useLayoutStore.getState().visible).toContain('notes')
  })

  it('captures into a throwaway catalog holding it and its presets, named after the project graph', () => {
    const scope = { owner: { kind: 'track' as const, trackId: track('Bass').id }, domain: 'patch' as const }
    useProjectStore.getState().resetProject(saveProjectPreset(saveProjectPreset(project(), scope, 'Warm'), scope, 'Bright'))
    const { catalog, item } = projectGraphItem(project(), scope.owner, 'patch', 'Bass copy')
    expect(item).toMatchObject({ id: `project:track:${scope.owner.trackId}:patch`, name: 'Bass copy', content: { kind: 'instrument' } })
    expect(catalog.items.filter((candidate) => candidate.content.kind === 'preset').map((candidate) => [candidate.name, (candidate.content as { assetId: string }).assetId])).toEqual([
      ['Warm', item.id],
      ['Bright', item.id],
    ])
  })

  // One undo step, through the real library: app/library.test.ts.
  it('copies an instrument to a new track named "Bass copy", with its presets, through a source catalog', async () => {
    const scope = { owner: { kind: 'track' as const, trackId: track('Bass').id }, domain: 'patch' as const }
    useProjectStore.getState().resetProject(saveProjectPreset(project(), scope, 'Warm'))
    const inserted: { item: LibraryItem; from?: LibraryCatalog }[] = []
    const { insertLibraryAsset } = await import('@core')
    const library = {
      insert: async (item, destination, _scene, _replace, from) => {
        inserted.push({ item, from })
        const state = useProjectStore.getState()
        useProjectStore.setState({ project: insertLibraryAsset(state.project, from!, item, destination).project })
        return 'Asset and presets copied into project'
      },
    } as PersonalLibrary
    await runAction('project-graph.copy-to-new-track', { kind: 'project-graph', ...scope }, fakeContext({ library }))
    expect(inserted).toHaveLength(1)
    expect(inserted[0]!.from!.items.map((candidate) => candidate.name)).toEqual(['Bass copy', 'Warm'])
    const copy = project().tracks.at(-1)!
    expect(copy.name).toBe('Bass copy')
    expect(project().presets!.filter((preset) => JSON.stringify(preset.scope.owner) === JSON.stringify({ kind: 'track', trackId: copy.id })).map((preset) => preset.name)).toEqual(['Bass copy', 'Warm'])
    expect(project().libraryOrigins?.at(-1)).toMatchObject({ itemId: `project:track:${scope.owner.trackId}:patch`, trackId: copy.id, domain: 'patch' })
  })

  it('previews from the throwaway catalog, its ■ shown for the graph until it stops', async () => {
    let stop: (() => void) | undefined
    const previews: { item: LibraryItem; from?: LibraryCatalog }[] = []
    const library = {
      preview: async (item, onStop, from) => {
        previews.push({ item, from })
        stop = onStop
        return 'started'
      },
    } as PersonalLibrary
    const bass = graph('Bass', 'patch')
    await runAction('project-graph.preview', bass, fakeContext({ library }))
    const id = `project:track:${track('Bass').id}:patch`
    expect(previews[0]!.item.id).toBe(id)
    expect(previews[0]!.from!.items.some((candidate) => candidate.id === id)).toBe(true)
    expect(useLibraryStore.getState().previewing).toBe(id)
    stop!()
    expect(useLibraryStore.getState().previewing).toBeNull()
    // It is the capture a save would make.
    expect(previews[0]!.from!.revisions[0]!.signature).toBe(captureLibraryAsset({ version: 2, folders: [], items: [], revisions: [], samples: [] }, project(), { owner: { kind: 'track', trackId: track('Bass').id }, domain: 'patch' }, 'Bass', null).revisions[0]!.signature)
  })
})
