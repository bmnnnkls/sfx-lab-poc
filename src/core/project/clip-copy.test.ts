import { describe, expect, it } from 'vitest'
import type { SampleInfo } from '../sample'
import { addAudioTrackWithClip, addSamples, addTrack, createDemoProject, createReturnTrack, removeSample } from './index'
import { canPasteSessionClip, pasteSessionClip } from './clip-copy'
import type { AudioTrack, InstrumentTrack, Project } from './types'

const kick: SampleInfo = { id: 'k'.repeat(64), name: 'Kick', extension: 'wav', durationSeconds: 0.5, sampleRate: 44100, channels: 1, bytes: 1000 }
const base: Project = addTrack(addAudioTrackWithClip(addSamples(createDemoProject(), [kick]), kick), { ...createReturnTrack('Return A'), id: 'ret' })
const project = (): Project => base
const [bass, lead] = project().tracks as InstrumentTrack[]
const audio = project().tracks[3] as AudioTrack
const lane = { id: 'lane', target: { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: bass!.id }, control: 'volume' as const }, enabled: true, points: [{ id: 'p', beat: 0, value: 0.5, interpolation: 'linear' as const }] }
const root = { ...bass!.clips[0]!, automation: [lane] }

describe('pasteSessionClip', () => {
  it('puts a copy with fresh ids into an empty slot, its lanes moved to that track', () => {
    const pasted = pasteSessionClip(project(), root, lead!.id, 1)
    const copy = (pasted.tracks[1] as InstrumentTrack).clips[1]!
    expect(copy.name).toBe('Root')
    expect(copy.id).not.toBe(root.id)
    expect(copy.notes.map((note) => note.id)).not.toContain(root.notes[0]!.id)
    expect(copy.notes.map((note) => note.pitch)).toEqual(root.notes.map((note) => note.pitch))
    expect(copy.automation?.[0]?.target.owner).toEqual({ kind: 'track', trackId: lead!.id })
    expect(copy.automation?.[0]?.id).not.toBe('lane')
  })

  it('pastes a clip whose track is gone', () => {
    const withoutBass = { ...project(), tracks: project().tracks.slice(1) }
    expect((pasteSessionClip(withoutBass, root, lead!.id, 1).tracks[0] as InstrumentTrack).clips[1]?.name).toBe('Root')
  })

  it('refuses an occupied slot, another kind of track, a return and a scene outside the grid', () => {
    const source = project()
    for (const [trackId, scene] of [[lead!.id, 0], [audio.id, 1], ['ret', 1], [lead!.id, 4], ['missing', 1]] as const) {
      expect(canPasteSessionClip(source, root, trackId, scene)).toBe(false)
      expect(pasteSessionClip(source, root, trackId, scene)).toBe(source)
    }
  })

  it('pastes an audio clip only while its sample is in the project', () => {
    const clip = audio.clips[0]!
    expect((pasteSessionClip(project(), clip, audio.id, 2).tracks[3] as AudioTrack).clips[2]?.sampleId).toBe(kick.id)
    const removed = removeSample(project(), kick.id)
    expect(canPasteSessionClip(removed, clip, audio.id, 2)).toBe(false)
  })
})
