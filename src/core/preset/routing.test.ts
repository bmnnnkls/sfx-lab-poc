import { describe, expect, it } from 'vitest'
import { createModuleUse, createNode, type ModuleDefinition } from '../patch'
import { createAudioTrack, createEmptyProject, type InstrumentTrack, type Project } from '../project'
import { captureAsset } from './assets'
import { externalRoutingIn } from './routing'

/** An empty project with an instrument and an audio track, Drums. */
const setup = () => {
  const p = createEmptyProject()
  const drums = { ...createAudioTrack('Drums', p.sceneCount), id: 'drums' }
  return { ...p, tracks: [...p.tracks, drums] }
}
const instrumentOf = (p: Project) => p.tracks[0] as InstrumentTrack
const withInstrument = (p: Project, edit: (track: InstrumentTrack) => InstrumentTrack): Project => ({ ...p, tracks: p.tracks.map((track, index) => (index === 0 ? edit(track as InstrumentTrack) : track)) })

describe('externalRoutingIn', () => {
  it('finds nothing in a graph that reads only itself, or in a scope without a graph', () => {
    const p = setup(), owner = { kind: 'track' as const, trackId: instrumentOf(p).id }
    expect(externalRoutingIn(p, { owner, domain: 'patch' })).toBeUndefined()
    expect(externalRoutingIn(p, { owner, domain: 'track' })).toBeUndefined()
    expect(externalRoutingIn(p, { owner: { kind: 'master' }, domain: 'patch' })).toBeUndefined()
  })

  it("finds a Track audio, a Send or a Track notes node with the track it reads, as captureAsset refuses them", () => {
    const p = setup(), owner = { kind: 'track' as const, trackId: instrumentOf(p).id }
    const tapped = withInstrument(p, (track) => ({ ...track, fx: { ...track.fx, nodes: [...track.fx.nodes, { ...createNode('trackAudio', 0, 0), trackId: 'drums' }] } }))
    expect(externalRoutingIn(tapped, { owner, domain: 'fx' })).toEqual({ nodeType: 'trackAudio', trackId: 'drums' })
    expect(() => captureAsset(tapped, { owner, domain: 'fx' })).toThrow(/external/)
    expect(externalRoutingIn(tapped, { owner, domain: 'patch' })).toBeUndefined()
    // An instrument's save reads its note graph too.
    const notes = withInstrument(p, (track) => ({ ...track, noteGraph: { ...track.noteGraph, nodes: [...track.noteGraph.nodes, { ...createNode('trackNotes', 0, 0), trackId: 'drums' }] } }))
    expect(externalRoutingIn(notes, { owner, domain: 'patch' })).toEqual({ nodeType: 'trackNotes', trackId: 'drums' })
    expect(externalRoutingIn(notes, { owner, domain: 'notes' })).toEqual({ nodeType: 'trackNotes', trackId: 'drums' })
  })

  it('looks inside modules, nested ones included, and on the master and a bus', () => {
    const inner: ModuleDefinition = { id: 'inner', name: 'Inner', patch: { nodes: [{ ...createNode('send', 0, 0), trackId: 'ret' }], connections: [] }, inputs: [], outputs: [], knobs: [] }
    const outer: ModuleDefinition = { id: 'outer', name: 'Outer', patch: { nodes: [createModuleUse(inner, 0, 0)], connections: [] }, inputs: [], outputs: [], knobs: [] }
    const p = setup()
    const nested = { ...p, modules: [inner, outer], master: { ...p.master, fx: { ...p.master.fx, nodes: [...p.master.fx.nodes, createModuleUse(outer, 0, 0)] } } }
    expect(externalRoutingIn(nested, { owner: { kind: 'master' }, domain: 'fx' })).toEqual({ nodeType: 'send', trackId: 'ret' })
    expect(externalRoutingIn(nested, { owner: { kind: 'group', groupId: 'none' }, domain: 'fx' })).toBeUndefined()
  })
})
