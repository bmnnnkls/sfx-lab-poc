import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import { addModuleUse, createDemoProject, createReturnTrack, editPatchAt, groupNodesAsModule, removeTrack, sendTargetsOf, sendableReturns, mixesAfter } from './index'
import { addTrack } from './edit'
import type { Project, Track } from './types'

const demo = createDemoProject()
const bass = demo.tracks[0]!

/** `from` sends to `to` (a Send node placed in its insert graph). */
const send = (project: Project, from: string, to: string, nodeId = `send_${from}_${to}`): Project =>
  editPatchAt(project, { trackId: from, graph: 'fx' }, (fx) => ({
    nodes: [...fx.nodes, ...noteGraphFrom([{ id: nodeId, type: 'send', trackId: to }], []).nodes],
    connections: fx.connections,
  }))

const withReturns = (): { project: Project; a: Track; b: Track } => {
  const a = createReturnTrack('Return A')
  const b = createReturnTrack('Return B')
  return { project: addTrack(addTrack(demo, a), b), a, b }
}

describe('return tracks', () => {
  it('start with their input wired straight to their output, and have no clips', () => {
    const track = createReturnTrack('Return A')
    expect(track.kind).toBe('return')
    expect(track.fx.nodes.map((n) => n.type)).toEqual(['returnIn', 'trackOut'])
    expect(track.fx.connections).toHaveLength(1)
    expect(track).not.toHaveProperty('clips')
  })

  it('are reached by the same edit path as other insert graphs', () => {
    const { project, a } = withReturns()
    const next = editPatchAt(project, { trackId: a.id, graph: 'fx' }, (fx) => ({ ...fx, nodes: [...fx.nodes, ...noteGraphFrom([{ id: 'r', type: 'reverb' }], []).nodes] }))
    expect(next.tracks.find((t) => t.id === a.id)!.fx.nodes).toHaveLength(3)
  })
})

describe('sends in the project', () => {
  it('knows which returns a track sends to, also through modules', () => {
    const { project, a } = withReturns()
    const sent = send(project, bass.id, a.id, 'sendnode')
    expect(sendTargetsOf(sent, sent.tracks[0]!)).toEqual([a.id])
    expect(sendTargetsOf(sent, sent.tracks[1]!)).toEqual([])

    const grouped = groupNodesAsModule(sent, { trackId: bass.id, graph: 'fx' }, ['sendnode'], 'Send A')
    expect(sendTargetsOf(grouped, grouped.tracks[0]!)).toEqual([a.id])
  })

  it('offers every return except those that would make a loop, and never the track itself', () => {
    const { project, a, b } = withReturns()
    const chained = send(project, a.id, b.id) // A sends to B
    expect(sendableReturns(chained, bass.id).map((t) => t.name)).toEqual(['Return A', 'Return B'])
    expect(sendableReturns(chained, a.id).map((t) => t.name)).toEqual(['Return B'])
    expect(sendableReturns(chained, b.id).map((t) => t.name)).toEqual([]) // A sends to B: B may not send to A
    expect(mixesAfter(chained, b.id, a.id)).toBe(true) // B is mixed after A, which sends to it
    expect(mixesAfter(chained, a.id, b.id)).toBe(false)
  })

  it('removing a return clears the Sends that pointed at it, in tracks and in modules', () => {
    const { project, a } = withReturns()
    const sent = send(project, bass.id, a.id, 'sendnode')
    const grouped = groupNodesAsModule(sent, { trackId: bass.id, graph: 'fx' }, ['sendnode'], 'Send A')
    const withLoose = send(grouped, demo.tracks[1]!.id, a.id, 'loose')

    const removed = removeTrack(withLoose, a.id)
    expect(removed.modules[0]!.patch.nodes.find((n) => n.type === 'send')!.trackId).toBeUndefined()
    expect(removed.tracks.find((t) => t.id === demo.tracks[1]!.id)!.fx.nodes.find((n) => n.id === 'loose')!.trackId).toBeUndefined()
    expect(removed.tracks.some((t) => t.id === a.id)).toBe(false)
  })

  it('a use of such a module elsewhere points at the same return', () => {
    const { project, a } = withReturns()
    const grouped = groupNodesAsModule(send(project, bass.id, a.id, 'sendnode'), { trackId: bass.id, graph: 'fx' }, ['sendnode'], 'Send A')
    const other = demo.tracks[1]!
    const reused = addModuleUse(grouped, { trackId: other.id, graph: 'fx' }, grouped.modules[0]!.id, 0, 0)
    expect(sendTargetsOf(reused, reused.tracks.find((t) => t.id === other.id)!)).toEqual([a.id])
  })
})
