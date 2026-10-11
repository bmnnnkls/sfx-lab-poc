import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import {
  addTrack, audioSourceTracks, audioSourcesOf, createAudioTrack, createDemoProject, createReturnTrack, editPatchAt, groupNodesAsModule,
  mixDependencies, mixesAfter, removeTrack, sendableReturns, setTrackSend,
} from './index'
import type { Project } from './types'

const demo = createDemoProject()
const [bass, lead] = demo.tracks as [(typeof demo.tracks)[number], (typeof demo.tracks)[number]]

/** `reader` takes audio from `source` (a Track audio node placed in its insert graph). */
const take = (project: Project, reader: string, source: string, nodeId = `ta_${reader}_${source}`): Project =>
  editPatchAt(project, { trackId: reader, graph: 'fx' }, (fx) => ({
    nodes: [...fx.nodes, ...noteGraphFrom([{ id: nodeId, type: 'trackAudio', trackId: source }], []).nodes],
    connections: fx.connections,
  }))
const send = (project: Project, from: string, to: string): Project =>
  editPatchAt(project, { trackId: from, graph: 'fx' }, (fx) => ({
    nodes: [...fx.nodes, ...noteGraphFrom([{ id: `send_${from}_${to}`, type: 'send', trackId: to }], []).nodes],
    connections: fx.connections,
  }))

describe('Track audio in the project', () => {
  it('knows which tracks a track takes audio from, also through modules', () => {
    const taken = take(demo, bass.id, lead.id, 'tan')
    expect(audioSourcesOf(taken, taken.tracks[0]!)).toEqual([lead.id])
    expect(audioSourcesOf(taken, taken.tracks[1]!)).toEqual([])
    const grouped = groupNodesAsModule(taken, { trackId: bass.id, graph: 'fx' }, ['tan'], 'Copy')
    expect(audioSourcesOf(grouped, grouped.tracks[0]!)).toEqual([lead.id])
  })

  it('mixes the reader after the source, and follows chains', () => {
    const chain = take(take(demo, bass.id, lead.id), lead.id, demo.tracks[2]!.id)
    expect(mixDependencies(chain, bass.id)).toEqual([lead.id])
    expect(mixesAfter(chain, bass.id, demo.tracks[2]!.id)).toBe(true)
    expect(mixesAfter(chain, demo.tracks[2]!.id, bass.id)).toBe(false)
  })

  it('offers every other track except those that would make a loop', () => {
    const chain = take(take(demo, bass.id, lead.id), lead.id, demo.tracks[2]!.id) // bass <- lead <- pad
    expect(audioSourceTracks(chain, demo.tracks[2]!.id).map((t) => t.name)).toEqual([]) // everyone is mixed after pad
    expect(audioSourceTracks(chain, lead.id).map((t) => t.name)).toEqual(['Pad'])
    expect(audioSourceTracks(chain, bass.id).map((t) => t.name).sort()).toEqual(['Lead', 'Pad'])
  })

  it('counts Sends and send knobs as dependencies too, so Track audio and sends cannot loop between them', () => {
    const ret = createReturnTrack('Return A')
    const withReturn = addTrack(demo, ret)
    const sending = send(withReturn, bass.id, ret.id) // Return A is mixed after bass
    expect(mixDependencies(sending, ret.id)).toEqual([bass.id])
    // so bass may not take audio from Return A, and Return A may not take audio from bass's descendants either
    expect(audioSourceTracks(sending, bass.id).map((t) => t.name)).not.toContain('Return A')
    expect(audioSourceTracks(sending, ret.id).map((t) => t.name)).toContain('Bass')

    const knobbed = setTrackSend(withReturn, lead.id, ret.id, 0.5)
    expect(mixDependencies(knobbed, ret.id)).toEqual([lead.id])
  })

  it('a return that a track takes audio from cannot also be sent to from it: the send knob and the picker refuse', () => {
    const ret = createReturnTrack('Return A')
    const taking = take(addTrack(demo, ret), bass.id, ret.id)
    expect(setTrackSend(taking, bass.id, ret.id, 0.5)).toBe(taking)
    expect(sendableReturns(taking, bass.id).map((t) => t.name)).toEqual([])
    expect(sendableReturns(taking, lead.id).map((t) => t.name)).toEqual(['Return A'])
    expect(setTrackSend(taking, lead.id, ret.id, 0.5)).not.toBe(taking)
  })

  it('removing the source clears the inputs that took from it, in tracks and in modules', () => {
    const taken = take(demo, bass.id, lead.id, 'tan')
    const grouped = groupNodesAsModule(taken, { trackId: bass.id, graph: 'fx' }, ['tan'], 'Copy')
    const removed = removeTrack(grouped, lead.id)
    expect(removed.modules[0]!.patch.nodes.find((n) => n.type === 'trackAudio')!.trackId).toBeUndefined()
    expect(removeTrack(taken, lead.id).tracks[0]!.fx.nodes.find((n) => n.id === 'tan')!.trackId).toBeUndefined()
  })

  it('an audio track and a new track can be taken straight away', () => {
    const added = addTrack(demo, createAudioTrack('Loop', demo.sceneCount))
    expect(audioSourceTracks(added, bass.id).map((t) => t.name)).toContain('Loop')
  })
})
