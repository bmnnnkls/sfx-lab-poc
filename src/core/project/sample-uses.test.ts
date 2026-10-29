import { describe, expect, it } from 'vitest'
import { createSamplerPatch } from '../patch'
import { type AssetRevision, type ProjectPreset, assetSignature } from '../preset'
import { type SampleEdit, type SampleInfo, sampleRemap } from '../sample'
import {
  type AudioClip,
  type AudioTrack,
  type InstrumentTrack,
  type Project,
  SAMPLE_USES,
  createArrangementClip,
  createAudioClip,
  createAudioTrack,
  createDemoProject,
  createGroupBus,
  createTrack,
  projectSampleDependencies,
  removeSample,
  replaceSample,
  usedSampleIds,
} from '.'

/** A 1 s sample at 1000 Hz: 1000 frames, so fractions read as frames / 1000. */
const info = (id: string, extra: Partial<SampleInfo> = {}): SampleInfo => ({
  id: id.repeat(64).slice(0, 64),
  name: `Sample ${id}`,
  extension: 'wav',
  durationSeconds: 1,
  sampleRate: 1000,
  channels: 1,
  bytes: 100,
  ...extra,
})

const OLD = info('a', {
  markers: [
    { id: 'm1', frame: 100, name: 'Before' },
    { id: 'm2', frame: 450, name: 'Inside' },
    { id: 'm3', frame: 800, name: 'After' },
  ],
  regions: [
    { id: 'r1', from: 300, to: 700, name: 'Across' },
    { id: 'r2', from: 420, to: 480, name: 'Inside' },
  ],
})
const NEW = info('b', { durationSeconds: 0.8, channels: 2, bytes: 200 })

const clipOf = (sample: SampleInfo, start = 0, end = 1): AudioClip => ({ ...createAudioClip(sample, 120), start, end })

/** One sample (`OLD`) used in every place the format allows. */
const everyPlace = (): Project => {
  const base = createDemoProject()
  const sampler = createSamplerPatch(OLD.id)
  const audio: AudioTrack = { ...createAudioTrack('Audio', base.sceneCount), clips: [clipOf(OLD, 0.1, 0.3), null, null, null] }
  const withFx: InstrumentTrack = { ...createTrack('Fx', base.sceneCount), fx: sampler }
  const instrument = createTrack('Sampler', base.sceneCount, sampler)
  const module = { id: 'mod', name: 'M', patch: sampler, inputs: [], outputs: [], knobs: [] }
  const revision: AssetRevision = {
    id: 'rev',
    signature: 'sig',
    payload: { kind: 'audio-effect', graph: sampler, modules: [module], sampleIds: [OLD.id] },
  }
  const preset: ProjectPreset = {
    id: 'preset',
    name: 'P',
    scope: { owner: { kind: 'track', trackId: instrument.id }, domain: 'patch' },
    values: [],
    revisionId: 'rev',
    samples: [{ target: { kind: 'graph', owner: { kind: 'track', trackId: instrument.id }, domain: 'patch', path: [], nodeId: 'sampler', nodeType: 'sampler' }, sampleId: OLD.id }],
  }
  return {
    ...base,
    samples: [info('z'), OLD],
    master: { ...base.master, fx: sampler },
    groups: [{ id: 'g', name: 'G', colour: 'red', bus: { ...createGroupBus(), fx: sampler } }],
    modules: [module],
    tracks: [...base.tracks, { ...audio, groupId: 'g' }, withFx, instrument],
    arrangement: [createArrangementClip(audio.id, 0, clipOf(OLD, 0.5, 0.9))],
    sampleBindings: [{ target: preset.samples[0]!.target, sampleId: OLD.id }],
    presets: [preset],
    assetRevisions: [revision],
  }
}

const DELETE: SampleEdit = { kind: 'delete', range: { from: 400, to: 600 }, crossfade: { frames: 0, curve: 'linear' } }
const remapOf = (edit: SampleEdit, toFrames: number) => sampleRemap(edit, 1000, toFrames)

describe('SAMPLE_USES', () => {
  it('finds the sample in every place, each visitor on its own', () => {
    const project = everyPlace()
    for (const use of SAMPLE_USES) {
      const found: string[] = []
      use.collect(project, (id) => found.push(id))
      expect(found, use.id).toContain(OLD.id)
    }
    expect(usedSampleIds(project)).toEqual([OLD.id])
    expect(projectSampleDependencies(project)).toEqual([OLD.id])
  })
})

describe('replaceSample', () => {
  it('moves every use onto the new sample, and none is left behind', () => {
    const { project, report } = replaceSample(everyPlace(), OLD.id, NEW, remapOf(DELETE, 800))
    expect(report).toEqual({ merged: null, emptiedTrims: 0 })
    expect(usedSampleIds(project)).toEqual([NEW.id])
    expect(projectSampleDependencies(project)).toEqual([NEW.id])
    for (const use of SAMPLE_USES) {
      const found: string[] = []
      use.collect(project, (id) => found.push(id))
      expect(found, use.id).toEqual(found.length ? found.map(() => NEW.id) : [])
      expect(found.length, use.id).toBeGreaterThan(0)
    }
    // Only the entry's origin still names the first version.
    expect(JSON.stringify({ ...project, samples: [] }).includes(OLD.id)).toBe(false)
  })

  it('replaces the library entry where it is, with the old name, the origin, and markers and regions remapped', () => {
    const { project } = replaceSample(everyPlace(), OLD.id, NEW, remapOf(DELETE, 800))
    expect(project.samples.map((sample) => sample.id)).toEqual([info('z').id, NEW.id])
    const entry = project.samples[1]!
    expect(entry).toMatchObject({ name: OLD.name, origin: OLD.id, durationSeconds: 0.8, channels: 2, bytes: 200 })
    expect(entry.markers).toEqual([
      { id: 'm1', frame: 100, name: 'Before' },
      { id: 'm3', frame: 600, name: 'After' },
    ])
    expect(entry.regions).toEqual([{ id: 'r1', from: 300, to: 500, name: 'Across' }])
  })

  it('keeps the origin through a chain of edits', () => {
    const once = replaceSample(everyPlace(), OLD.id, NEW, remapOf(DELETE, 800)).project
    const twice = replaceSample(once, NEW.id, info('c'), sampleRemap({ kind: 'reverse', range: { from: 0, to: 800 }, channels: 'both' }, 800, 800)).project
    expect(twice.samples[1]).toMatchObject({ id: info('c').id, origin: OLD.id, name: OLD.name })
    // Reverse mirrors the markers.
    expect(twice.samples[1]!.markers).toEqual([
      { id: 'm1', frame: 700, name: 'Before' },
      { id: 'm3', frame: 200, name: 'After' },
    ])
  })

  it.each([
    { name: 'before the trim', clip: [0.7, 0.9], expected: [0.5 / 0.8, 0.7 / 0.8] },
    { name: 'across its start', clip: [0.5, 0.9], expected: [0.4 / 0.8, 0.7 / 0.8] },
    { name: 'across its end', clip: [0.1, 0.5], expected: [0.1 / 0.8, 0.4 / 0.8] },
    { name: 'after the trim', clip: [0.1, 0.3], expected: [0.1 / 0.8, 0.3 / 0.8] },
    { name: 'inside the trim', clip: [0.2, 0.8], expected: [0.2 / 0.8, 0.6 / 0.8] },
  ])('remaps a trim with the delete $name, so the clip plays the same audio', ({ clip, expected }) => {
    const project = everyPlace()
    const audio = project.tracks.find((track) => track.kind === 'audio' && track.name === 'Audio') as AudioTrack
    const edited: Project = {
      ...project,
      tracks: project.tracks.map((track) => (track === audio ? { ...audio, clips: [clipOf(OLD, clip[0], clip[1]), null, null, null] } : track)),
    }
    const moved = replaceSample(edited, OLD.id, NEW, remapOf(DELETE, 800)).project
    const result = (moved.tracks.find((track) => track.id === audio.id) as AudioTrack).clips[0]!
    expect(result.sampleId).toBe(NEW.id)
    expect(result.start).toBeCloseTo(expected[0]!, 12)
    expect(result.end).toBeCloseTo(expected[1]!, 12)
    // Length, gain and fades stay.
    expect(result).toMatchObject({ lengthBeats: audio.clips[0]!.lengthBeats, gain: 1, fadeIn: audio.clips[0]!.fadeIn })
  })

  const silence = (frames: number) => ({
    audio: { sampleRate: 1000, channels: [new Float32Array(frames)] },
    handles: { before: { sampleRate: 1000, channels: [new Float32Array(0)] }, after: { sampleRate: 1000, channels: [new Float32Array(0)] } },
  })
  const BUTT = { frames: 0, curve: 'linear' } as const
  it.each([
    { name: 'a crop', edit: { kind: 'crop', range: { from: 200, to: 600 } }, frames: 400, trim: [0, 100], markers: [450 - 200], regions: [[100, 400], [220, 280]] },
    {
      name: 'an insert',
      edit: { kind: 'insert', at: 400, insert: silence(100), crossfade: BUTT },
      frames: 1100,
      trim: [100, 300],
      markers: [100, 550, 900],
      regions: [[300, 800], [520, 580]],
    },
    {
      name: 'a paste over a range',
      edit: { kind: 'replace', range: { from: 400, to: 600 }, insert: silence(50), crossfade: BUTT },
      frames: 850,
      trim: [100, 300],
      markers: [100, 650],
      regions: [[300, 550]],
    },
  ] as const)('remaps trims, markers and regions through $name', ({ edit, frames, trim, markers, regions }) => {
    const { project } = replaceSample(everyPlace(), OLD.id, NEW, sampleRemap(edit as SampleEdit, 1000, frames))
    const audio = project.tracks.find((track) => track.name === 'Audio') as AudioTrack
    expect(audio.clips[0]!.start).toBeCloseTo(trim[0] / frames, 12)
    expect(audio.clips[0]!.end).toBeCloseTo(trim[1] / frames, 12)
    expect(project.samples[1]!.markers!.map((marker) => marker.frame)).toEqual(markers)
    expect(project.samples[1]!.regions!.map((region) => [region.from, region.to])).toEqual(regions)
  })

  it('keeps the smallest trim where an emptied one started, and counts it', () => {
    const project = everyPlace()
    const regions = [createArrangementClip('t', 0, clipOf(OLD, 0.45, 0.55))]
    const { project: moved, report } = replaceSample({ ...project, arrangement: regions }, OLD.id, NEW, remapOf(DELETE, 800))
    expect(report.emptiedTrims).toBe(1)
    const content = moved.arrangement![0]!.content as AudioClip
    expect(content.start).toBeCloseTo(0.4 / 0.8, 12)
    expect(content.end).toBeCloseTo(0.4 / 0.8 + 0.002, 12)
  })

  it('keeps trims exactly through an edit that moves nothing', () => {
    const project = everyPlace()
    const moved = replaceSample(project, OLD.id, NEW, sampleRemap({ kind: 'normalize', range: { from: 0, to: 1000 }, channels: 'both', peakDb: -0.1, linked: true }, 1000, 1000)).project
    const content = moved.arrangement![0]!.content as AudioClip
    expect([content.start, content.end]).toEqual([0.5, 0.9])
  })

  it('points the uses at an entry the result already is, and removes the edited one', () => {
    const existing = info('c', { name: 'Earlier' })
    const project = { ...everyPlace(), samples: [existing, ...everyPlace().samples] }
    const { project: moved, report } = replaceSample(project, OLD.id, existing, remapOf({ kind: 'reverse', range: { from: 0, to: 1000 }, channels: 'both' }, 1000))
    expect(report.merged).toEqual(existing)
    expect(moved.samples.map((sample) => sample.name)).toEqual(['Earlier', 'Sample z'])
    expect(usedSampleIds(moved)).toEqual([existing.id])
  })

  it('leaves asset signatures as they were', () => {
    const project = everyPlace()
    const before = assetSignature(project.assetRevisions![0]!.payload)
    const moved = replaceSample(project, OLD.id, NEW, remapOf(DELETE, 800)).project
    expect(assetSignature(moved.assetRevisions![0]!.payload)).toBe(before)
  })

  it('keeps every part nothing used, and the project when there is nothing to do', () => {
    const project = everyPlace()
    const moved = replaceSample(project, OLD.id, NEW, remapOf(DELETE, 800)).project
    expect(moved.tracks[0]).toBe(project.tracks[0])
    expect(replaceSample(project, 'nothing', NEW, remapOf(DELETE, 800)).project).toBe(project)
    expect(replaceSample(project, OLD.id, OLD, remapOf(DELETE, 800)).project).toBe(project)
  })
})

describe('removeSample', () => {
  it('clears every use: arrangement regions go too; presets and revisions keep naming it', () => {
    const removed = removeSample(everyPlace(), OLD.id)
    expect(removed.samples.map((sample) => sample.id)).toEqual([info('z').id])
    expect(removed.arrangement).toEqual([])
    expect(usedSampleIds(removed)).toEqual([])
    expect(projectSampleDependencies(removed)).toEqual([OLD.id])
    expect(removed.sampleBindings![0]!.sampleId).toBeNull()
  })
})
