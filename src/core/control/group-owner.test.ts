import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { captureSnapshot, recallSnapshot } from '../preset'
import {
  type Project,
  addTrack,
  createDemoProject,
  createReturnTrack,
  editPatchAt,
  groupNodesAsModule,
  groupTrack,
  removeGroup,
  setGroupBus,
  setGroupSend,
  setGroupVolume,
  ungroup,
} from '../project'
import { diffProject } from '../sync'
import { editControlBase } from './edit'
import { projectWithControlValues } from './effective'
import { remapControlTarget } from './remap'
import { enumerateControlTargets, resolveControlTarget } from './resolve'
import { type ControlTarget, controlTargetKey } from './types'

/** The demo with a return, and Bass in a bus group whose graph has a gain. */
const fixture = () => {
  const base = addTrack(createDemoProject(), { ...createReturnTrack('Return A'), id: 'ret' })
  const grouped = groupTrack(base, base.tracks[0]!.id)
  const groupId = grouped.groupId!
  const project = editPatchAt(setGroupBus(grouped.project, groupId, true), { groupId }, (fx) => ({
    ...fx,
    nodes: [...fx.nodes, ...noteGraphFrom([{ id: 'gain', type: 'gain', params: { gain: 0.5 } }], []).nodes],
  }))
  return { project, folder: grouped.project, groupId }
}

const owner = (groupId: string) => ({ kind: 'group' as const, groupId })
const gain = (groupId: string): Extract<ControlTarget, { kind: 'graph' }> => ({ kind: 'graph', owner: owner(groupId), domain: 'fx', path: [], nodeId: 'gain', nodeType: 'gain', paramId: 'gain' })
const fader = (groupId: string): ControlTarget => ({ kind: 'mixer', owner: owner(groupId), control: 'volume' })
const busOf = (project: Project, groupId: string) => project.groups!.find((group) => group.id === groupId)!.bus!

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('a group as a control owner', () => {
  it('resolves its bus\'s fader, pan, sends and effects', () => {
    const { project, groupId } = fixture()
    expect(resolveControlTarget(project, fader(groupId))).toMatchObject({ status: 'available', baseValue: 1 })
    expect(resolveControlTarget(project, { kind: 'mixer', owner: owner(groupId), control: 'pan' })).toMatchObject({ status: 'available', baseValue: 0 })
    const sent = setGroupSend(project, groupId, 'ret', 0.4)
    expect(resolveControlTarget(sent, { kind: 'mixer', owner: owner(groupId), control: 'send', returnId: 'ret' })).toMatchObject({ status: 'available', baseValue: 0.4 })
    expect(resolveControlTarget(project, gain(groupId))).toMatchObject({ status: 'available', baseValue: 0.5 })
    expect(resolveControlTarget(project, { ...gain(groupId), domain: 'patch' })).toMatchObject({ status: 'incompatible' })
  })

  it('has its targets missing while it is a folder, or gone', () => {
    const { folder, groupId } = fixture()
    expect(resolveControlTarget(folder, fader(groupId))).toEqual({ status: 'missing', reason: 'The group has no bus' })
    expect(resolveControlTarget(folder, gain(groupId))).toEqual({ status: 'missing', reason: 'The group has no bus' })
    expect(resolveControlTarget(folder, fader('nothing'))).toMatchObject({ status: 'missing' })
  })

  it('is enumerated with a key of its own', () => {
    const { project, groupId } = fixture()
    const targets = enumerateControlTargets(project).filter((target) => target.owner.kind === 'group')
    expect(targets.map((target) => (target.kind === 'graph' ? target.paramId : target.control))).toEqual(['volume', 'pan', 'send', 'gain'])
    expect(controlTargetKey(fader(groupId))).not.toBe(controlTargetKey({ kind: 'mixer', owner: { kind: 'track', trackId: groupId }, control: 'volume' }))
  })

  it('edits the bus\'s base, and projects overrides onto it for the engine', () => {
    const { project, groupId } = fixture()
    const edited = editControlBase(project, fader(groupId), 0.3)
    expect(edited.status).toBe('applied')
    expect(busOf(edited.project, groupId).volume).toBe(0.3)
    const knob = editControlBase(project, gain(groupId), 0.8).project
    expect(busOf(knob, groupId).fx.nodes.find((node) => node.id === 'gain')!.params.gain).toBe(0.8)
    const projected = projectWithControlValues(project, [{ target: fader(groupId), value: 0.2 }])
    expect(busOf(projected, groupId).volume).toBe(0.2)
    expect(diffProject(project, projected, false)).toEqual([{ type: 'track/setVolume', trackId: groupId, volume: 0.2 }])
  })

  it('recalls a snapshot of the bus\'s effects onto it', () => {
    const { project, groupId } = fixture()
    const snapshot = captureSnapshot(project, { owner: owner(groupId), domain: 'fx' }, 'Bus')
    expect(snapshot.values.map((value) => value.target)).toEqual([gain(groupId)])
    const changed = editControlBase(project, gain(groupId), 0.9).project
    const recalled = recallSnapshot(changed, snapshot)
    expect(recalled.issues).toEqual([])
    expect(busOf(recalled.project, groupId).fx.nodes.find((node) => node.id === 'gain')!.params.gain).toBe(0.5)
  })

  it('remaps by group id, and keeps routes through module grouping', () => {
    const { project, groupId } = fixture()
    const moved = remapControlTarget(fader(groupId), { owners: { [groupId]: 'other' } }, project)
    expect(moved).toMatchObject({ status: 'missing' })
    const withValue = editControlBase(project, gain(groupId), 0.7).project
    const mapped = { ...withValue, midiMappings: [{ id: 'm', deviceId: 'd', deviceName: 'D', channel: 0, cc: 1, target: gain(groupId), pickup: false }] }
    const grouped = groupNodesAsModule(mapped, { groupId }, ['gain'])
    const target = grouped.midiMappings![0]!.target
    expect(target.kind === 'graph' && target.path.length).toBe(1)
    expect(resolveControlTarget(grouped, target).status).toBe('available')
  })

  it('loses its control values and mappings when the group goes', () => {
    const { project, groupId } = fixture()
    const mapped: Project = {
      ...project,
      controlValues: [{ target: { ...gain(groupId), path: [{ nodeId: 'use', moduleId: 'mod' }] }, value: 0.1 }],
      midiMappings: [{ id: 'm', deviceId: 'd', deviceName: 'D', channel: 0, cc: 1, target: fader(groupId), pickup: false }],
    }
    for (const gone of [ungroup(mapped, groupId), removeGroup(mapped, groupId)]) {
      expect(gone.controlValues ?? []).toEqual([])
      expect(gone.midiMappings ?? []).toEqual([])
    }
    // Switching the bus off keeps them, unavailable, for undo.
    expect(setGroupBus(mapped, groupId, false).midiMappings).toHaveLength(1)
  })

  it('keeps a learned group fader through save and load', () => {
    const { project, groupId } = fixture()
    const mapped: Project = { ...setGroupVolume(project, groupId, 0.6), midiMappings: [{ id: 'm', deviceId: 'd', deviceName: 'D', channel: 0, cc: 1, target: fader(groupId), pickup: false }] }
    const result = parseOk(serializeProject(mapped))
    expect(result.warnings).toEqual([])
    expect(result.project.midiMappings).toEqual(mapped.midiMappings)
  })

  it('loads the bus fixture\'s learned fader', () => {
    const { project, warnings } = parseOk(readFileSync(new URL('../persistence/fixtures/v10-group-buses.sfxlab.json', import.meta.url), 'utf8'))
    expect(warnings).toEqual([])
    expect(resolveControlTarget(project, project.midiMappings![0]!.target).status).toBe('available')
  })

  it('is refused by the automation parsers, with their warning', () => {
    const { project, groupId } = fixture()
    const saved = JSON.parse(serializeProject(project))
    const instrument = saved.project.tracks[0]
    instrument.clips[0] = { ...instrument.clips[0], automation: [{ id: 'lane', enabled: true, target: fader(groupId), points: [] }] }
    const result = parseOk(JSON.stringify(saved))
    expect(result.warnings).toEqual(['Unsupported automation owner in lane "lane"; lane retained but will not play'])
  })
})
