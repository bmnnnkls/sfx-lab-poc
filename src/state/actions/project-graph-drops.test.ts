import { type AssetDestination, type LibraryCatalog, type LibraryItem, addTrack, captureLibraryAsset, createReturnTrack, emptyLibrary, findExampleProject, groupTrack, insertLibraryAsset, saveLibraryFolder, setGroupBus, trashLibraryEntry } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { type DragPayload, type DropTarget, dropFor, refusalFor, runDrop } from './drops'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const graph = (name: string, domain: 'patch' | 'fx' | 'notes'): DragPayload => ({ kind: 'project-graph', owner: { kind: 'track', trackId: track(name).id }, domain })
const header = (name: string): DropTarget => ({ kind: 'track', trackId: track(name).id })
const canvas = (name: string, graphOf?: 'fx' | 'notes'): DropTarget => ({ kind: 'canvas', target: { trackId: track(name).id, graph: graphOf }, path: [], at: { x: 0, y: 0 } })

/** A library over a catalog in memory, capturing and inserting with the real core functions. */
let catalog: LibraryCatalog
const inserts: { item: LibraryItem; destination: AssetDestination; from?: LibraryCatalog }[] = []
const library = {
  read: async () => catalog,
  saveAsset: async (scope, name, folder) => (catalog = captureLibraryAsset(catalog, project(), scope, name, folder)),
  insert: async (item, destination, _scene, _replace, from) => {
    inserts.push({ item, destination, from })
    useProjectStore.getState().replaceProject(insertLibraryAsset(project(), from!, item, destination).project)
    return 'Asset and presets copied into project'
  },
} as PersonalLibrary
const context = () => fakeContext({ library })
const accepted = (payload: DragPayload, target: DropTarget) => dropFor(payload, target, context())?.id
const refusal = (payload: DragPayload, target: DropTarget) => refusalFor(payload, target, context())

const KICKS: DropTarget = { kind: 'library-folder', folderId: 'kicks' }
const MINE: DropTarget = { kind: 'library-root', root: 'mine' }
const TRASH: DropTarget = { kind: 'library-root', root: 'trash' }
const OLD: DropTarget = { kind: 'library-folder', folderId: 'old' }

/** The demo (Bass, Lead, Pad, and an audio track Kick), with a return, Bass in Drums (a bus); Kicks and Old (trashed) in the Library. */
beforeEach(() => {
  let next = addTrack(loadDemo(), { ...createReturnTrack('Return A'), id: 'ret' })
  const drums = groupTrack(next, next.tracks.find((candidate) => candidate.name === 'Bass')!.id)
  next = setGroupBus(drums.project, drums.groupId!, true)
  useProjectStore.getState().resetProject(next)
  catalog = trashLibraryEntry(saveLibraryFolder(saveLibraryFolder(emptyLibrary(), 'Kicks', null, 'kicks'), 'Old', null, 'old'), 'old')
  useLibraryStore.setState({ catalog, active: null })
  inserts.length = 0
})

describe('a graph of This project dropped', () => {
  it('on a library folder or My library is saved there; the trash and a trashed folder refuse it', async () => {
    expect(accepted(graph('Bass', 'patch'), KICKS)).toBe('drop.project-graph-on-library-folder')
    expect(accepted(graph('Bass', 'fx'), MINE)).toBe('drop.project-graph-on-library-root')
    expect(accepted(graph('Bass', 'patch'), TRASH)).toBeUndefined()
    expect(accepted(graph('Bass', 'patch'), OLD)).toBeUndefined()
    await runDrop(graph('Bass', 'patch'), KICKS, context(), { alt: false })
    expect(catalog.items.map((item) => [item.name, item.folderId, item.content.kind])).toEqual([['Bass', 'kicks', 'instrument']])
  })

  it('that reads another track is refused everywhere, with the reason', () => {
    useProjectStore.getState().resetProject(findExampleProject('low-light')!.create())
    useLibraryStore.setState({ catalog })
    const effects = graph('Bass', 'fx')
    for (const target of [KICKS, MINE, header('Stab')]) {
      expect(accepted(effects, target)).toBeUndefined()
      expect(refusal(effects, target)).toBe('Uses Track audio from Kick')
    }
    expect(refusal(effects, TRASH)).toBeUndefined()
  })

  it("on another instrument's header replaces its instrument with a copy, in one step; its own header refuses it", async () => {
    expect(accepted(graph('Bass', 'patch'), header('Lead'))).toBe('drop.project-graph-on-track')
    expect(accepted(graph('Bass', 'patch'), header('Bass'))).toBeUndefined()
    expect(refusal(graph('Bass', 'patch'), header('Bass'))).toBeUndefined()
    // An instrument doesn't go onto an audio track. A header's side is for moving tracks: a graph lands on either.
    expect(accepted(graph('Bass', 'patch'), header('Kick'))).toBeUndefined()
    expect(accepted(graph('Bass', 'patch'), { ...header('Lead'), edge: 'before' } as DropTarget)).toBe('drop.project-graph-on-track')
    const bass = track('Bass') as Extract<ReturnType<typeof track>, { kind: 'instrument' }>
    const past = useProjectStore.getState().history.past.length
    await runDrop(graph('Bass', 'patch'), header('Lead'), context(), { alt: false })
    expect(inserts.map(({ item, destination }) => [item.id, destination])).toEqual([[`project:track:${bass.id}:patch`, { mode: 'replace', scope: { owner: { kind: 'track', trackId: track('Lead').id }, domain: 'patch' } }]])
    const lead = track('Lead') as typeof bass
    expect(lead.patch.nodes.map((node) => node.type)).toEqual(bass.patch.nodes.map((node) => node.type))
    // Fresh node IDs: the copy is independent of the original.
    expect(lead.patch.nodes.some((node) => bass.patch.nodes.some((original) => original.id === node.id))).toBe(false)
    expect(useProjectStore.getState().history.past.length).toBe(past + 1)
    expect(project().libraryOrigins?.at(-1)).toMatchObject({ itemId: `project:track:${bass.id}:patch`, trackId: lead.id })
  })

  it('effects go onto a track of the same input; a bus and the master take only effects made for them', () => {
    expect(accepted(graph('Lead', 'fx'), header('Kick'))).toBe('drop.project-graph-on-track')
    expect(accepted(graph('Lead', 'fx'), { kind: 'master' })).toBeUndefined()
    expect(accepted(graph('Lead', 'patch'), { kind: 'master' })).toBeUndefined()
    expect(accepted(graph('Lead', 'fx'), { kind: 'group', groupId: project().groups![0]!.id })).toBeUndefined()
    // A return's effects start from Return in: only another return takes them.
    expect(accepted(graph('Lead', 'fx'), header('Return A'))).toBeUndefined()
    const master: DragPayload = { kind: 'project-graph', owner: { kind: 'master' }, domain: 'fx' }
    expect(accepted(master, { kind: 'master' })).toBeUndefined()
    expect(accepted(master, header('Lead'))).toBeUndefined()
  })

  it('on a canvas of the same kind of graph, of another owner, copies it there', () => {
    expect(accepted(graph('Bass', 'patch'), canvas('Pad'))).toBe('drop.project-graph-on-canvas')
    expect(accepted(graph('Bass', 'notes'), canvas('Pad', 'notes'))).toBe('drop.project-graph-on-canvas')
    expect(accepted(graph('Bass', 'patch'), canvas('Pad', 'notes'))).toBeUndefined()
    expect(accepted(graph('Bass', 'patch'), canvas('Bass'))).toBeUndefined()
  })
})
