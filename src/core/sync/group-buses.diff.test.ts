import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import {
  type Project,
  addTrack,
  createDemoProject,
  createReturnTrack,
  groupTrack,
  moveTrack,
  setGroupBus,
  setGroupMuted,
  setGroupPan,
  setGroupSend,
  setGroupSoloed,
  setGroupVolume,
  editPatchAt,
} from '../project'
import { diffProject } from './diff-project'

/** The demo with a return, and Bass in a group with a bus. */
const fixture = () => {
  const base = addTrack(createDemoProject(), { ...createReturnTrack('Return A'), id: 'ret' })
  const [bass, lead, pad] = base.tracks
  const grouped = groupTrack(base, bass!.id)
  return { folder: grouped.project, project: setGroupBus(grouped.project, grouped.groupId!, true), groupId: grouped.groupId!, bass: bass!.id, lead: lead!.id, pad: pad!.id }
}

const types = (prev: Project | null, next: Project) => diffProject(prev, next, false).map((command) => command.type)

describe('diffProject with group buses', () => {
  it('adds a bus as a channel, and its members with their output', () => {
    const { project, groupId, bass, lead } = fixture()
    const commands = diffProject(null, project, false)
    expect(commands).toContainEqual(expect.objectContaining({ type: 'track/add', kind: 'group', trackId: groupId, volume: 1, sends: {} }))
    expect(commands).toContainEqual(expect.objectContaining({ type: 'track/add', trackId: bass, output: groupId }))
    const leadAdd = commands.find((command) => command.type === 'track/add' && command.trackId === lead)
    expect(leadAdd).not.toHaveProperty('output')
  })

  it('switching the bus on adds it and routes the members; off routes them back and removes it', () => {
    const { folder, project, groupId, bass } = fixture()
    expect(diffProject(folder, project, false)).toEqual([
      { type: 'track/setOutput', trackId: bass, output: groupId },
      expect.objectContaining({ type: 'track/add', kind: 'group', trackId: groupId }),
    ])
    expect(diffProject(project, folder, false)).toEqual([
      { type: 'track/remove', trackId: groupId },
      { type: 'track/setOutput', trackId: bass, output: null },
    ])
  })

  it('a move into and out of a bus group changes only the output', () => {
    const { project, groupId, bass, lead } = fixture()
    const moved = moveTrack(project, lead, { inside: groupId })
    expect(diffProject(project, moved, false)).toEqual([{ type: 'track/setOutput', trackId: lead, output: groupId }])
    const out = moveTrack(moved, lead, { after: { kind: 'track', id: project.tracks[2]!.id } })
    expect(diffProject(moved, out, false)).toEqual([{ type: 'track/setOutput', trackId: lead, output: null }])
    expect(types(project, moveTrack(project, bass, { inside: groupId }))).toEqual([])
  })

  it('a group mute or solo reaches every member and the bus', () => {
    const { project, groupId, bass } = fixture()
    expect(diffProject(project, setGroupMuted(project, groupId, true), false)).toEqual([
      { type: 'track/setMute', trackId: bass, muted: true },
      { type: 'track/setMute', trackId: groupId, muted: true },
    ])
    expect(diffProject(project, setGroupSoloed(project, groupId, true), false)).toEqual([
      { type: 'track/setSolo', trackId: bass, soloed: true },
      { type: 'track/setSolo', trackId: groupId, soloed: true },
    ])
  })

  it('a folder mute reaches its members, though it has no channel', () => {
    const { folder, groupId, bass } = fixture()
    expect(diffProject(folder, setGroupMuted(folder, groupId, true), false)).toEqual([{ type: 'track/setMute', trackId: bass, muted: true }])
  })

  it('sends the bus fader, pan, sends and graph like a track\'s', () => {
    const { project, groupId } = fixture()
    expect(diffProject(project, setGroupVolume(project, groupId, 0.5), false)).toEqual([{ type: 'track/setVolume', trackId: groupId, volume: 0.5 }])
    expect(diffProject(project, setGroupPan(project, groupId, 0.5), false)).toEqual([{ type: 'track/setPan', trackId: groupId, pan: 0.5 }])
    expect(diffProject(project, setGroupSend(project, groupId, 'ret', 0.5), false)).toEqual([{ type: 'track/setSends', trackId: groupId, sends: { ret: 0.5 } }])
    const withReverb = editPatchAt(project, { groupId }, (fx) => ({ ...fx, nodes: [...fx.nodes, ...noteGraphFrom([{ id: 'r', type: 'reverb' }], []).nodes] }))
    expect(types(project, withReverb)).toEqual(['track/setFx'])
  })

  it('a project without buses or group flags sends what it sent before', () => {
    const { folder } = fixture()
    expect(diffProject(null, folder, false).some((command) => command.type === 'track/setOutput' || 'output' in command)).toBe(false)
  })
})
