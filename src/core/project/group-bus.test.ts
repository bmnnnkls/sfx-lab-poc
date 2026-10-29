import { describe, expect, it } from 'vitest'
import { createSamplerPatch, noteGraphFrom } from '../patch'
import {
  addModuleUse,
  addTrack,
  createDemoProject,
  createReturnTrack,
  createTrack,
  duplicateTrack,
  editPatchAt,
  hasMixLoop,
  mixDependencies,
  mixRouting,
  mixesAfter,
  moduleUsage,
  patchAt,
  removeSample,
  removeTrack,
  sendableReturns,
  audioSourceTracks,
  usedSampleIds,
} from './index'
import {
  busOf,
  createGroupBus,
  setGroupBus,
  setGroupMuted,
  setGroupPan,
  setGroupSend,
  setGroupSoloed,
  setGroupVolume,
} from './group-bus'
import { canMoveGroup, canMoveTrack, groupTrack, moveGroup, moveTrack, removeGroup, ungroup } from './track-groups'
import type { Project } from './types'

/**
 * Tracks A, B, C and D and a return R, grouped as Outer (a bus) around A and Middle (a folder), Middle around Inner (a
 * bus) around B; C is in Outer too, D at the top level.
 */
const fixture = (): Project => {
  let project: Project = { ...createDemoProject(), tracks: [], groups: undefined }
  for (const name of ['A', 'B', 'C', 'D']) project = addTrack(project, { ...createTrack(name, 4), id: name })
  project = addTrack(project, { ...createReturnTrack('R'), id: 'R' })
  project = {
    ...project,
    groups: [
      { id: 'outer', name: 'Outer', colour: 'red' },
      { id: 'middle', name: 'Middle', colour: 'blue', parentId: 'outer' },
      { id: 'inner', name: 'Inner', colour: 'green', parentId: 'middle' },
    ],
    tracks: project.tracks.map((track) => (track.id === 'A' || track.id === 'C' ? { ...track, groupId: 'outer' } : track.id === 'B' ? { ...track, groupId: 'inner' } : track)),
  }
  return setGroupBus(setGroupBus(project, 'outer', true), 'inner', true)
}

/** A node of `type` pointing at `trackId`, added to the graph at `target`. */
const pointing = (project: Project, target: Parameters<typeof editPatchAt>[1], type: 'send' | 'trackAudio', trackId: string, nodeId = `${type}_${trackId}`): Project =>
  editPatchAt(project, target, (fx) => ({ nodes: [...fx.nodes, ...noteGraphFrom([{ id: nodeId, type, trackId }], []).nodes], connections: fx.connections }))

const group = (project: Project, id: string) => project.groups!.find((candidate) => candidate.id === id)!

describe('group buses', () => {
  it('start at unity with Group in wired to Track out and nothing sent', () => {
    const bus = createGroupBus()
    expect(bus).toMatchObject({ volume: 1, sends: {} })
    expect(bus.fx.nodes.map((node) => node.type)).toEqual(['groupIn', 'trackOut'])
    expect(bus.fx.connections).toHaveLength(1)
  })

  it('switch on and off, and give the same project when nothing changes', () => {
    const project = fixture()
    expect(setGroupBus(project, 'outer', true)).toBe(project)
    expect(setGroupBus(project, 'middle', false)).toBe(project)
    expect(setGroupBus(project, 'nothing', true)).toBe(project)
    const off = setGroupBus(project, 'outer', false)
    expect(group(off, 'outer')).not.toHaveProperty('bus')
    expect(busOf(off, 'inner')).toBeDefined()
    expect(busOf(setGroupBus(project, 'middle', true), 'middle')?.volume).toBe(1)
  })

  it('clamp the fader and pan, and leave a folder alone', () => {
    const project = fixture()
    expect(busOf(setGroupVolume(project, 'outer', 2), 'outer')?.volume).toBe(1)
    expect(busOf(setGroupVolume(project, 'outer', 0.25), 'outer')?.volume).toBe(0.25)
    expect(setGroupVolume(project, 'outer', 1)).toBe(project)
    expect(setGroupVolume(project, 'middle', 0.5)).toBe(project)
    const panned = setGroupPan(project, 'outer', -3)
    expect(busOf(panned, 'outer')?.pan).toBe(-1)
    expect(busOf(setGroupPan(panned, 'outer', 0), 'outer')).not.toHaveProperty('pan')
    expect(setGroupPan(project, 'outer', 0)).toBe(project)
  })

  it('send to returns after the fader, and refuse a target that is no return or would loop', () => {
    const project = fixture()
    const sent = setGroupSend(project, 'outer', 'R', 0.5)
    expect(busOf(sent, 'outer')?.sends).toEqual({ R: 0.5 })
    expect(busOf(setGroupSend(sent, 'outer', 'R', 0), 'outer')?.sends).toEqual({})
    expect(setGroupSend(project, 'outer', 'R', 0)).toBe(project)
    expect(setGroupSend(project, 'outer', 'A', 0.5)).toBe(project)
    expect(setGroupSend(project, 'middle', 'R', 0.5)).toBe(project)
    // The bus takes audio from R, so it can't also send to it.
    const reading = pointing(project, { groupId: 'outer' }, 'trackAudio', 'R')
    expect(setGroupSend(reading, 'outer', 'R', 0.5)).toBe(reading)
    expect(sendableReturns(reading, 'outer')).toEqual([])
  })

  it('mute and solo any group, a folder as well', () => {
    const project = fixture()
    const muted = setGroupMuted(project, 'middle', true)
    expect(group(muted, 'middle').muted).toBe(true)
    expect(setGroupMuted(muted, 'middle', true)).toBe(muted)
    expect(group(setGroupMuted(muted, 'middle', false), 'middle')).not.toHaveProperty('muted')
    expect(group(setGroupSoloed(project, 'outer', true), 'outer').soloed).toBe(true)
    expect(setGroupSoloed(project, 'outer', false)).toBe(project)
  })

  it('edit their graph through a patch target', () => {
    const project = fixture()
    const next = editPatchAt(project, { groupId: 'outer' }, (fx) => ({ ...fx, nodes: [...fx.nodes, ...noteGraphFrom([{ id: 'r', type: 'reverb' }], []).nodes] }))
    expect(patchAt(next, { groupId: 'outer' })!.nodes).toHaveLength(3)
    expect(patchAt(next, { groupId: 'middle' })).toBeUndefined()
    expect(editPatchAt(project, { groupId: 'middle' }, (fx) => ({ ...fx, nodes: [] }))).toBe(project)
  })
})

describe('mix routing', () => {
  it('sends each track to the nearest enclosing bus, through folders', () => {
    const routes = mixRouting(fixture())
    expect(routes.get('A')?.output).toBe('outer')
    expect(routes.get('B')?.output).toBe('inner')
    expect(routes.get('C')?.output).toBe('outer')
    expect(routes.get('D')?.output).toBeNull()
    expect(routes.get('R')?.output).toBeNull()
    // A bus's own group doesn't count: Inner goes through the folder to Outer.
    expect(routes.get('inner')?.output).toBe('outer')
    expect(routes.get('outer')?.output).toBeNull()
    expect(routes.has('middle')).toBe(false)
  })

  it('works out mute and solo from every enclosing group', () => {
    const muted = mixRouting(setGroupMuted(fixture(), 'middle', true))
    expect(muted.get('B')).toMatchObject({ muted: true, soloed: false })
    expect(muted.get('inner')?.muted).toBe(true)
    expect(muted.get('A')?.muted).toBe(false)
    expect(muted.get('outer')?.muted).toBe(false)
    const soloed = mixRouting(setGroupSoloed(fixture(), 'outer', true))
    for (const id of ['A', 'B', 'C', 'inner', 'outer']) expect(soloed.get(id)?.soloed).toBe(true)
    expect(soloed.get('D')?.soloed).toBe(false)
  })

  it('keeps a return to its own flags', () => {
    let project = fixture()
    project = { ...project, tracks: project.tracks.map((track) => (track.id === 'R' ? { ...track, muted: true } : track)) }
    expect(mixRouting(setGroupSoloed(project, 'outer', true)).get('R')).toEqual({ output: null, muted: true, soloed: false })
  })

  it('gives the same map while tracks and groups are the same', () => {
    const project = fixture()
    expect(mixRouting(project)).toBe(mixRouting({ ...project, name: 'other' } as Project))
  })
})

describe('the mix order with buses', () => {
  it('mixes a bus after what sums into it, and a return after the buses that send to it', () => {
    const project = setGroupSend(fixture(), 'inner', 'R', 0.5)
    expect(mixDependencies(project, 'outer').sort()).toEqual(['A', 'C', 'inner'])
    expect(mixDependencies(project, 'inner')).toEqual(['B'])
    expect(mixDependencies(project, 'R')).toEqual(['inner'])
    expect(mixDependencies(project, 'middle')).toEqual([])
    expect(mixesAfter(project, 'outer', 'B')).toBe(true)
    expect(mixesAfter(project, 'R', 'B')).toBe(true)
  })

  it('offers a bus tracks to take audio from, never a bus, and none mixed after it', () => {
    const project = setGroupSend(fixture(), 'outer', 'R', 0.5)
    expect(audioSourceTracks(project, 'outer').map((track) => track.id)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('finds a loop through a bus', () => {
    const project = fixture()
    expect(hasMixLoop(project)).toBe(false)
    // A takes audio from R and the bus A sums into sends to R: Outer waits for A, A for R, R for Outer.
    const looped = setGroupSend(pointing(project, { trackId: 'D', graph: 'fx' }, 'trackAudio', 'R'), 'outer', 'R', 0.5)
    expect(hasMixLoop(looped)).toBe(false)
    expect(hasMixLoop({ ...looped, tracks: looped.tracks.map((track) => (track.id === 'D' ? { ...track, groupId: 'outer' } : track)) })).toBe(true)
  })

  it('refuses a move that would close a loop', () => {
    const project = setGroupSend(pointing(fixture(), { trackId: 'D', graph: 'fx' }, 'trackAudio', 'R'), 'outer', 'R', 0.5)
    expect(canMoveTrack(project, 'D', { inside: 'outer' })).toBe(false)
    expect(canMoveTrack(project, 'D', { after: { kind: 'track', id: 'A' } })).toBe(false)
    expect(moveTrack(project, 'D', { inside: 'outer' })).toBe(project)
    // Into the folder that Inner's bus sums: Inner goes to Outer, so that loops too.
    expect(canMoveTrack(project, 'D', { inside: 'middle' })).toBe(false)
    expect(canMoveTrack(project, 'A', { after: { kind: 'track', id: 'D' } })).toBe(true)
    const grouped = groupTrack(project, 'D')
    expect(canMoveGroup(grouped.project, grouped.groupId!, { inside: 'outer' })).toBe(false)
    expect(moveGroup(grouped.project, grouped.groupId!, { inside: 'outer' })).toBe(grouped.project)
  })

  it('moves a track into a bus and changes its output', () => {
    const moved = moveTrack(fixture(), 'D', { inside: 'inner' })
    expect(mixRouting(moved).get('D')?.output).toBe('inner')
  })
})

describe('edits that touch buses', () => {
  it('drop the bus with its group', () => {
    const project = fixture()
    expect(ungroup(project, 'inner').groups!.some((candidate) => candidate.id === 'inner')).toBe(false)
    expect(mixRouting(ungroup(project, 'inner')).get('B')?.output).toBe('outer')
    expect(removeGroup(project, 'inner').groups!.map((candidate) => candidate.id)).toEqual(['outer'])
    // Inner's last track leaves, so the group goes, bus and all.
    const left = moveTrack(project, 'B', { after: { kind: 'track', id: 'D' } })
    expect(left.groups!.map((candidate) => candidate.id)).toEqual(['outer'])
  })

  it('removing a track clears what bus graphs and bus sends pointed at it', () => {
    let project = setGroupSend(fixture(), 'outer', 'R', 0.5)
    project = pointing(project, { groupId: 'inner' }, 'trackAudio', 'D')
    project = pointing(project, { groupId: 'inner' }, 'send', 'R')
    const withoutR = removeTrack(project, 'R')
    expect(busOf(withoutR, 'outer')?.sends).toEqual({})
    expect(busOf(withoutR, 'inner')!.fx.nodes.find((node) => node.type === 'send')!.trackId).toBeUndefined()
    const withoutD = removeTrack(project, 'D')
    expect(busOf(withoutD, 'inner')!.fx.nodes.find((node) => node.type === 'trackAudio')!.trackId).toBeUndefined()
  })

  it('count bus graphs as module users and sample users', () => {
    let project = fixture()
    const module = { id: 'mod', name: 'Mod', patch: { nodes: [], connections: [] }, inputs: [], outputs: [], knobs: [] }
    project = addModuleUse({ ...project, modules: [...project.modules, module] } as Project, { groupId: 'outer' }, 'mod', 0, 0)
    expect(moduleUsage(project, 'mod')).toMatchObject({ uses: 1, tracks: ['Group Outer'] })
    const sampler = createSamplerPatch('sample_1').nodes.find((node) => node.type === 'sampler')!
    project = editPatchAt(project, { groupId: 'inner' }, (fx) => ({ ...fx, nodes: [...fx.nodes, sampler] }))
    expect(usedSampleIds(project)).toContain('sample_1')
    const removed = removeSample(project, 'sample_1')
    expect(busOf(removed, 'inner')!.fx.nodes.find((node) => node.id === sampler.id)!.sampleId).toBeUndefined()
  })

  it('a copy of a track in a bus group sums into the same bus', () => {
    const copied = duplicateTrack(fixture(), 'B')
    expect(mixRouting(copied.project).get(copied.trackId!)?.output).toBe('inner')
  })
})
