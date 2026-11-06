import { describe, expect, it } from 'vitest'
import { type ExpressionTarget } from '../control'
import { type InstrumentTrack, type Project, createAudioTrack, createClip, createEmptyProject, createNote, createTrack } from '../project'
import { selectLibraryBundle, validateLibraryCatalog } from './bundle'
import { captureLibraryClip, insertLibraryClip } from './clips'
import { emptyLibrary } from './index'

/** One instrument track with a clip holding a bend lane and a CC 74 lane. */
const fixture = () => {
  const base = createEmptyProject(), track = base.tracks[0] as InstrumentTrack
  const owner = { kind: 'track' as const, trackId: track.id }
  const bend: ExpressionTarget = { kind: 'expression', owner, control: 'pitchBend' }
  const brightness: ExpressionTarget = { kind: 'expression', owner, control: 'cc', cc: 74 }
  const points = [{ id: 'a', beat: 0, value: 0.5, interpolation: 'linear' as const }, { id: 'b', beat: 2, value: 1, interpolation: 'linear' as const }]
  const clip = { ...createClip('Bent', 4, [createNote(60, 0, 4)]), automation: [{ id: 'bend', enabled: true, target: bend, points }, { id: 'cc', enabled: true, target: brightness, points }] }
  const project: Project = { ...base, tracks: [{ ...track, clips: [clip, ...track.clips.slice(1)] }] }
  return { project, track, clip, catalog: captureLibraryClip(emptyLibrary(), project, track.id, clip.id, 'Bent', null) }
}

describe('library clips with expression lanes', () => {
  it('keep the lanes without their owner, and insertion gives them the destination track', () => {
    const { project, catalog } = fixture()
    const content = catalog.items[0]!.content
    expect(content.kind === 'midi-clip' && content.lanes.map((lane) => lane.target)).toEqual([{ kind: 'expression', control: 'pitchBend' }, { kind: 'expression', control: 'cc', cc: 74 }])
    const destination = createTrack('Destination', project.sceneCount)
    const result = insertLibraryClip({ ...project, tracks: [...project.tracks, destination] }, catalog, catalog.items[0]!, destination.id, 0)
    expect(result.issues).toEqual([])
    const inserted = (result.project.tracks[1] as InstrumentTrack).clips[0]!
    expect(inserted.automation!.map((lane) => lane.target)).toEqual([
      { kind: 'expression', control: 'pitchBend', owner: { kind: 'track', trackId: destination.id } },
      { kind: 'expression', control: 'cc', cc: 74, owner: { kind: 'track', trackId: destination.id } },
    ])
    expect(inserted.automation![0]!.points.map((point) => point.value)).toEqual([0.5, 1])
  })

  it('aren’t inserted on an audio track, as no MIDI clip is', () => {
    const { project, catalog } = fixture()
    const audio = createAudioTrack('Audio', project.sceneCount)
    expect(() => insertLibraryClip({ ...project, tracks: [...project.tracks, audio] }, catalog, catalog.items[0]!, audio.id, 0)).toThrow(/matching/)
  })

  it('pass the catalog’s validation, which refuses a malformed one', () => {
    const { catalog } = fixture()
    expect(() => selectLibraryBundle(catalog, { itemIds: [catalog.items[0]!.id] })).not.toThrow()
    const raw = JSON.parse(JSON.stringify(catalog))
    raw.items[0].content.lanes[1].target.cc = 64
    expect(() => validateLibraryCatalog(raw)).toThrow(/Invalid library/)
    const signed = JSON.parse(JSON.stringify(catalog))
    signed.items[0].content.lanes[0].nodeIndex = 0
    expect(() => validateLibraryCatalog(signed)).toThrow(/unsafe portable lane/)
  })
})
