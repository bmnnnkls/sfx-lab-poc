import { expect, it } from 'vitest'
import { exampleProjects } from '../examples'
import { Engine } from './engine'
import { diffProject } from '../sync'
it('renders a dense Low Light scene with an automated mixer lane through normal blocks', () => {
  const p = exampleProjects[0]!.create()
  const t = p.tracks.find((t) => t.kind === 'instrument')!
  if (t.kind !== 'instrument') return
  const project = { ...p, tracks: p.tracks.map((track) => track.id !== t.id ? track : { ...t, clips: t.clips.map((c) => c && ({ ...c, automation: [{ id: 'l', enabled: true, target: { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: t.id }, control: 'volume' as const }, points: [{ id: 'p', beat: 0, value: 0, interpolation: 'linear' as const }, { id: 'p1', beat: 4, value: 1, interpolation: 'linear' as const }] }] })) }) }
  const e = new Engine(48000); diffProject(null, project).forEach((c) => e.apply(c)); e.apply({ type: 'scene/launch', scene: 6 })
  const l = new Float32Array(4800)
  e.render(l, new Float32Array(l.length))
  expect(l.every(Number.isFinite)).toBe(true)
  expect(Math.max(...l.map(Math.abs))).toBeGreaterThan(0.02)
  expect(e.status().automation).toHaveLength(1)
})

import { vi } from 'vitest'
import { createClip, createEmptyProject, createNote, type InstrumentTrack, type Project } from '../project'
import { noteGraphFrom } from '../patch'

const constantNotes = (mode: 'base' | 'mixer' | 'notes' | 'disabled' | 'empty'): Project => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const owner = { kind: 'track' as const, trackId: 't0' }
  const target = mode === 'mixer' ? { kind: 'mixer' as const, owner, control: 'volume' as const }
    : { kind: 'graph' as const, owner, domain: 'notes' as const, path: [], nodeId: 'tr', nodeType: 'transpose', paramId: 'semitones' }
  return { ...p, tracks: Array.from({ length: 4 }, (_, i) => ({ ...t, id: `t${i}`,
    noteGraph: noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in']),
    clips: [{ ...createClip('held', 100, [createNote(60, 0, 100, .5)]), id: `c${i}`, automation: i || mode === 'base' ? [] : [{ id: 'lane', enabled: mode !== 'disabled', target, points: mode === 'empty' ? [] : [{ id: 'p', beat: 0, value: .5, interpolation: 'hold' as const }] }] }],
  })) }
}
const engineOf = (p: Project) => { const e = new Engine(48000); diffProject(null, p).forEach(c => e.apply(c)); e.apply({ type: 'scene/launch', scene: 0 }); return e }
const quantum = (e: Engine) => e.render(new Float32Array(128), new Float32Array(128))

for (const mode of ['base', 'mixer', 'notes', 'disabled', 'empty'] as const) for (const silent of [false, true]) {
  it(`keeps event-free ${mode} audio in one block (silent/muted owner=${silent})`, () => {
    let p = constantNotes(mode)
    if (silent) p = { ...p, tracks: p.tracks.map(t => t.kind !== 'instrument' ? t : { ...t, muted: true, clips: t.clips.map(c => c && ({ ...c, notes: [] })) }) }
    const e = engineOf(p); quantum(e); quantum(e)
    const runtime = e as unknown as { processMaster(...args: unknown[]): void; automation: { tick(from: number, to: number): void } }
    const master = vi.spyOn(runtime, 'processMaster'), tick = vi.spyOn(runtime.automation, 'tick')
    const NativeMap = globalThis.Map
    let maps = 0
    vi.stubGlobal('Map', class extends NativeMap { constructor() { super(); maps++ } })
    try { quantum(e) } finally { vi.unstubAllGlobals() }
    expect(master).toHaveBeenCalledTimes(1)
    expect(tick.mock.calls.length).toBeLessThanOrEqual(128)
    expect(maps).toBe(0)
  })
}

it('does not fragment audio for an overridden or queued notes lane', () => {
  const p = constantNotes('notes'), e = engineOf(p)
  quantum(e)
  const lane = (p.tracks[0] as InstrumentTrack).clips[0]!.automation![0]!
  e.apply({ type: 'automation/overrides', values: [{ target: lane.target, value: 0 }] })
  const runtime = e as unknown as { processMaster(...args: unknown[]): void }
  const master = vi.spyOn(runtime, 'processMaster')
  quantum(e); expect(master).toHaveBeenCalledTimes(1)
  e.apply({ type: 'transport/stop' }); e.apply({ type: 'transport/play' }); quantum(e)
  e.apply({ type: 'clip/launch', trackId: 't0', clipId: 'c0' })
  master.mockClear(); quantum(e)
  expect(e.status().tracks.t0?.queued).toBe('c0')
  expect(master).toHaveBeenCalledTimes(1)
})
