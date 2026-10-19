import { expect, it, vi } from 'vitest'
import { Engine } from './engine'
import { noteGraphFrom } from '../patch'
import { createClip, createEmptyProject, type InstrumentTrack } from '../project'
import { diffProject } from '../sync'
import type { NoteGraph } from '../notefx'

for (const rate of [8000, 44100, 48000, 96000]) for (const chunk of [1, 97, 128, 173]) {
  it(`advances installed inactive/queued/disabled/overridden helpers while stopped at ${rate}/${chunk}`, () => {
    const p = createEmptyProject(), track = p.tracks[0] as InstrumentTrack
    const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: track.id }, domain: 'notes' as const, path: [], nodeId: 'v', nodeType: 'control', paramId: 'value' }
    const noteGraph = noteGraphFrom([{ id: 'v', type: 'control', params: { value: 0 } }, { id: 's', type: 'smooth', params: { time: .01 } }, { id: 'tr', type: 'transpose' }], ['v.out>s.in', 's.out>tr.param:semitones'])
    const clip = { ...createClip('installed', 4, []), automation: [{ id: 'disabled', target, enabled: false, points: [{ id: 'a', beat: 0, value: 1, interpolation: 'hold' as const }] }] }
    const e = new Engine(rate)
    diffProject(null, { ...p, tracks: [{ ...track, noteGraph, clips: [clip] }] }).forEach(c => e.apply(c))
    const runtime = (e as unknown as { tracks: Map<string, { graph: NoteGraph }> }).tracks.get(track.id)!
    const writes = vi.spyOn(runtime.graph, 'setParam')
    e.render(new Float32Array(1), new Float32Array(1)) // prime at zero
    e.apply({ type: 'automation/overrides', values: [{ target, value: 1 }] })
    const n = Math.round(rate * .02)
    for (let i = 0; i < n; i += chunk) { const size = Math.min(chunk, n - i); e.render(new Float32Array(size), new Float32Array(size)) }
    const latest = writes.mock.calls.filter(([node]) => node === 'tr').at(-1)![2]
    expect(latest).toBeCloseTo(1 - Math.exp(-n / (.01 * rate)), 6)
    expect(e.status().playing).toBe(false)
    expect(e.status().beat).toBe(0)
    // A queued launch away from beat zero must not alter helper speed.
    e.apply({ type: 'transport/play' }); e.render(new Float32Array(1), new Float32Array(1))
    e.apply({ type: 'clip/launch', trackId: track.id, clipId: clip.id })
    e.render(new Float32Array(97), new Float32Array(97))
    expect(e.status().tracks[track.id]?.queued).toBe(clip.id)
    expect(writes.mock.calls.filter(([node]) => node === 'tr').at(-1)![2]).toBeCloseTo(1 - Math.exp(-(n + 98) / (.01 * rate)), 6)
  })
}

for (const rate of [8000, 44100, 48000, 96000]) it(`transforms stopped live input with elapsed helper state and retains the matching off (${rate})`, () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: t.id }, domain: 'notes' as const, path: [], nodeId: 'v', nodeType: 'control', paramId: 'value' }
  const noteGraph = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'v', type: 'control', params: { value: 0, min: 0, max: 12 } }, { id: 's', type: 'smooth', params: { time: .01 } }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in', 'v.out>s.in', 's.out>tr.param:semitones'])
  const clip = { ...createClip('install', 4, []), automation: [{ id: 'disabled', target, enabled: false, points: [{ id: 'a', beat: 0, value: 1, interpolation: 'hold' as const }] }] }
  const e = new Engine(rate); diffProject(null, { ...p, tracks: [{ ...t, noteGraph, clips: [clip] }] }).forEach(c => e.apply(c))
  const runtime = (e as unknown as { tracks: Map<string, { apply(e: import('../session').NoteEvent): void }> }).tracks.get(t.id)!
  const capture = vi.spyOn(runtime, 'apply')
  const render = (frames: number) => e.render(new Float32Array(frames), new Float32Array(frames))
  render(1); e.apply({ type: 'automation/overrides', values: [{ target, value: 12 }] }); render(Math.round(rate * .02))
  const note = { sourceId: 'keyboard', channel: 3, noteId: 'held' }
  e.apply({ type: 'track/noteOn', trackId: t.id, note, pitch: 60, velocity: 1 }); render(1)
  const on = capture.mock.calls.map(([e]) => e).find(e => e.kind === 'noteOn')!
  expect(on).toMatchObject({ kind: 'noteOn', pitch: 70, identity: { source: JSON.stringify(['live', 'keyboard']), channel: 3, id: 'held' } })
  e.apply({ type: 'automation/overrides', values: [{ target, value: 0 }] }); render(Math.round(rate * .04))
  e.apply({ type: 'track/noteOff', trackId: t.id, note }); render(1)
  expect(capture.mock.calls.map(([e]) => e).find(e => e.kind === 'noteOff')).toMatchObject({ pitch: 70, identity: on.identity })
})
