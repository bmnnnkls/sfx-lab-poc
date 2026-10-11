import type { InstrumentTrack } from '.'
import { describe, expect, it } from 'vitest'
import {
  MAX_CLIP_BEATS,
  createClip,
  createDemoProject,
  createNote,
  doubleClip,
  setClipAt,
  setClipLength,
} from '.'

const setup = (length = 4) => {
  const project = createDemoProject()
  const track = project.tracks[0] as InstrumentTrack
  const clip = createClip('Test', length, [createNote(60, 0, 1), createNote(64, 3, 1)])
  const next = setClipAt(project, track.id, 3, clip)
  return { project: next, trackId: track.id, clip, read: (p: typeof next) => (p.tracks[0] as InstrumentTrack).clips[3]! }
}

describe('clip length', () => {
  it('lengthening keeps notes as they are', () => {
    const { project, trackId, clip, read } = setup()
    const longer = read(setClipLength(project, trackId, clip.id, 16))

    expect(longer.lengthBeats).toBe(16)
    expect(longer.notes).toEqual(clip.notes)
  })

  it('shortening trims notes that fall outside', () => {
    const { project, trackId, clip, read } = setup()
    const shorter = read(setClipLength(project, trackId, clip.id, 2))

    expect(shorter.lengthBeats).toBe(2)
    expect(shorter.notes).toHaveLength(1)
  })

  it('clamps to the allowed range and ignores no-op changes', () => {
    const { project, trackId, clip, read } = setup()
    expect(read(setClipLength(project, trackId, clip.id, 100000)).lengthBeats).toBe(MAX_CLIP_BEATS)
    expect(read(setClipLength(project, trackId, clip.id, 0)).lengthBeats).toBe(1)
    expect(setClipLength(project, trackId, clip.id, 4)).toBe(project)
  })

  it('doubling repeats the content into the new half with fresh ids', () => {
    const { project, trackId, clip, read } = setup()
    const doubled = read(doubleClip(project, trackId, clip.id))

    expect(doubled.lengthBeats).toBe(8)
    expect(doubled.notes.map((n) => [n.pitch, n.start])).toEqual([
      [60, 0],
      [64, 3],
      [60, 4],
      [64, 7],
    ])
    expect(new Set(doubled.notes.map((n) => n.id)).size).toBe(4)
  })

  it('refuses to double past the maximum length', () => {
    const { project, trackId, clip } = setup(MAX_CLIP_BEATS)
    expect(doubleClip(project, trackId, clip.id)).toBe(project)
  })
})
