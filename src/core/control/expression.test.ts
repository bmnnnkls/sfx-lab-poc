import { describe, expect, it } from 'vitest'
import { captureSnapshot } from '../preset'
import { createNode } from '../patch'
import {
  type Project,
  addTrack,
  createArrangementClip,
  createAudioTrack,
  createDemoProject,
  createReturnTrack,
  duplicateTrack,
  editPatchAt,
  groupTrack,
  setGroupBus,
  updateArrangementClip,
} from '../project'
import { editControlBase } from './edit'
import { projectWithControlValues } from './effective'
import { EXPRESSION_OWNER_REASON, expressionTargets } from './expression'
import { controlTargetLabel } from './label'
import { remapControlTarget } from './remap'
import { enumerateControlTargets, resolveControlTarget } from './resolve'
import { type ControlOwner, type ControlTarget, type ExpressionTarget, controlTargetKey } from './types'
import { controlFromNormalized, controlToNormalized } from './values'

const track = (trackId: string): ControlOwner => ({ kind: 'track', trackId })
const bend = (owner: ControlOwner): ExpressionTarget => ({ kind: 'expression', owner, control: 'pitchBend' })
const pressure = (owner: ControlOwner): ExpressionTarget => ({ kind: 'expression', owner, control: 'pressure' })
const cc = (owner: ControlOwner, number: number): ExpressionTarget => ({ kind: 'expression', owner, control: 'cc', cc: number })

/** The demo (three instrument tracks), with an audio track, a return and Bass in a bus group. */
const fixture = () => {
  const base = addTrack(addTrack(createDemoProject(), { ...createAudioTrack('Loop', 8), id: 'audio' }), { ...createReturnTrack('Return A'), id: 'ret' })
  const grouped = groupTrack(base, base.tracks[0]!.id)
  const project = setGroupBus(grouped.project, grouped.groupId!, true)
  return { project, lead: project.tracks[1]!.id, groupId: grouped.groupId! }
}

/** Lead's patch with MIDI CC nodes reading 74, 1 and 74 again. */
const withCCNodes = (project: Project, trackId: string): Project =>
  editPatchAt(project, { trackId }, (patch) => ({
    ...patch,
    nodes: [...patch.nodes, ...[74, 1, 74].map((number, index) => ({ ...createNode('midiCC', index * 10, 0), id: `cc${index}`, params: { cc: number } }))],
  }))

describe('expression targets', () => {
  it('resolve on an instrument track only, with the rest value as base', () => {
    const { project, lead, groupId } = fixture()
    for (const target of [bend(track(lead)), pressure(track(lead)), cc(track(lead), 1), cc(track(lead), 119)]) {
      expect(resolveControlTarget(project, target)).toMatchObject({ status: 'available', baseValue: 0, automatable: true, interpolation: 'linear' })
    }
    for (const owner of [track('audio'), track('ret'), { kind: 'group', groupId } as const, { kind: 'master' } as const]) {
      expect(resolveControlTarget(project, bend(owner))).toEqual({ status: 'incompatible', reason: EXPRESSION_OWNER_REASON })
    }
    expect(resolveControlTarget(project, bend(track('gone')))).toMatchObject({ status: 'missing' })
    for (const number of [64, 120, -1, 1.5]) expect(resolveControlTarget(project, cc(track(lead), number))).toMatchObject({ status: 'incompatible' })
  })

  it('have specs in their own ranges: the bend in semitones at the track\'s range, the rest 0 to 127', () => {
    const { project, lead } = fixture()
    const ranged: Project = { ...project, tracks: project.tracks.map((t) => (t.id === lead && t.kind === 'instrument' ? { ...t, bendRange: 12 } : t)) }
    expect(resolveControlTarget(project, bend(track(lead)))).toMatchObject({ spec: { min: -1, max: 1, unit: 'st', format: 'bend', displayScale: 2 } })
    expect(resolveControlTarget(ranged, bend(track(lead)))).toMatchObject({ spec: { displayScale: 12 } })
    expect(resolveControlTarget(project, pressure(track(lead)))).toMatchObject({ spec: { min: 0, max: 1, format: 'midi7' } })
    expect(resolveControlTarget(project, cc(track(lead), 74))).toMatchObject({ spec: { min: 0, max: 1, format: 'midi7' } })
    // A lane's normalized position maps straight onto the range: the middle of a bend lane is the wheel at rest.
    const spec = (resolveControlTarget(project, bend(track(lead))) as { spec: Parameters<typeof controlFromNormalized>[0] }).spec
    expect(controlFromNormalized(spec, 0.5)).toBe(0)
    expect(controlFromNormalized(spec, 1)).toBe(1)
    expect(controlToNormalized(spec, -1)).toBe(0)
  })

  it('have keys of their own per control and CC, apart from mixer targets', () => {
    const { lead } = fixture()
    const keys = [bend(track(lead)), pressure(track(lead)), cc(track(lead), 1), cc(track(lead), 2), { kind: 'mixer', owner: track(lead), control: 'pan' } as ControlTarget].map(controlTargetKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(controlTargetKey({ owner: track(lead), cc: 7, control: 'cc', kind: 'expression' } as ControlTarget)).toBe(controlTargetKey(cc(track(lead), 7)))
  })

  it('are labelled as a musician reads them', () => {
    const { project, lead } = fixture()
    expect(controlTargetLabel(project, bend(track(lead)))).toBe('MIDI / Pitch bend')
    expect(controlTargetLabel(project, pressure(track(lead)))).toBe('MIDI / Pressure')
    expect(controlTargetLabel(project, cc(track(lead), 1))).toBe('MIDI / CC 1 Mod wheel')
    expect(controlTargetLabel(project, cc(track(lead), 3))).toBe('MIDI / CC 3')
  })

  it('are listed for an instrument track: bend, pressure, the mod wheel and the CCs its patch reads', () => {
    const { project, lead } = fixture()
    const read = withCCNodes(project, lead)
    const listed = (p: Project, trackId: string) => expressionTargets(p, trackId).map((t) => (t.control === 'cc' ? t.cc : t.control))
    expect(listed(project, lead)).toEqual(['pitchBend', 'pressure', 1])
    expect(listed(read, lead)).toEqual(['pitchBend', 'pressure', 1, 74])
    expect(listed(read, 'audio')).toEqual([])
    expect(listed(read, 'ret')).toEqual([])
    const enumerated = enumerateControlTargets(read).filter((t) => t.kind === 'expression')
    expect(enumerated.filter((t) => t.owner.kind === 'track' && t.owner.trackId === lead).map(controlTargetKey)).toEqual(expressionTargets(read, lead).map(controlTargetKey))
    expect(enumerated.every(({ owner: o }) => o.kind === 'track' && read.tracks.find((candidate) => candidate.id === o.trackId)?.kind === 'instrument')).toBe(true)
  })

  it('have no base to edit, no projection, and no place in snapshots', () => {
    const { project, lead } = fixture()
    expect(editControlBase(project, bend(track(lead)), 0.5)).toMatchObject({ status: 'incompatible', project })
    expect(projectWithControlValues(project, [{ target: bend(track(lead)), value: 0.5 }])).toEqual(projectWithControlValues(project))
    const snapshot = captureSnapshot(project, { owner: track(lead), domain: 'track' }, 'All')
    expect(snapshot.values.some((entry) => entry.target.kind === 'expression')).toBe(false)
  })

  it('follow their owner: remapped, duplicated with a track, and moved with a region', () => {
    const { project, lead } = fixture()
    const other = project.tracks[2]!.id
    expect(remapControlTarget(bend(track(lead)), { owners: { [lead]: other } }, project)).toEqual({ status: 'mapped', target: bend(track(other)) })
    expect(remapControlTarget(bend(track(lead)), { owners: { [lead]: 'audio' } }, project)).toMatchObject({ status: 'incompatible' })

    const laned: Project = { ...project, tracks: project.tracks.map((t) => (t.id !== lead || t.kind !== 'instrument' ? t : { ...t, clips: t.clips.map((clip, index) => (index === 0 && clip ? { ...clip, automation: [{ id: 'lane', target: bend(track(lead)), enabled: true, points: [] }] } : clip)) })) }
    const duplicated = duplicateTrack(laned, lead)
    const copy = duplicated.project.tracks.find((t) => t.id === duplicated.trackId)
    expect(copy?.kind === 'instrument' && copy.clips[0]?.automation?.[0]?.target).toEqual(bend(track(duplicated.trackId!)))

    const leadTrack = laned.tracks.find((t) => t.id === lead)
    const clip = leadTrack?.kind === 'instrument' ? leadTrack.clips[0]! : undefined
    const region = createArrangementClip(lead, 0, clip!)
    const [moved] = updateArrangementClip([region], region.id, { trackId: other })
    expect(moved?.content.automation?.[0]?.target).toEqual(bend(track(other)))
  })
})
