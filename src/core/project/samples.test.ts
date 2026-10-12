import type { InstrumentTrack } from '.'
import { describe, expect, it } from 'vitest'
import { createSamplerPatch } from '../patch'
import type { SampleInfo } from '../sample'
import { addAudioTrackWithClip, addSamplerTrack, addSamples, createDemoProject, removeSample, usedSampleIds } from '.'

const info = (id: string, name = 'Kick'): SampleInfo => ({
  id: id.repeat(64).slice(0, 64),
  name,
  extension: 'wav',
  durationSeconds: 0.5,
  sampleRate: 44100,
  channels: 1,
  bytes: 1000,
})

describe('sample library edits', () => {
  it('adds samples and ignores ones already present', () => {
    const base = createDemoProject()
    const once = addSamples(base, [info('a')])
    expect(once.samples).toHaveLength(1)

    expect(addSamples(once, [info('a', 'Renamed')])).toBe(once)
    expect(addSamples(once, [info('b')]).samples).toHaveLength(2)
  })

  it('creates a ready-to-play sampler track with a clip that triggers it', () => {
    const sample = info('a')
    const project = addSamplerTrack(addSamples(createDemoProject(), [sample]), sample)
    const track = project.tracks[project.tracks.length - 1] as InstrumentTrack

    expect(track.name).toBe('Kick')
    expect(track.patch.nodes.find((n) => n.type === 'sampler')?.sampleId).toBe(sample.id)
    expect(track.clips[0]?.notes).toMatchObject([{ pitch: 60, start: 0, duration: 1, velocity: 0.9 }])
    expect(track.clips.slice(1).every((slot) => slot === null)).toBe(true)
    expect(track.clips).toHaveLength(project.sceneCount)
  })

  it('removing a sample clears every node that used it', () => {
    const sample = info('a')
    let project = addSamples(createDemoProject(), [sample])
    project = addSamplerTrack(project, sample)
    const untouched = project.tracks[0]!

    const removed = removeSample(project, sample.id)
    const sampler = (removed.tracks[removed.tracks.length - 1] as InstrumentTrack).patch.nodes.find((n) => n.type === 'sampler')!

    expect(removed.samples).toEqual([])
    expect(sampler.sampleId).toBeUndefined()
    expect(removed.tracks[0]).toBe(untouched) // tracks that never used it are shared, not copied
    expect(createSamplerPatch(sample.id).nodes.some((n) => n.sampleId === sample.id)).toBe(true)
  })
})

describe('usedSampleIds', () => {
  it('lists the samples that are played by a sampler or an audio clip, once each, and not the ones that only sit in the library', () => {
    const [kick, loop, unused] = [info('a'), info('b', 'Loop'), info('c', 'Spare')]
    let project = addSamples(createDemoProject(), [kick, loop, unused])
    expect(usedSampleIds(project)).toEqual([])
    project = addSamplerTrack(addSamplerTrack(project, kick), kick)
    project = addAudioTrackWithClip(project, loop)
    expect(usedSampleIds(project).sort()).toEqual([kick.id, loop.id].sort())
  })

  it('finds a sampler inside a track\'s insert graph and inside a module', () => {
    const sample = info('d')
    const base = addSamples(createDemoProject(), [sample])
    const sampler = createSamplerPatch(sample.id)
    expect(usedSampleIds({ ...base, master: { ...base.master, fx: sampler } })).toEqual([sample.id])
    expect(usedSampleIds({ ...base, tracks: base.tracks.map((track) => ({ ...track, fx: sampler })) })).toEqual([sample.id])
    expect(usedSampleIds({ ...base, modules: [{ id: 'm', name: 'M', patch: sampler, inputs: [], outputs: [], knobs: [] }] })).toEqual([sample.id])
  })
})
