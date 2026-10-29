import { describe, expect, it } from 'vitest'
import { type AudioTrack, type Project, createAudioClip, createAudioTrack, createEmptyProject, createReturnTrack } from '../project'
import { type SampleData, type SampleInfo } from '../sample'
import { noteGraphFrom } from '../patch'
import { diffProject } from '../sync'
import { Engine } from './engine'
const RATE = 8000
const sample: SampleData = { id: 'sample', sampleRate: RATE, channels: [new Float32Array(8000).fill(1)] }
const info: SampleInfo = { id: 'sample', name: 'Constant', sampleRate: RATE, extension: 'wav', channels: 1, bytes: 16044, durationSeconds: 1 }
const projectOf = (loop: boolean, warp: 'repitch' | 'off' = 'repitch'): Project => {
  const p = createEmptyProject(), track = { ...createAudioTrack('Audio', 4), id: 'a', volume: 0.2 }
  const clip = { ...createAudioClip(info, 120), id: 'clip', lengthBeats: 2, loop, warp, fadeIn: 0, fadeOut: 0,
    automation: [{ id: 'volume', enabled: true, target: { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: 'a' }, control: 'volume' as const }, points: [{ id: 'p0', beat: 0, value: 0, interpolation: 'linear' as const }, { id: 'p1', beat: 2, value: 1, interpolation: 'linear' as const }] }] }
  return { ...p, samples: [info], tracks: [{ ...track, clips: [clip, null, null, null] }] }
}
const setup = (p: Project) => {
  const engine = new Engine(RATE); engine.apply({ type: 'sample/add', sample }); diffProject(null, p).forEach((c) => engine.apply(c)); engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' }); return engine
}
const render = (engine: Engine, frames: number, chunk = 173) => {
  const result = new Float32Array(frames)
  for (let i = 0; i < frames; i += chunk) { const l = new Float32Array(Math.min(chunk, frames - i)); engine.render(l, new Float32Array(l.length)); result.set(l, i) }
  return result
}
describe('audio clip automation', () => {
  it('loops mixer curves with an audio clip using uneven blocks', () => {
    const e = setup(projectOf(true)), signal = render(e, 17000)
    for (const i of [13, 127, 4000, 7998, 8002, 12000]) expect(signal[i]).toBeCloseTo(Math.tanh(i % 8000 / 8000), 4)
    expect(e.status().automation).toHaveLength(1)
  })
  it('releases a one-shot at its exact musical boundary', () => {
    const e = setup(projectOf(false)); render(e, 8001)
    expect(e.status().tracks.a?.playingClipId).toBeNull()
    expect(e.status().automation).toEqual([])
  })
  it('releases an unwarped one-shot at its sample boundary even after changing tempo', () => {
    const p = projectOf(false, 'off'), t = p.tracks[0] as AudioTrack, c = t.clips[0]!
    const e = setup({ ...p, tracks: [{ ...t, clips: [{ ...c, end: 0.2 }] }] })
    render(e, 700); e.apply({ type: 'transport/setTempo', bpm: 240 }); render(e, 901)
    expect(e.status().tracks.a?.playingClipId).toBeNull(); expect(e.status().automation).toEqual([])
  })
})

it('applies per-frame Send-node automation at the correct stereo buffer offset', () => {
  const p = projectOf(true), t = p.tracks[0] as AudioTrack, c = t.clips[0]!
  const returnTrack = { ...createReturnTrack('Return'), id: 'return', volume: 0.3 }
  const fx = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'send', type: 'send', params: { amount: 0 } }, { id: 'out', type: 'trackOut' }], ['in.out>out.in', 'in.out>send.in'])
  const project = { ...p, tracks: [{ ...t, fx: { ...fx, nodes: fx.nodes.map((n) => n.id === 'send' ? { ...n, trackId: 'return' } : n) }, clips: [{ ...c, automation: [{ id: 'send-lane', enabled: true, target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: 'a' }, domain: 'fx' as const, path: [], nodeId: 'send', nodeType: 'send', paramId: 'amount' }, points: [{ id: 'p0', beat: 0, value: 0, interpolation: 'linear' as const }, { id: 'p1', beat: 2, value: 1, interpolation: 'linear' as const }] }] }] }, returnTrack] }
  const engine = setup(project), left = new Float32Array(4096), right = new Float32Array(4096)
  engine.render(left, right)
  for (const i of [17, 127, 1000, 4000]) {
    const amount = Math.round(i / 8000 * 100) / 100
    expect(left[i]).toBeCloseTo(Math.tanh(0.2 + amount * 0.3), 5)
    expect(right[i]).toBeCloseTo(left[i]!, 6)
  }
})

import { createClip, type InstrumentTrack } from '../project'

for (const warp of ['off', 'repitch'] as const) it(`bounds lookahead at a newly launched ${warp} one-shot and restores the first delay tail sample`, () => {
  const p = projectOf(false, warp), t = p.tracks[0] as AudioTrack, c = t.clips[0]!
  const instrument = createEmptyProject().tracks[0] as InstrumentTrack
  const notes = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in'])
  const fx = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'delay', type: 'delay', params: { time: 8 / RATE, feedback: 0, mix: 1 } }, { id: 'out', type: 'trackOut' }], ['in.out>delay.in', 'delay.out>out.in'])
  const project = { ...p, tracks: [{ ...t, fx, clips: [{ ...c, end: 17 / RATE, lengthBeats: 17 * 2 / RATE, automation: [{ ...c.automation![0]!, points: [{ id: 'p', beat: 0, value: .8, interpolation: 'hold' as const }] }] }] },
    { ...instrument, id: 'n', noteGraph: notes, clips: [{ ...createClip('clock', 4, []), automation: [{ id: 'notes', enabled: true, target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: 'n' }, domain: 'notes' as const, path: [], nodeId: 'tr', nodeType: 'transpose', paramId: 'semitones' }, points: [{ id: 'p', beat: 0, value: .5, interpolation: 'hold' as const }] }] }] }] }
  const e = new Engine(RATE); e.apply({ type: 'sample/add', sample }); diffProject(null, project).forEach(c => e.apply(c)); e.apply({ type: 'scene/launch', scene: 0 })
  const out = render(e, 128, 128)
  expect(out[16]).toBeCloseTo(Math.tanh(.8), 5)
  for (const i of [17, 18, 19]) expect(out[i]).toBeCloseTo(Math.tanh(.2), 5)
  expect(out[25]).toBe(0)
  expect(e.status().tracks.a?.playingClipId).toBeNull()
  expect(e.status().automation?.every(v => v.target.owner.kind !== 'track' || v.target.owner.trackId !== 'a')).toBe(true)
})
