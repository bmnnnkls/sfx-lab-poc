import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { findExampleProject } from '../examples'
import { createSamplerPatch } from '../patch'
import {
  type Project,
  addTrack,
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmptyProject,
  createNote,
  createTrack,
  setAudioClipAt,
  setClipAt,
} from '../project'
import type { SampleData, SampleInfo } from '../sample'
import { encodeBounce, renderProject } from './bounce'

/**
 * Old projects sound the same, bit for bit (round 11a). The hashes below were taken before samples became stereo
 * (`be367c6`'s engine): every change since must leave them as they are. A stereo file then was averaged once at decode;
 * now the engine holds both channels and an old project's track reads their average where it read the mix.
 */

const SLOW = 120_000
/** The scene in which the most clips play (as the examples' own tests pick it). */
const busiestScene = (project: Project): number =>
  Array.from({ length: project.sceneCount }, (_, scene) => scene).reduce((best, scene) => (clipsIn(project, scene) > clipsIn(project, best) ? scene : best), 0)
const clipsIn = (project: Project, scene: number) => project.tracks.filter((track) => track.kind === 'instrument' && track.clips[scene]).length
const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** What the loader hands the engine for a file with these channels (before 11a: their average, `toMono`). */
const sampleData = (id: string, sampleRate: number, channels: readonly Float32Array[]): SampleData => ({ id, sampleRate, channels })

/** A file's channels: two different tones with a little seeded noise, at 44.1 kHz so playback resamples. */
const FILE_RATE = 44100
const tone = (frequency: number, level: number, seed: number) => {
  let state = seed
  return Float32Array.from({ length: FILE_RATE }, (_, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return level * Math.sin((2 * Math.PI * frequency * i) / FILE_RATE) + 0.05 * (state / 2 ** 32 - 0.5)
  })
}
const STEREO = sampleData('a'.repeat(64), FILE_RATE, [tone(330, 0.5, 1), tone(523, 0.3, 2)])
const MONO = sampleData('b'.repeat(64), FILE_RATE, [tone(220, 0.6, 3)])
const infoOf = (sample: SampleData, channels: number): SampleInfo => ({
  id: sample.id, name: `file ${channels}`, extension: 'wav', durationSeconds: 1, sampleRate: FILE_RATE, channels, bytes: 0,
})

/**
 * A project saved before 11a with a stereo file in it: re-pitched and loop-trimmed audio clips, one at original speed,
 * a mono file beside it, and a sampler playing the stereo file at three pitches. Tracks made here are old tracks:
 * their `Track in` has no stereo flag, as in every file written before 11a.
 */
const stereoFileProject = (): Project => {
  const stereo = infoOf(STEREO, 2)
  const mono = infoOf(MONO, 1)
  let project: Project = { ...createEmptyProject(), tracks: [], samples: [stereo, mono] }
  const oldTrack = (name: string) => {
    const track = createAudioTrack(name, 4)
    return { ...track, fx: { ...track.fx, nodes: track.fx.nodes.map(({ stereo: _, ...node }) => node) } }
  }

  const looped = oldTrack('Looped')
  project = setAudioClipAt(addTrack(project, looped), looped.id, 0, {
    ...createAudioClip(stereo, 120), lengthBeats: 3, start: 0.1, end: 0.85, fadeIn: 0.01, fadeOut: 0.02, gain: 0.7,
  })
  const plain = oldTrack('Plain')
  project = setAudioClipAt(addTrack(project, plain), plain.id, 0, { ...createAudioClip(stereo, 120), warp: 'off', loop: false, gain: 0.9 })
  const single = oldTrack('Mono')
  project = setAudioClipAt(addTrack(project, single), single.id, 0, { ...createAudioClip(mono, 120), lengthBeats: 2 })

  const sampler = createTrack('Sampler', 4, createSamplerPatch(STEREO.id))
  const notes = [createNote(60, 0, 1, 1), createNote(67, 1.5, 1, 0.8), createNote(55, 3, 2, 0.6)]
  return setClipAt(addTrack(project, sampler), sampler.id, 0, createClip('notes', 8, notes))
}

describe('old projects, bit for bit', () => {
  it('the shipped examples bounce to the same bytes', { timeout: SLOW }, () => {
    const hashes: Record<string, string> = {}
    for (const id of ['low-light', 'glass-rain']) {
      const project = findExampleProject(id)!.create()
      const result = renderProject(project, [], { scope: { kind: 'scene', scene: busiestScene(project) }, bars: 1, maxTail: 0, bitDepth: 32 })
      hashes[id] = hashOf(encodeBounce(result))
    }
    expect(hashes).toEqual({
      'low-light': '9bef2ff8b9c372715d8f5351ef4c08d9bc2aac0c5b0b1f371093920dfc6c8837',
      'glass-rain': '0492048e3ca5387fb80cb6489c0d49295724e4284892e24d0a54f52e9d0fb000',
    })
  })

  it('a project with a stereo file bounces to the same bytes', { timeout: SLOW }, () => {
    const project = stereoFileProject()
    const result = renderProject(project, [STEREO, MONO], { scope: { kind: 'scene', scene: 0 }, bars: 4, maxTail: 1, bitDepth: 32 })
    expect(result.left.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0)).toBeGreaterThan(0.1)
    expect(hashOf(encodeBounce(result))).toBe('33f460d3e537e3fc6e76134ad69d61d9b32f91d29bc446d7c55079cc73e22e67')
  })

  it('a stereo sample whose channels are equal renders like the mono one', { timeout: SLOW }, () => {
    const project = stereoFileProject()
    const options = { scope: { kind: 'scene', scene: 0 }, bars: 2, maxTail: 0 } as const
    const [left] = MONO.channels
    const mono = renderProject(project, [{ ...STEREO, channels: [left!] }, MONO], options)
    const twin = renderProject(project, [{ ...STEREO, channels: [left!, left!.slice()] }, MONO], options)
    expect(hashOf(encodeBounce(twin))).toBe(hashOf(encodeBounce(mono)))
  })
})
