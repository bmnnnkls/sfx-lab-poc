import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import { renderProject } from './bounce'
import { diffProject } from '../sync'
import { type AutomationLane, type AutomationPoint, compileAutomation } from '../automation'
import { type ControlTarget, controlFromNormalized, resolveControlTarget } from '../control'
import { createClip, createEmptyProject, createNote, type InstrumentTrack, type Project } from '../project'
import { noteGraphFrom, type Patch } from '../patch'
const RATE = 8000, BEAT = RATE / 2
const point = (beat: number, value: number, interpolation: 'linear' | 'hold' = 'linear'): AutomationPoint => ({ id: `p${beat}`, beat, value, interpolation })
const target: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: 'a' }, control: 'volume' }
const make = (points = [point(0, 0), point(2, 1)], laneTarget: ControlTarget = target): Project => {
  const initial = createEmptyProject(), track = initial.tracks[0] as InstrumentTrack
  const patch: Patch = { nodes: [{ id: 'n', type: 'note', x: 0, y: 0, params: {} }, { id: 'o', type: 'output', x: 0, y: 0, params: {} }], connections: [{ id: 'w', from: { node: 'n', port: 'gate' }, to: { node: 'o', port: 'in' } }] }
  const lane: AutomationLane = { id: 'lane', enabled: true, target: laneTarget, points }
  return { ...initial, tempo: 120, tracks: [{ ...track, id: 'a', patch, volume: 0.2, clips: [{ ...createClip('sweep', 2, [createNote(60, 0, 2, 1)]), id: 'clip', automation: [lane] }, null] }] }
}
const setup = (project = make()) => { const e = new Engine(RATE); diffProject(null, project).forEach((c) => e.apply(c)); e.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' }); return e }
const render = (engine: Engine, frames: number, chunk = 128) => {
  const result = new Float32Array(frames)
  for (let i = 0; i < frames; i += chunk) { const l = new Float32Array(Math.min(chunk, frames - i)); engine.render(l, new Float32Array(l.length)); result.set(l, i) }
  return result
}
describe('engine clip automation', () => {
  it('renders smooth ramps inside blocks, holds endpoints, wraps and is independent of block size', () => {
    const a = render(setup(), BEAT * 5, 173), b = render(setup(), BEAT * 5, 97)
    expect(a).toEqual(b)
    for (const frame of [0, 11, 127, 1000, BEAT, BEAT * 2 - 2, BEAT * 2 + 1]) expect(a[frame]).toBeCloseTo(Math.tanh((frame % (BEAT * 2)) / (BEAT * 2)), 4)
  })
  it('follows tempo changes on the musical clock and restores authored bases on stop/reset', () => {
    const e = setup(); render(e, BEAT)
    e.apply({ type: 'transport/setTempo', bpm: 60 }); render(e, BEAT)
    expect(e.status().automation?.[0]?.value).toBeCloseTo(0.75, 3)
    e.apply({ type: 'transport/stop' }); expect(e.status().automation).toEqual([])
    e.apply({ type: 'track/noteOn', trackId: 'a', note: { sourceId: 'key', channel: 0, noteId: 'hold' }, pitch: 60, velocity: 1 })
    expect(render(e, 128)[127]).toBeCloseTo(Math.tanh(0.2), 5)
  })
  it('supports overrides and re-enable while the lane is holding a constant value', () => {
    const e = setup(make([point(0, 0.5)])); render(e, 10)
    e.apply({ type: 'automation/overrides', values: [{ target, value: 0.1 }] })
    expect(render(e, 5)[0]).toBeCloseTo(Math.tanh(0.1), 5)
    e.apply({ type: 'automation/overrides', values: [] })
    expect(render(e, 5)[0]).toBeCloseTo(Math.tanh(0.5), 5)
  })
  it('steps at exact events and releases lanes at a quantized empty scene/stop', () => {
    const e = setup(make([point(0, 0.1, 'hold'), point(1, 0.8)]))
    const signal = render(e, BEAT + 2, 137)
    expect(signal[BEAT - 2]).toBeCloseTo(Math.tanh(0.1), 5)
    expect(signal[BEAT + 1]).toBeCloseTo(Math.tanh(0.8), 5)
    e.apply({ type: 'scene/launch', scene: 1 }); render(e, BEAT * 3 + 10)
    expect(e.status().automation).toEqual([])
  })
  it('ignores missing, disabled, empty and wire-owned targets', () => {
    const p = make(); const t = p.tracks[0] as InstrumentTrack, clip = t.clips[0]!
    for (const lane of [{ ...clip.automation![0]!, enabled: false }, { ...clip.automation![0]!, points: [] }, { ...clip.automation![0]!, target: { ...target, owner: { kind: 'track' as const, trackId: 'missing' } } }]) {
      const project = { ...p, tracks: [{ ...t, clips: [{ ...clip, automation: [lane] }] }] }
      expect(render(setup(project), 128)[127]).toBeCloseTo(Math.tanh(0.2), 5)
    }
  })
  it('attaches newly drawn lanes to an already playing clip and handles lane deletion', () => {
    const p = make(), t = p.tracks[0] as InstrumentTrack, c = t.clips[0]!
    const bare = { ...p, tracks: [{ ...t, clips: [{ ...c, automation: [] }] }] }
    const e = setup(bare); render(e, BEAT)
    diffProject(bare, p).forEach((cmd) => e.apply(cmd)); render(e, 2)
    expect(e.status().automation?.[0]?.value).toBeCloseTo(0.5, 3)
    diffProject(p, bare).forEach((cmd) => e.apply(cmd)); render(e, 2)
    expect(e.status().automation).toEqual([])
  })
  it('uses the same sample timing for offline clip/scene exports and live engine playback', () => {
    const project = make(), e = new Engine(48000)
    diffProject(null, project).forEach((c) => e.apply(c)); e.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' })
    const live = render(e, 48000, 173)
    for (const scope of [{ kind: 'clip' as const, trackId: 'a', clipId: 'clip' }, { kind: 'scene' as const, scene: 0 }]) {
      const offline = renderProject(project, [], { scope, maxTail: 0 })
      expect(offline.left.slice(0, 48000)).toEqual(live)
    }
  })
  it('converts graph lanes through their current scale with exact discrete targets', () => {
    const p = make(), t = p.tracks[0] as InstrumentTrack
    const graph: Patch = { nodes: [{ id: 'control', type: 'control', x: 0, y: 0, params: { value: 0.3, min: 0.01, max: 1, curve: 1 } }, { id: 'o', type: 'output', x: 0, y: 0, params: {} }], connections: [{ id: 'w', from: { node: 'control', port: 'out' }, to: { node: 'o', port: 'in' } }] }
    const graphTarget: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId: 'a' }, domain: 'patch', path: [], nodeId: 'control', nodeType: 'control', paramId: 'value' }
    const project = { ...make([point(0, 0), point(2, 1)], graphTarget), tracks: [{ ...t, patch: graph, clips: (make([point(0, 0), point(2, 1)], graphTarget).tracks[0] as InstrumentTrack).clips }] }
    const e = setup(project), signal = render(e, BEAT + 2)
    const resolved = resolveControlTarget(project, graphTarget)
    if (resolved.status !== 'available') throw new Error('missing target')
    expect(signal[BEAT]).toBeCloseTo(Math.tanh(controlFromNormalized(resolved.spec, 0.5) * 0.2), 4)
    expect(compileAutomation(project)[0]?.clips[0]?.lanes[0]?.target).toEqual(graphTarget)
  })
})

it('automates upstream controls in note graphs before note events, retaining wired parameter ownership', () => {
  const p = make(), t = p.tracks[0] as InstrumentTrack
  const noteTarget: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId: 'a' }, domain: 'notes', path: [], nodeId: 'amount', nodeType: 'control', paramId: 'value' }
  const c = t.clips[0]!
  const project = { ...p, tracks: [{ ...t, voices: 1,
    patch: noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'gain', type: 'gain', params: { gain: 0.001 } }, { id: 'out', type: 'output' }], ['n.frequency>gain.in', 'gain.out>out.in']),
    noteGraph: noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'amount', type: 'control', params: { value: 0, min: 0, max: 12, step: 1 } }, { id: 'transpose', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>transpose.in', 'amount.out>transpose.param:semitones', 'transpose.out>out.in']),
    clips: [{ ...c, notes: [createNote(60, 0, 0.5), createNote(60, 1, 0.5)], automation: [{ id: 'lane', enabled: true, target: noteTarget, points: [point(0, 0, 'hold'), point(1, 1)] }] }],
  }] }
  const e = setup(project), signal = render(e, BEAT + 128, 173)
  expect(signal[100]).toBeCloseTo(Math.tanh(261.6256 * 0.001 * 0.2), 5)
  expect(signal[BEAT + 100]).toBeCloseTo(Math.tanh(523.2512 * 0.001 * 0.2), 5)
  expect(compileAutomation(project)[0]?.clips[0]?.lanes).toHaveLength(1)
})

it('applies automated upstream control buffers smoothly through parameter sockets across instrument stages', () => {
  const p = make(), t = p.tracks[0] as InstrumentTrack, c = t.clips[0]!
  const upstream: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId: 'a' }, domain: 'patch', path: [], nodeId: 'amount', nodeType: 'control', paramId: 'value' }
  const project = { ...p, tracks: [{ ...t,
    patch: noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'amount', type: 'control', params: { value: 0.5, min: 0, max: 1 } }, { id: 'gain', type: 'gain' }, { id: 'out', type: 'output' }], ['n.gate>gain.in', 'amount.out>gain.param:gain', 'gain.out>out.in']),
    clips: [{ ...c, automation: [{ id: 'lane', enabled: true, target: upstream, points: [point(0, 0), point(2, 1)] }] }],
  }] }
  const signal = render(setup(project), BEAT + 128, 137)
  for (const i of [11, 127, BEAT, BEAT + 10]) expect(signal[i]).toBeCloseTo(Math.tanh(i / (BEAT * 2) * 0.2), 4)
  const driven: ControlTarget = { ...upstream, nodeId: 'gain', nodeType: 'gain', paramId: 'gain' }
  expect(resolveControlTarget(project, driven)).toMatchObject({ status: 'available', automatable: false })
})
