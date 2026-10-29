import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import { addTrack, createDemoProject, createReturnTrack, groupTrack, mixRouting, setGroupBus, setGroupMuted, setGroupSend, setGroupSoloed, setGroupVolume } from '../project'
import type { Project } from '../project'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** A raw saved project: the demo's tracks with ids `t1`..`t3`, a return `r`, Bass and Lead in group `g`, and `g` as given. */
const raw = (group: Record<string, unknown>, change: (project: Record<string, any>) => void = () => {}) => {
  const saved = JSON.parse(serializeProject(addTrack(createDemoProject(), createReturnTrack('Return A')))).project
  saved.tracks = saved.tracks.map((track: Record<string, unknown>, index: number) => {
    const id = index === 3 ? 'r' : `t${index + 1}`
    return { ...track, id, ...(index < 2 && { groupId: 'g' }) }
  })
  saved.groups = [{ id: 'g', name: 'G', colour: 'red', ...group }]
  change(saved)
  return JSON.stringify({ format: 'sfx-lab-project', version: CURRENT_VERSION, project: saved })
}

const bus = (extra: Record<string, unknown> = {}) => ({ volume: 0.5, fx: graph([]), sends: {}, ...extra })

/** A bus graph: Group in to Track out, with `nodes` beside them. */
const graph = (nodes: { id: string; type: string; trackId?: string }[]) =>
  noteGraphFrom([{ id: 'in', type: 'groupIn' }, ...nodes, { id: 'out', type: 'trackOut' }], ['in.out>out.in'])

/** `project` with a Send or Track audio node in a track's insert graph. */
const pointingFrom = (project: Record<string, any>, trackId: string, type: string, target: string) => {
  const track = project.tracks.find((candidate: { id: string }) => candidate.id === trackId)
  track.fx = { ...track.fx, nodes: [...track.fx.nodes, { id: `${type}_${target}`, type, trackId: target, x: 0, y: 0, params: {} }] }
}

const loadedBus = (text: string) => parseOk(text).project.groups![0]!.bus

describe('group buses in files', () => {
  it('loads a round-7 file unchanged: its groups are folders', () => {
    const { project, warnings } = parseOk(fixture('v10-track-groups.sfxlab.json'))
    expect(warnings).toEqual([])
    for (const group of project.groups!) expect(Object.keys(group).sort()).toEqual(expect.not.arrayContaining(['bus', 'muted', 'soloed']))
  })

  it('loads the committed bus fixture without warnings', () => {
    const { project, warnings } = parseOk(fixture('v10-group-buses.sfxlab.json'))
    expect(warnings).toEqual([])
    const [outer, folder, inner] = project.groups!
    expect(outer!.bus?.sends).toEqual({ track_return_a: 0.3 })
    expect(folder!.bus).toBeUndefined()
    expect(folder!.muted).toBe(true)
    expect(inner!.bus).toMatchObject({ volume: 0.7, pan: -0.25 })
    const routes = mixRouting(project)
    const [bass, lead, pad] = project.tracks
    expect(routes.get(pad!.id)).toMatchObject({ output: inner!.id, muted: true })
    expect(routes.get(inner!.id)?.output).toBe(outer!.id)
    expect(routes.get(lead!.id)).toMatchObject({ output: outer!.id, soloed: true })
    expect(routes.get(bass!.id)?.output).toBeNull()
  })

  it('keeps buses, flags and sends through save and load', () => {
    let project: Project = addTrack(createDemoProject(), { ...createReturnTrack('Return A'), id: 'ret' })
    const grouped = groupTrack(project, project.tracks[0]!.id)
    project = setGroupSend(setGroupVolume(setGroupBus(grouped.project, grouped.groupId!, true), grouped.groupId!, 0.4), grouped.groupId!, 'ret', 0.6)
    project = setGroupSoloed(setGroupMuted(project, grouped.groupId!, true), grouped.groupId!, true)
    const result = parseOk(serializeProject(project))
    expect(result.warnings).toEqual([])
    expect(result.project).toEqual(project)
  })

  it('reads the flags only as a real true, and a bus as what it knows', () => {
    const group = parseOk(raw({ muted: 'yes', soloed: 1, bus: bus({ volume: 7, pan: -9, extra: true, sends: { r: 2, t1: 'x' } }) })).project.groups![0]!
    expect(group).not.toHaveProperty('muted')
    expect(group).not.toHaveProperty('soloed')
    expect(group.bus).toMatchObject({ volume: 1, pan: -1, sends: { r: 1 } })
    expect(group.bus).not.toHaveProperty('extra')
    expect(loadedBus(raw({ bus: bus({ volume: 'loud', pan: 0 }) }))).not.toHaveProperty('pan')
    expect(loadedBus(raw({ bus: bus({ volume: 'loud' }) }))?.volume).toBe(1)
  })

  it('gives a bus without a graph the default one, silently', () => {
    const result = parseOk(raw({ bus: { volume: 0.5 } }))
    expect(result.warnings).toEqual([])
    expect(result.project.groups![0]!.bus!.fx.nodes.map((node) => node.type)).toEqual(['groupIn', 'trackOut'])
    expect(result.project.groups![0]!.bus!.sends).toEqual({})
  })

  it.each([
    ['a Send to a track that is no return', graph([{ id: 's', type: 'send', trackId: 't3' }]), {}, /Track group "G": dropped a Send that points at something that is not a return/],
    ['a Send to a missing track', graph([{ id: 's', type: 'send', trackId: 'gone' }]), {}, /Track group "G": dropped a Send/],
    ['Track audio from a missing track', graph([{ id: 'a', type: 'trackAudio', trackId: 'gone' }]), {}, /Track group "G": dropped a "audio from track" input/],
    ['a send level to a track that is no return', graph([]), { t3: 0.5 }, /Track group "G": dropped a send level for a track that is not a return/],
  ])('repairs %s with a warning', (_, fx, sends, warning) => {
    const result = parseOk(raw({ bus: bus({ fx, sends }) }))
    expect(result.warnings.some((message) => warning.test(message))).toBe(true)
    const repaired = result.project.groups![0]!.bus!
    expect(repaired.fx.nodes.every((node) => node.trackId === undefined)).toBe(true)
    expect(repaired.sends).toEqual({})
  })

  it('drops a bus Send that closes a loop through the routing', () => {
    // Bass takes audio from the return, and its bus sends to the return.
    const text = raw({ bus: bus({ fx: graph([{ id: 's', type: 'send', trackId: 'r' }]) }) }, (project) => pointingFrom(project, 't1', 'trackAudio', 'r'))
    const result = parseOk(text)
    expect(result.warnings).toEqual(['Track group "G": dropped a Send that would make two tracks depend on each other'])
    expect(result.project.groups![0]!.bus!.fx.nodes.find((node) => node.id === 's')!.trackId).toBeUndefined()
    expect(result.project.tracks[0]!.fx.nodes.some((node) => node.trackId === 'r')).toBe(true)
  })

  it('drops a bus Track audio input that closes a loop', () => {
    const text = raw({ bus: bus({ fx: graph([{ id: 'a', type: 'trackAudio', trackId: 'r' }]), sends: { r: 0.5 } }) })
    const result = parseOk(text)
    expect(result.warnings).toEqual(['Track group "G": dropped an "audio from track" input that would make two tracks depend on each other'])
  })

  it('drops a bus send level that closes a loop', () => {
    const text = raw({ bus: bus({ sends: { r: 0.5 } }) }, (project) => pointingFrom(project, 't2', 'trackAudio', 'r'))
    const result = parseOk(text)
    expect(result.warnings).toEqual(['Track group "G": dropped a send level that would make two tracks depend on each other'])
    expect(result.project.groups![0]!.bus!.sends).toEqual({})
  })
})
