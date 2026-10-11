import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import { createDemoProject, removeTrack } from './index'
import { addTrack, createTrack } from './edit'
import { editPatchAt, groupNodesAsModule } from './module-edit'
import { readsNotesFrom, tapSourcesOf, tappableTracks } from './note-taps'
import type { InstrumentTrack, Project } from './types'

const demo = createDemoProject()
const [bass, lead, pad] = demo.tracks as InstrumentTrack[]

/** `reader` takes notes from `source` (through a Track notes node placed in its note graph). */
const tap = (project: Project, reader: string, source: string, nodeId = `tap_${reader}_${source}`): Project =>
  editPatchAt(project, { trackId: reader, graph: 'notes' }, (patch) => ({
    nodes: [...patch.nodes, ...noteGraphFrom([{ id: nodeId, type: 'trackNotes', trackId: source }], []).nodes],
    connections: patch.connections,
  }))

describe('notes from other tracks', () => {
  it('knows which tracks a track reads from', () => {
    const project = tap(demo, bass!.id, lead!.id)
    expect(tapSourcesOf(project, project.tracks[0] as InstrumentTrack)).toEqual([lead!.id])
    expect(tapSourcesOf(project, project.tracks[1] as InstrumentTrack)).toEqual([])
  })

  it('also looks inside modules', () => {
    const tapped = tap(demo, bass!.id, lead!.id, 'tapnode')
    const grouped = groupNodesAsModule(tapped, { trackId: bass!.id, graph: 'notes' }, ['tapnode'], 'Source')
    expect(tapSourcesOf(grouped, grouped.tracks[0] as InstrumentTrack)).toEqual([lead!.id])
  })

  it('follows chains of dependencies', () => {
    const project = tap(tap(demo, bass!.id, lead!.id), lead!.id, pad!.id)
    expect(readsNotesFrom(project, bass!.id, pad!.id)).toBe(true)
    expect(readsNotesFrom(project, pad!.id, bass!.id)).toBe(false)
  })

  it('offers every other track except those that would make a loop', () => {
    const project = tap(tap(demo, bass!.id, lead!.id), lead!.id, pad!.id)
    // pad may take from anyone except lead and bass (they read from pad)
    expect(tappableTracks(project, pad!.id).map((t) => t.name)).toEqual([])
    expect(tappableTracks(project, lead!.id).map((t) => t.name)).toEqual(['Pad'])
    expect(tappableTracks(project, bass!.id).map((t) => t.name).sort()).toEqual(['Lead', 'Pad'])
  })

  it('removing a track clears the inputs that read from it, in tracks and in modules', () => {
    const tapped = tap(demo, bass!.id, lead!.id, 'tapnode')
    const grouped = groupNodesAsModule(tapped, { trackId: bass!.id, graph: 'notes' }, ['tapnode'], 'Source')
    const removed = removeTrack(grouped, lead!.id)
    expect(removed.modules[0]!.patch.nodes.find((n) => n.type === 'trackNotes')!.trackId).toBeUndefined()

    const plain = removeTrack(tapped, lead!.id)
    expect((plain.tracks[0] as InstrumentTrack).noteGraph.nodes.find((n) => n.id === 'tapnode')!.trackId).toBeUndefined()
  })

  it('a new track can be tapped straight away', () => {
    const added = addTrack(demo, createTrack('Extra', demo.sceneCount))
    expect(tappableTracks(added, bass!.id).map((t) => t.name)).toContain('Extra')
  })
})
