import { createHash } from 'node:crypto'
import { type InstrumentTrack, type Project, type ModuleDefinition, createEmptyProject, createSamplerPatch, createModuleUse, createClip, createNote, encodeWavChannels, enumerateSampleTargets, editSampleBinding, saveProjectPreset, recallProjectPreset } from '../../src/core'

/** Two uses of one sample instrument, with distinct per-use sample choices. WAV floats avoid decode rounding. */
export const samplePresetProject = () => {
  const samples = [220, 660].map((frequency, index) => {
    const data = Float32Array.from({ length: 12000 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * frequency * i / 48000) * (1 - i / 12000))
    const bytes = encodeWavChannels([data], 48000, 32), id = createHash('sha256').update(bytes).digest('hex')
    return { bytes, decoded: { id, sampleRate: 48000, data }, info: { id, name: `Tone ${index + 1}`, extension: 'wav', sampleRate: 48000, channels: 1, durationSeconds: 0.25, bytes: bytes.length } }
  })
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const module: ModuleDefinition = { id: 'sample-voice', name: 'Shared sample voice', patch: createSamplerPatch(samples[0]!.info.id), inputs: [], outputs: [], knobs: [] }
  let project: Project = { ...p, name: 'Sample presets', modules: [module], samples: samples.map(s => s.info), tracks: [0,1].map(index => ({ ...t, id: index ? 'second' : 'sweep', name: index ? 'Second use' : 'Sweep', volume: 0.3, patch: { nodes: [{ ...createModuleUse(module, 0, 0), id: 'voice' }], connections: [] }, clips: [{ ...createClip('Notes', 2, [createNote(60, 0, 0.5), createNote(60, 1, 0.5)]), id: index ? 'second-clip' : 'sweep-clip' }, null, null, null] })) }
  const scope = { owner: { kind: 'track' as const, trackId: 'sweep' }, domain: 'patch' as const }
  project = saveProjectPreset(project, scope, 'Default sample')
  project = editSampleBinding(project, { target: enumerateSampleTargets(project)[0]!, sampleId: samples[1]!.info.id })
  project = saveProjectPreset(project, scope, 'Different sample')
  // Start with the default so real recall must change the heard sample.
  project = recallProjectPreset(project, project.presets![0]!).project
  return { project, samples, recalled: recallProjectPreset(project, project.presets![1]!).project }
}
