import { describe, expect, it, vi } from 'vitest'
import { createEmptyProject, createClip, createReturnTrack, type InstrumentTrack } from '../project'
import { noteGraphFrom } from '../patch'
import { diffProject } from '../sync'
import { Engine } from './engine'

// These counters observe structure, not machine-dependent elapsed time.
const counters = (engine: Engine) => {
  const internals = engine as unknown as { invalidateOrder(): void; sorted(...args: unknown[]): unknown; updateMixState(): void }
  return [vi.spyOn(internals, 'invalidateOrder'), vi.spyOn(internals, 'sorted'), vi.spyOn(internals, 'updateMixState')]
}
const render = (e: Engine, frames = 128) => { const l = new Float32Array(frames), r = new Float32Array(frames); e.render(l, r); return [l, r] as const }

describe('send membership and gain ownership', () => {
  for (const notes of [false, true]) it(`keeps gain-only automation out of routing caches (notes=${notes})`, () => {
    const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack, owner = { kind: 'track' as const, trackId: t.id }
    const ret = { ...createReturnTrack('Return'), id: 'r' }
    const points = [{ id: 'zero', beat: 0, value: 0, interpolation: 'linear' as const }, { id: 'up', beat: 0.1, value: 1, interpolation: 'linear' as const }, { id: 'down', beat: 0.2, value: 0, interpolation: 'hold' as const }]
    const clip = { ...createClip('C', 4, []), automation: [{ id: 'send', target: { kind: 'mixer' as const, owner, control: 'send' as const, returnId: 'r' }, enabled: true, points }, ...(notes ? [{ id: 'notes', target: { kind: 'graph' as const, owner, domain: 'notes' as const, path: [], nodeId: 'k', nodeType: 'control', paramId: 'value' }, enabled: true, points }] : [])] }
    const project = { ...p, tracks: [ret, { ...t, noteGraph: noteGraphFrom([{ id: 'k', type: 'control' }], []), sends: {}, clips: [clip] }] }
    const e = new Engine(48000); diffProject(null, project).forEach(c => e.apply(c)); e.apply({ type: 'clip/launch', trackId: t.id, clipId: clip.id })
    const initial = counters(e); render(e)
    expect(initial[0]).toHaveBeenCalledTimes(1) // first-use zero destination, before first mix
    render(e); initial.forEach(c => c.mockClear()); render(e, 6000)
    initial.forEach(c => expect(c).not.toHaveBeenCalled())
    e.apply({ type: 'transport/stop' }); render(e)
    initial.forEach(c => expect(c).not.toHaveBeenCalled()) // release restores zero without dropping membership
    e.apply({ type: 'track/setSends', trackId: t.id, sends: { r: 0.5 } }); render(e)
    initial.forEach(c => expect(c).not.toHaveBeenCalled())
    e.apply({ type: 'track/setSends', trackId: t.id, sends: {} }); render(e)
    expect(initial[0]).toHaveBeenCalledTimes(1)
    expect(initial[1]).toHaveBeenCalledTimes(2)
    expect(initial[2]).toHaveBeenCalledTimes(1)
  })
  it('uses a newly added zero destination before a stereo ramp and respects mute/solo gates and return order', () => {
    const e = new Engine(8000)
    const graph = noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'pan', type: 'pan', params: { pan: -1 } }, { id: 'out', type: 'trackOut' }], ['in.out>pan.in', 'pan.out>out.in'])
    e.apply({ type: 'track/add', kind: 'return', trackId: 'r', fx: graph, volume: 1 })
    const fx = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in'])
    e.apply({ type: 'sample/add', sample: { id: 's', sampleRate: 8000, data: new Float32Array(8000).fill(0.1) } })
    const target = { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: 'a' }, control: 'send' as const, returnId: 'r' }
    const clip = { id: 'c', name: 'C', sampleId: 's', lengthBeats: 2, loop: true, warp: 'off' as const, gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0, automation: [{ id: 'l', target, enabled: true, points: [{ id: 'p', beat: 0, value: 0, interpolation: 'linear' as const }, { id: 'q', beat: 2, value: 1, interpolation: 'linear' as const }] }] }
    e.apply({ type: 'track/add', kind: 'audio', trackId: 'a', clips: [clip], fx, volume: 1 })
    // Use compiled automation from a project with the same explicit owner.
    const p = createEmptyProject()
    const audio = { kind: 'audio' as const, id: 'a', name: 'A', clips: [clip], fx, volume: 1, sends: {} }
    for (const command of diffProject(null, { ...p, tracks: [audio, { ...createReturnTrack('R'), id: 'r', fx: graph }] })) if (command.type === 'automation/configure') e.apply(command)
    e.apply({ type: 'clip/launch', trackId: 'a', clipId: 'c' })
    const [l, r] = render(e, 4096)
    expect(l[4000]).toBeCloseTo(Math.tanh(0.1 + 0.05), 5)
    expect(r[4000]).toBeCloseTo(Math.tanh(0.1), 5)
    e.apply({ type: 'track/setMute', trackId: 'a', muted: true }); const muted = render(e); expect(muted[0].every(v => v === 0)).toBe(true)
    e.apply({ type: 'track/setSolo', trackId: 'a', soloed: true }); expect(render(e)[0].some(v => v > 0.1)).toBe(true)
  })
})
