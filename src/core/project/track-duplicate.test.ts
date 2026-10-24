import { describe, expect, it } from 'vitest'
import type { ControlTarget } from '../control'
import { noteGraphFrom } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { addTrack, createDemoProject, createReturnTrack, MAX_TRACKS, setTrackSend } from './index'
import { editPatchAt } from './module-edit'
import { tapSourcesOf } from './note-taps'
import { duplicateTrack } from './track-duplicate'
import type { InstrumentTrack, Project, ReturnTrack } from './types'

const demo = createDemoProject()
const [bass, lead] = demo.tracks as InstrumentTrack[]
const volume = (trackId: string): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId }, control: 'volume' })
const pan = (trackId: string): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId }, control: 'pan' })
const lane = (target: ControlTarget) => ({ id: 'lane', target, enabled: true, points: [{ id: 'p', beat: 0, value: 0.5, interpolation: 'linear' as const }] })

/** Bass with a lane on its clip, a value, a mapping, a snapshot, a region and a send; Lead reading its notes. */
const furnished = (): Project => {
  let project: Project = addTrack(demo, { ...createReturnTrack('Return A'), id: 'ret', automationSlots: [{ id: 'slot', name: 'Swell', lengthBeats: 4, automation: [lane(volume('ret'))] }] })
  project = setTrackSend(project, bass!.id, 'ret', 0.6)
  project = editPatchAt(project, { trackId: lead!.id, graph: 'notes' }, (patch) => ({
    nodes: [...patch.nodes, ...noteGraphFrom([{ id: 'tap', type: 'trackNotes', trackId: bass!.id }], []).nodes],
    connections: patch.connections,
  }))
  const clips = bass!.clips.map((clip, scene) => (clip && scene === 0 ? { ...clip, automation: [lane(volume(bass!.id))] } : clip))
  return {
    ...project,
    tracks: project.tracks.map((track) => (track.id === bass!.id ? { ...track, volume: 0.3, pan: -0.5, muted: true, voices: 4, clips } as InstrumentTrack : track)),
    controlValues: [{ target: pan(bass!.id), value: -0.5 }, { target: volume(lead!.id), value: 0.7 }],
    midiMappings: [{ id: 'map', deviceId: 'd', deviceName: 'D', channel: 0, controller: 1, target: volume(bass!.id) } as never],
    snapshots: [{ id: 'snap', name: 'Loud', scope: { owner: { kind: 'track', trackId: bass!.id }, domain: 'track' }, values: [] }],
    arrangement: [{ id: 'region', trackId: bass!.id, startBeat: 0, content: bass!.clips[0]! }],
  }
}

describe('duplicateTrack', () => {
  it('adds "name copy" right after the original', () => {
    const { project, trackId } = duplicateTrack(demo, bass!.id)
    expect(project.tracks.map((track) => track.name)).toEqual(['Bass', 'Bass copy', 'Lead', 'Pad'])
    expect(project.tracks[1]!.id).toBe(trackId)
    expect(trackId).not.toBe(bass!.id)
  })

  it('copies graphs, clips with fresh ids, mixer settings and the authored values of its controls', () => {
    const source = furnished()
    const { project, trackId } = duplicateTrack(source, bass!.id)
    const original = project.tracks[0] as InstrumentTrack, copy = project.tracks[1] as InstrumentTrack
    expect(copy).toMatchObject({ volume: 0.3, pan: -0.5, muted: true, voices: 4, sends: { ret: 0.6 } })
    expect(copy.patch).toEqual(original.patch)
    expect(copy.fx).toEqual(original.fx)
    expect(copy.noteGraph).toEqual(original.noteGraph)
    expect(copy.clips.map((clip) => clip?.name ?? null)).toEqual(['Root', 'Walk', null, null])
    expect(copy.clips[0]!.id).not.toBe(original.clips[0]!.id)
    expect(copy.clips[0]!.notes.map((note) => note.id)).not.toContain(original.clips[0]!.notes[0]!.id)
    expect(copy.clips[0]!.notes.map((note) => note.pitch)).toEqual(original.clips[0]!.notes.map((note) => note.pitch))
    const copiedLane = copy.clips[0]!.automation![0]!
    expect(copiedLane.target).toEqual(volume(trackId!))
    expect(copiedLane.id).not.toBe('lane')
    expect(project.controlValues).toEqual([...source.controlValues!, { target: pan(trackId!), value: -0.5 }])
  })

  it('leaves out MIDI mappings, snapshots, regions and note taps of the original', () => {
    const source = furnished()
    const { project, trackId } = duplicateTrack(source, bass!.id)
    expect(project.midiMappings).toBe(source.midiMappings)
    expect(project.snapshots).toBe(source.snapshots)
    expect(project.arrangement).toBe(source.arrangement)
    expect(tapSourcesOf(project, project.tracks.find((track) => track.id === lead!.id) as InstrumentTrack)).toEqual([bass!.id])
    expect(JSON.stringify(project.tracks.filter((track) => track.id !== trackId))).not.toContain(trackId!)
  })

  it("copies a return's automation slots, but not the sends to it", () => {
    const source = furnished()
    const { project, trackId } = duplicateTrack(source, 'ret')
    const copy = project.tracks.find((track) => track.id === trackId) as ReturnTrack
    expect(copy.name).toBe('Return A copy')
    expect(copy.automationSlots?.[0]).toMatchObject({ name: 'Swell', automation: [{ target: volume(trackId!) }] })
    expect(copy.automationSlots?.[0]?.id).not.toBe('slot')
    expect(project.tracks.filter((track) => track.kind !== 'return' && trackId! in track.sends)).toEqual([])
  })

  it('saves and loads', () => {
    const { project } = duplicateTrack(furnished(), bass!.id)
    const result = parseProject(serializeProject(project))
    if (!result.ok) throw new Error(result.error)
    expect(result.project.tracks[1]).toEqual(project.tracks[1])
  })

  it('stops at the track limit', () => {
    let project = demo
    while (project.tracks.length < MAX_TRACKS) project = duplicateTrack(project, bass!.id).project
    expect(duplicateTrack(project, bass!.id)).toEqual({ project, trackId: null })
    expect(duplicateTrack(demo, 'missing')).toEqual({ project: demo, trackId: null })
  })
})
