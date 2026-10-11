import type { InstrumentTrack } from '../project'
import { describe, expect, it } from 'vitest'
import { moveNode, setNodeParam, setNodeSample } from '../patch'
import {
  createDemoProject,
  setClipAt,
  setTempo,
  setTrackPatch,
  setTrackVoices,
  setTrackVolume,
} from '../project'
import { addAudioTrackWithClip, addSamples, createAudioTrack, addTrack, setTrackVolume as setVolume, updateAudioClip, isAudioTrack } from '../project'
import { diffProject } from './diff-project'

describe('diffProject', () => {
  const project = createDemoProject()
  const track = project.tracks[0] as InstrumentTrack

  it('describes a whole project as tempo + one add per track when starting from nothing', () => {
    const commands = diffProject(null, project)
    expect(commands.map((c) => c.type)).toEqual(['transport/setTempo', 'track/add', 'track/add', 'track/add'])
  })

  it('emits nothing for an identical project', () => {
    expect(diffProject(project, project)).toEqual([])
  })

  it('maps param edits to setParam without rebuilding the patch', () => {
    const osc = track.patch.nodes.find((n) => n.type === 'oscillator')!
    const next = setTrackPatch(project, track.id, setNodeParam(track.patch, osc.id, 'detune', 12))

    expect(diffProject(project, next)).toEqual([
      { type: 'track/setParam', trackId: track.id, nodeId: osc.id, paramId: 'detune', value: 12 },
    ])
  })

  it('ignores canvas position changes', () => {
    const node = track.patch.nodes[0]!
    const next = setTrackPatch(project, track.id, moveNode(track.patch, node.id, 500, 500))

    expect(diffProject(project, next)).toEqual([])
  })

  it('maps a sample change on a node to setSample, without rebuilding the patch', () => {
    const osc = track.patch.nodes.find((n) => n.type === 'oscillator')!
    const next = setTrackPatch(project, track.id, setNodeSample(track.patch, osc.id, 'f'.repeat(64)))

    expect(diffProject(project, next)).toEqual([
      { type: 'track/setSample', trackId: track.id, nodeId: osc.id, sampleId: 'f'.repeat(64) },
    ])
  })

  it('maps a voice-count change to its own command', () => {
    const next = setTrackVoices(project, track.id, 3)
    expect(diffProject(project, next)).toEqual([{ type: 'track/setVoices', trackId: track.id, voices: 3 }])
  })

  it('maps clip, volume and tempo edits to their own commands', () => {
    let next = setClipAt(project, track.id, 0, null)
    next = setTrackVolume(next, track.id, 0.5)
    next = setTempo(next, 140)

    expect(diffProject(project, next).map((c) => c.type)).toEqual([
      'transport/setTempo',
      'track/setClips',
      'track/setVolume',
    ])
  })

  describe('audio tracks', () => {
    const sample = { id: 'a'.repeat(64), name: 'Loop', extension: 'wav', durationSeconds: 2, sampleRate: 44100, channels: 1, bytes: 1 }
    const base = addAudioTrackWithClip(addSamples(project, [sample]), sample)
    const audio = base.tracks[base.tracks.length - 1]!

    it('adds an audio track as an audio track, with no patch or voices', () => {
      const commands = diffProject(project, base)
      expect(commands).toContainEqual(
        expect.objectContaining({ type: 'track/add', kind: 'audio', trackId: audio.id }),
      )
      expect(commands.find((c) => c.type === 'track/add' && c.kind === 'audio')).not.toHaveProperty('patch')
    })

    it('maps clip edits to setAudioClips and volume to setVolume', () => {
      const clipId = isAudioTrack(audio) ? audio.clips[0]!.id : ''
      const edited = setVolume(updateAudioClip(base, audio.id, clipId, { gain: 0.4 }), audio.id, 0.3)

      expect(diffProject(base, edited).map((c) => c.type)).toEqual(['track/setAudioClips', 'track/setVolume'])
    })

    it('emits nothing for an unchanged audio track', () => {
      expect(diffProject(base, { ...base })).toEqual([])
    })

    it('replaces a track whose kind changed under the same id', () => {
      const asInstrument = { ...base, tracks: [...base.tracks.slice(0, -1), { ...project.tracks[0]!, id: audio.id }] }
      expect(diffProject(base, asInstrument).map((c) => c.type)).toEqual(['track/remove', 'track/add'])
    })

    it('adding an empty audio track works too', () => {
      const next = addTrack(project, createAudioTrack('Empty', project.sceneCount))
      expect(diffProject(project, next).at(-1)).toMatchObject({ type: 'track/add', kind: 'audio', clips: [null, null, null, null] })
    })
  })
})
