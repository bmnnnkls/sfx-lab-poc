import { expect, it, vi } from 'vitest'
import { createEmptyProject, createClip, createNote, type InstrumentTrack } from '../project'
import { noteGraphFrom } from '../patch'
import { diffProject } from '../sync'
import { Engine } from './engine'
import type { NoteEvent } from '../session'

const source = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in'])
const reader = (id: string) => noteGraphFrom([{ id: 'tap', type: 'trackNotes', trackId: id, params: { tap: 1 } }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['tap.out>tr.in', 'tr.out>out.in'])
const make = (constant = false) => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const tracks = ['source', 'unrelated', 'middle', 'reader'].map(id => {
    const clip = { ...createClip('C', 4, [createNote(60, 0, 2, 1)]), id: `${id}-clip`, automation: id !== 'middle' ? [] : [{ id: 'lane', enabled: true, target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: id }, domain: 'notes' as const, path: [], nodeId: 'tr', nodeType: 'transpose', paramId: 'semitones' }, points: [{ id: 'p', beat: 0, value: .5, interpolation: 'linear' as const }, { id: 'q', beat: 4, value: constant ? .5 : .6, interpolation: 'linear' as const }] }] }
    return { ...t, id, noteGraph: id === 'reader' ? reader('middle') : id === 'middle' ? reader('source') : source, clips: [clip] }
  })
  const e = new Engine(48000); diffProject(null, { ...p, tracks }).forEach(c => e.apply(c)); e.apply({ type: 'scene/launch', scene: 0 })
  return e
}
const quantum = (e: Engine) => e.render(new Float32Array(128), new Float32Array(128))
interface Runtime { schedule(...args: unknown[]): unknown; apply(e: NoteEvent): void }
const internals = (e: Engine) => e as unknown as { tracks: Map<string, Runtime>; scheduleTracks(): readonly Runtime[] }

it('closes sample cadence over upstream sources and transitive readers, retaining interval cadence elsewhere', () => {
  const e = make(); quantum(e)
  const calls = new Map([...internals(e).tracks].map(([id, t]) => [id, vi.spyOn(t, 'schedule')]))
  quantum(e)
  for (const id of ['source', 'middle', 'reader']) expect(calls.get(id)).toHaveBeenCalledTimes(128)
  expect(calls.get('unrelated')).toHaveBeenCalledTimes(1)
  // A rewire changes both the upstream and downstream component closure before the next sample.
  e.apply({ type: 'track/setNoteGraph', trackId: 'middle', graph: reader('unrelated') })
  for (const call of calls.values()) call.mockClear()
  quantum(e)
  expect(calls.get('source')).toHaveBeenCalledTimes(1)
  for (const id of ['unrelated', 'middle', 'reader']) expect(calls.get(id)).toHaveBeenCalledTimes(128)
})

it('retains original same-frame track order even when components are dispatched at different cadences', () => {
  const e = make(), delivered: string[] = []
  for (const [id, runtime] of internals(e).tracks) {
    const apply = runtime.apply.bind(runtime)
    vi.spyOn(runtime, 'apply').mockImplementation(event => { if (event.kind === 'noteOn') delivered.push(id); apply(event) })
  }
  const order = internals(e).scheduleTracks()
  const ids = new Map([...internals(e).tracks].map(([id, track]) => [track, id]))
  const expected = order.map(track => ids.get(track)).filter(id => id !== undefined)
  quantum(e)
  expect(delivered).toEqual(expected)
})

it('continues autonomous echo events in an unrelated interval component while notes automation is active', () => {
  const e = make()
  const echo = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'echo', type: 'echo', params: { time: 0, repeats: 1, decay: .5 } }, { id: 'out', type: 'noteOut' }], ['in.out>echo.in', 'echo.out>out.in'])
  e.apply({ type: 'track/setNoteGraph', trackId: 'unrelated', graph: echo })
  const capture = vi.spyOn(internals(e).tracks.get('unrelated')!, 'apply')
  e.render(new Float32Array(10000), new Float32Array(10000))
  const children = capture.mock.calls.map(([event]) => event).filter(e => e.kind === 'noteOn' && Math.abs(e.beat - .25) < 1e-9)
  expect(children).toHaveLength(1)
  expect(children[0]).toMatchObject({ kind: 'noteOn', pitch: 60, velocity: .5, identity: { source: JSON.stringify(['clip', 'unrelated']), channel: 0 } })
})

it('uses one interval for an entire constant-control component after first-sample ownership is applied', () => {
  const e = make(true), delivered: number[] = []
  const t = internals(e).tracks.get('reader')!, apply = t.apply.bind(t)
  vi.spyOn(t, 'apply').mockImplementation(event => { if (event.kind === 'noteOn') delivered.push(event.pitch); apply(event) })
  const calls = [...internals(e).tracks.values()].map(t => vi.spyOn(t, 'schedule'))
  quantum(e)
  expect(delivered).toEqual([60])
  for (const call of calls) expect(call).toHaveBeenCalledTimes(1)
})

for (const loop of [false, true]) it(`never proves a hidden step/return or wrap constant (loop=${loop})`, () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const beats = [0, .008, .016, .024]
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: 'a' }, domain: 'notes' as const, path: [], nodeId: 'tr', nodeType: 'transpose', paramId: 'semitones' }
  const clip = { ...createClip('C', loop ? .016 : 1, beats.filter(b => !loop || b < .016).map((b,i)=>({ ...createNote(60, b, .001, 1), id: `n${i}` }))), id: 'c', automation: [{ id: 'l', enabled: true, target, points: [
    { id: 'p', beat: 0, value: .5, interpolation: 'hold' as const },
    { id: 'q', beat: .008, value: .75, interpolation: 'hold' as const },
    { id: 'r', beat: .016, value: .5, interpolation: 'hold' as const },
  ] }] }
  const e = new Engine(8000); diffProject(null, { ...p, tracks: [{ ...t, id: 'a', noteGraph: source, clips: [clip] }] }).forEach(c=>e.apply(c))
  const capture = vi.spyOn(internals(e).tracks.get('a')!, 'apply')
  e.apply({ type: 'scene/launch', scene: 0 }); quantum(e)
  const ons = capture.mock.calls.map(([e])=>e).filter(e=>e.kind === 'noteOn')
  expect(ons.map(e=>e.pitch)).toEqual(loop ? [60,72,60,72] : [60,72,60,60])
  ons.forEach((e,i)=>expect(e.beat).toBeCloseTo(beats[i]!,12))
})

it('retains compiled orders for compatible note-graph edits and rebuilds them for a rewire', () => {
  const e = make(); e.prepareTopology(); quantum(e)
  const runtime = e as unknown as { invalidateOrder(): void; sorted(...args: unknown[]): unknown }
  const invalidate = vi.spyOn(runtime, 'invalidateOrder'), sorted = vi.spyOn(runtime, 'sorted')
  e.apply({ type: 'track/setNoteGraph', trackId: 'unrelated', graph: { ...source, nodes: source.nodes.map(n=>n.id === 'tr' ? { ...n, params: { ...n.params, semitones: 12 } } : n) } })
  quantum(e)
  expect(invalidate).not.toHaveBeenCalled(); expect(sorted).not.toHaveBeenCalled()
  e.apply({ type: 'track/setNoteGraph', trackId: 'unrelated', graph: reader('source') })
  quantum(e)
  expect(invalidate).toHaveBeenCalledTimes(1); expect(sorted.mock.calls.length).toBeGreaterThan(0)
})
