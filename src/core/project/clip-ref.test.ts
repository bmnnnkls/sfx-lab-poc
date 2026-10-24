import { describe, expect, it } from 'vitest'
import {
  type InstrumentTrack,
  addSamples,
  addAudioTrackWithClip,
  clipAt,
  createArrangementClip,
  createDemoProject,
  createNote,
  doubleClip,
  editClipAt,
  regionClipRef,
  sessionClipRef,
  setClipLength,
  setClipNotes,
  updateAudioClip,
} from '.'

const kick = { id: 'kick', name: 'Kick', extension: 'wav', durationSeconds: 0.5, sampleRate: 44100, channels: 1, bytes: 1000 }

/** The demo with Bass's first clip copied to the arrangement, as a region with the same content. */
const setup = () => {
  const demo = createDemoProject()
  const bass = demo.tracks[0] as InstrumentTrack
  const source = bass.clips[0]!
  const region = createArrangementClip(bass.id, 8, source)
  return { project: { ...demo, arrangement: [region] }, bass, source, session: sessionClipRef(bass.id, source.id), region: regionClipRef(region.id) }
}

describe('clip references', () => {
  it('point at a session clip in its slot or at a region\'s own copy', () => {
    const { project, source, session, region } = setup()
    expect(clipAt(project, session)).toBe(source)
    expect(clipAt(project, region)).toBe(source)
    expect(clipAt(project, regionClipRef('gone'))).toBeUndefined()
    expect(clipAt(project, sessionClipRef('gone', source.id))).toBeUndefined()
  })

  it('edit a region without touching its session source, and the other way round', () => {
    const { project, source, session, region } = setup()
    const notes = [createNote(48, 0, 1)]
    const edited = setClipNotes(project, region, notes)
    expect(clipAt(edited, region)).toMatchObject({ id: source.id, notes })
    expect(clipAt(edited, session)).toBe(source)
    expect(edited.tracks).toBe(project.tracks)

    const longer = setClipLength(project, session, 8)
    expect(clipAt(longer, session)?.lengthBeats).toBe(8)
    expect(clipAt(longer, region)).toBe(source)
    expect(longer.arrangement).toBe(project.arrangement)
  })

  it("lengthen a region's copy, as its edge does", () => {
    const { project, region } = setup()
    expect(clipAt(doubleClip(project, region), region)?.lengthBeats).toBe(8)
    expect(clipAt(setClipLength(project, region, 12), region)?.lengthBeats).toBe(12)
  })

  it('keep the same project for a no-op edit, a ref to nothing, or a clip of the other kind', () => {
    const { project, source, session, region } = setup()
    expect(setClipNotes(project, region, source.notes)).toBe(project)
    expect(setClipNotes(project, session, source.notes)).toBe(project)
    expect(setClipLength(project, region, source.lengthBeats)).toBe(project)
    expect(setClipNotes(project, regionClipRef('gone'), [])).toBe(project)
    expect(editClipAt(project, region, (clip) => clip)).toBe(project)
    expect(updateAudioClip(project, region, { gain: 0.5 })).toBe(project)
  })

  it("edit an audio region's settings", () => {
    const withAudio = addAudioTrackWithClip(addSamples(createDemoProject(), [kick]), kick)
    const audio = withAudio.tracks.at(-1)!
    const clip = audio.kind === 'audio' ? audio.clips[0]! : null
    const regionValue = createArrangementClip(audio.id, 0, clip!)
    const project = { ...withAudio, arrangement: [regionValue] }
    const region = regionClipRef(regionValue.id)
    const edited = updateAudioClip(project, region, { gain: 0.5, loop: false })
    expect(clipAt(edited, region)).toMatchObject({ gain: 0.5, loop: false })
    expect(clipAt(edited, sessionClipRef(audio.id, clip!.id))).toMatchObject({ gain: 1, loop: true })
    expect(updateAudioClip(edited, region, { gain: 0.5 })).toBe(edited)
    expect(setClipNotes(edited, region, [])).toBe(edited)
  })
})
