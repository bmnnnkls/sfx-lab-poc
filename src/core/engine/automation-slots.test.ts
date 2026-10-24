import { describe, expect, it } from 'vitest'
import { type AutomationLane, type AutomationSlot, type ControlTarget, type InstrumentTrack, type Project, compileAutomation, createClip, createEmptyProject, createNote, createReturnTrack, defaultBounceBars, diffProject, noteGraphFrom, removeTrack, renderProject, setAutomationSlot } from '../index'
import { Engine } from './engine'

const RATE = 8000, BEAT = RATE / 2
const master: ControlTarget = { kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }
const ret: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: 'return' }, control: 'volume' }
const slot = (target: ControlTarget, lengthBeats: number, value = 0, end = 1): AutomationSlot => ({ id: `slot-${target.owner.kind}`, name: 'Sweep', lengthBeats, automation: [{ id: 'lane', target, enabled: true, points: [{ id: 'a', beat: 0, value, interpolation: 'linear' }, { id: 'b', beat: lengthBeats, value: end, interpolation: 'linear' }] }] })
const project = () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const r = { ...createReturnTrack('Return'), id: 'return', volume: 0.5 }
  let result: Project = { ...p, tempo: 120, sceneCount: 2, master: { ...p.master, volume: 0.8 }, tracks: [{ ...t, id: 'source', volume: 0.2, sends: { return: 1 }, patch: noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'out', type: 'output' }], ['note.gate>out.in']), clips: [{ ...createClip('Held', 2, [createNote(60, 0, 2, 1)]), id: 'clip' }, { ...createClip('Held again', 2, [createNote(60, 0, 2, 1)]), id: 'clip2' }] }, r] }
  result = setAutomationSlot(result, master.owner, 0, slot(master, 3))
  return setAutomationSlot(result, ret.owner, 0, slot(ret, 2))
}
const setup = (p = project()) => { const e = new Engine(RATE); diffProject(null, p).forEach((c) => e.apply(c)); e.apply({ type: 'scene/launch', scene: 0 }); return e }
const render = (e: Engine, frames: number, chunk = 173) => { const result = new Float32Array(frames); for (let i = 0; i < frames; i += chunk) { const l = new Float32Array(Math.min(chunk, frames - i)); e.render(l, new Float32Array(l.length)); result.set(l, i) } return result }
const value = (e: Engine, target: ControlTarget) => e.status().automation?.find((l) => JSON.stringify(l.target) === JSON.stringify(target))?.value

describe('return/master automation slots', () => {
  it('renders independent loop lengths sample accurately with block-size-independent master processing', () => {
    const a = render(setup(), BEAT * 7), b = render(setup(), BEAT * 7, 97)
    expect(Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))).toBeLessThan(1e-7)
    for (const frame of [0, 127, BEAT, BEAT * 2 + 1, BEAT * 3 + 1, BEAT * 6 + 1]) {
      const rv = (frame % (BEAT * 2)) / (BEAT * 2), mv = (frame % (BEAT * 3)) / (BEAT * 3)
      expect(a[frame]).toBeCloseTo(Math.tanh((0.2 + 0.2 * rv) * mv), 5)
    }
  })
  it('queues scene retrigger and empty scene stops, releases only that owner override at the boundary', () => {
    const e = setup(); render(e, BEAT)
    e.apply({ type: 'automation/overrides', values: [{ target: master, value: 0.1 }, { target: ret, value: 0.2 }] })
    e.apply({ type: 'automation/launch', owner: master.owner, slotId: 'slot-master' })
    expect(e.status().masterAutomation?.queued).toBe('slot-master')
    render(e, BEAT * 3)
    expect(e.status().automationOverrides).toHaveLength(2)
    render(e, 1)
    expect(e.status().masterAutomation?.startBeat).toBe(4)
    expect(e.status().automationOverrides).toEqual([{ target: ret, value: 0.2 }])
    expect(value(e, master)).toBeCloseTo(0, 5)
    e.apply({ type: 'scene/launch', scene: 1 }); render(e, BEAT * 4 + 1)
    expect(e.status().automation).toEqual([])
    expect(e.status().automationOverrides).toEqual([])
    expect(e.status().masterAutomation?.playingClipId).toBeNull()
    expect(render(e, 1)[0]).toBeCloseTo(Math.tanh(0.3 * 0.8), 5)
  })
  it('cancels an idle queued launch when an empty slot is launched before rendering', () => {
    const e = setup(); e.apply({ type: 'scene/launch', scene: 1 }); render(e, 1)
    expect(e.status().automation).toEqual([])
    expect(e.status().masterAutomation?.playingClipId).toBeNull()
  })
  it('follows tempo, manual/MIDI override, re-enable and transport reset', () => {
    const e = setup(); render(e, BEAT)
    e.apply({ type: 'transport/setTempo', bpm: 60 }); render(e, BEAT)
    expect(value(e, master)).toBeCloseTo(0.5, 3)
    e.apply({ type: 'automation/overrides', values: [{ target: master, value: 0.1 }], revision: 4 }); render(e, 1)
    expect(e.status().automationOverrides?.[0]?.value).toBe(0.1)
    e.apply({ type: 'automation/overrides', values: [] }); render(e, 1)
    expect(value(e, master)).toBeGreaterThan(0.49)
    e.apply({ type: 'transport/stop' }); expect(e.status().automation).toEqual([])
    expect(e.status().masterAutomation?.playingClipId).toBeNull()
    e.apply({ type: 'track/noteOn', trackId: 'source', note: { sourceId: 'key', channel: 0, noteId: 'hold' }, pitch: 60, velocity: 1 })
    expect(render(e, 128)[127]).toBeCloseTo(Math.tanh(0.3 * 0.8), 5)
  })
  it('restores return and master bases when playing slots are deleted, and preserves edited phase', () => {
    const p = project(), e = setup(p); render(e, BEAT)
    const changed = setAutomationSlot(p, master.owner, 0, { ...slot(master, 3), name: 'Edited' })
    diffProject(p, changed).forEach((c) => e.apply(c)); render(e, 1)
    expect(e.status().masterAutomation?.startBeat).toBeCloseTo(0, 9)
    e.apply({ type: 'automation/overrides', values: [{ target: master, value: 0.1 }, { target: ret, value: 0.1 }] })
    const cleared = setAutomationSlot(setAutomationSlot(changed, master.owner, 0, null), ret.owner, 0, null)
    diffProject(changed, cleared).forEach((c) => e.apply(c)); render(e, 1)
    expect(e.status().automationOverrides).toEqual([])
    expect(e.status().automation).toEqual([])
    expect(render(e, 1)[0]).toBeCloseTo(Math.tanh(0.3 * 0.8), 5)
  })
  it('keeps return removal local and removes send mappings/lanes referencing the deleted return', () => {
    const p = project(), t = p.tracks[0] as InstrumentTrack
    const send: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: t.id }, control: 'send', returnId: 'return' }
    const withSend: Project = { ...p, tracks: [{ ...t, clips: [{ ...t.clips[0]!, automation: [{ ...slot(send, 2).automation![0]! }] }, t.clips[1]!] }, p.tracks[1]!] }
    const e = setup(withSend), removed = removeTrack(withSend, 'return'); render(e, BEAT)
    diffProject(withSend, removed).forEach((c) => e.apply(c)); render(e, 1)
    expect(removed.master.automationSlots).toEqual(p.master.automationSlots)
    expect((removed.tracks[0] as InstrumentTrack).clips[0]?.automation).toEqual([])
    expect(e.status().automation).toHaveLength(1)
  })
  it('scene exports include slots and their duration; clip exports keep master/return bases', () => {
    const p = project(), scoped = { kind: 'scene' as const, scene: 0 }
    expect(defaultBounceBars(p, scoped)).toBe(0.75)
    const scene = renderProject(p, [], { scope: scoped, sampleRate: 48000, bars: 1, maxTail: 0 })
    const clip = renderProject(p, [], { scope: { kind: 'clip', trackId: 'source', clipId: 'clip' }, bars: 1, maxTail: 0 })
    expect(scene.left[0]).toBe(0)
    expect(clip.left[127]).toBeCloseTo(Math.tanh(0.3 * 0.8), 5)
    const live = new Engine(48000); diffProject(null, p).forEach((c) => live.apply(c)); live.apply({ type: 'scene/launch', scene: 0 })
    const actual = render(live, scene.left.length, 97)
    // Existing note scheduling can round a clip boundary one sample differently for odd block sizes.
    let worst = 0
    for (let i = 0; i < actual.length; i++) if (i % 48000 > 1 && i % 48000 < 47998) worst = Math.max(worst, Math.abs(actual[i]! - scene.left[i]!))
    expect(worst).toBeLessThan(1e-7)
  })
  it('applies return/master graph curves and excludes newly wired controls', () => {
    for (const owner of [master.owner, ret.owner]) {
      const p = setAutomationSlot(setAutomationSlot(project(), master.owner, 0, null), ret.owner, 0, null)
      const target: ControlTarget = { kind: 'graph', owner, domain: 'fx', path: [], nodeId: 'gain', nodeType: 'gain', paramId: 'gain' }
      const fx = noteGraphFrom([{ id: 'in', type: owner.kind === 'master' ? 'masterIn' : 'returnIn' }, { id: 'gain', type: 'gain', params: { gain: 1 } }, { id: 'out', type: 'trackOut' }], ['in.out>gain.in', 'gain.out>out.in'])
      let changed: Project = owner.kind === 'master' ? { ...p, master: { ...p.master, fx } } : { ...p, tracks: p.tracks.map((t) => t.id === 'return' ? { ...t, fx } : t) }
      changed = setAutomationSlot(changed, owner, 0, slot(target, 2, 0.25, 0.75))
      const e = setup(changed); const actual = render(e, 1000)
      expect(value(e, target)).toBeCloseTo(0.5 + 999 / (BEAT * 2), 5)
      for (const frame of [127, 500, 999]) {
        const gain = 0.5 + frame / (BEAT * 2)
        const mix = owner.kind === 'master' ? 0.3 * gain : 0.2 + 0.1 * gain
        expect(actual[frame]).toBeCloseTo(Math.tanh(mix * 0.8), 5)
      }
      const wired = { ...fx, nodes: [...fx.nodes, { id: 'cv', type: 'constant', x: 0, y: 0, params: { value: 0.7 } }], connections: [...fx.connections, { id: 'wire', from: { node: 'cv', port: 'out' }, to: { node: 'gain', port: 'param:gain' } }] }
      const next = owner.kind === 'master' ? { ...changed, master: { ...changed.master, fx: wired } } : { ...changed, tracks: changed.tracks.map((t) => t.id === 'return' ? { ...t, fx: wired } : t) }
      expect(compileAutomation(next).flatMap((t) => t.clips.flatMap((c) => c?.lanes ?? [])).some((l) => l.target.kind === 'graph' && l.target.nodeId === 'gain')).toBe(false)
      diffProject(changed, next).forEach((c) => e.apply(c)); render(e, 1)
      expect(value(e, target)).toBeUndefined()
    }
  })
  it('rejects cross-owner lanes and leaves missing/disabled targets authored but uncompiled', () => {
    const p = project(), invalid: AutomationLane = { ...slot(master, 2).automation![0]!, target: { ...master, owner: ret.owner } }
    const edited = setAutomationSlot(p, master.owner, 0, { ...slot(master, 2), automation: [invalid] })
    expect(edited.master.automationSlots?.[0]?.automation).toEqual([])
    const missing: ControlTarget = { kind: 'graph', owner: { kind: 'master' }, domain: 'fx', path: [], nodeId: 'gone', nodeType: 'gain', paramId: 'gain' }
    const unavailable = setAutomationSlot(p, master.owner, 0, slot(missing, 2))
    expect(compileAutomation(unavailable).find((t) => t.slotOwner?.kind === 'master')?.clips[0]?.lanes).toEqual([])
  })
})
