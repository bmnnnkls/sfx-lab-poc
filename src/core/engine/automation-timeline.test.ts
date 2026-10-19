import { expect, it, vi } from 'vitest'
import { noteGraphFrom } from '../patch'
import { createClip, createEmptyProject, createNote, type InstrumentTrack } from '../project'
import { diffProject } from '../sync'
import type { NoteEvent } from '../session'
import { Engine } from './engine'

for (const rate of [44100, 48000, 96000]) for (const chunk of [1, 97, 128, 173, 32768]) {
  it(`retains expected transformations, echo children and transitive ownership at ${rate}/${chunk}`, () => {
    const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
    const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: 'a' }, domain: 'notes' as const, path: [], nodeId: 'tr', nodeType: 'transpose', paramId: 'semitones' }
    const graph = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'tr', type: 'transpose' }, { id: 'echo', type: 'echo', params: { time: 0, repeats: 1, decay: .5 } }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>echo.in', 'echo.out>out.in'])
    const clip = { ...createClip('C', 4, [{ ...createNote(60, 0, .125, 1), id: 'first' }, { ...createNote(60, 1, .125, 1), id: 'second' }]), id: 'clip', automation: [{ id: 'lane', enabled: true, target, points: [{ id: 'a', beat: 0, value: .5, interpolation: 'hold' as const }, { id: 'b', beat: 1, value: .75, interpolation: 'hold' as const }] }] }
    const reader = (source: string, transpose: boolean) => noteGraphFrom([
      { id: 'tap', type: 'trackNotes', trackId: source, params: { tap: 1 } }, ...(transpose ? [{ id: 'up', type: 'transpose', params: { semitones: 7 } }] : []), { id: 'out', type: 'noteOut' },
    ], transpose ? ['tap.out>up.in', 'up.out>out.in'] : ['tap.out>out.in'])
    const patch = noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'out', type: 'output' }], ['n.gate>out.in'])
    // Reverse configuration order to require the dependency sort; empty-reader clips cannot generate input.
    const project = { ...p, tracks: [{ ...t, id: 'c', patch, noteGraph: reader('b', false), clips: [] }, { ...t, id: 'b', patch, noteGraph: reader('a', true), clips: [] }, { ...t, id: 'a', patch, noteGraph: graph, clips: [clip] }] }
    const e = new Engine(rate); diffProject(null, project).forEach(c => e.apply(c))
    const tracks = (e as unknown as { tracks: Map<string, { apply(e: NoteEvent): void }> }).tracks
    const captures = Object.fromEntries([...tracks].map(([id, runtime]) => [id, vi.spyOn(runtime, 'apply')]))
    e.apply({ type: 'scene/launch', scene: 0 })
    const frames = Math.ceil(rate * .8)
    for (let i = 0; i < frames; i += chunk) { const n = Math.min(chunk, frames - i); e.render(new Float32Array(n), new Float32Array(n)) }
    for (const id of ['a', 'b', 'c']) {
      const events = captures[id]!.mock.calls.map(([event]) => event).filter(e => e.kind !== 'allOff')
      expect(events.map(e => [e.kind, e.pitch])).toEqual([
        ['noteOn', id === 'a' ? 60 : 67], ['noteOff', id === 'a' ? 60 : 67],
        ['noteOn', id === 'a' ? 60 : 67], ['noteOff', id === 'a' ? 60 : 67],
        ['noteOn', id === 'a' ? 72 : 79], ['noteOff', id === 'a' ? 72 : 79],
        ['noteOn', id === 'a' ? 72 : 79], ['noteOff', id === 'a' ? 72 : 79],
      ])
      const expectedBeats = [0, .125, .25, .375, 1, 1.125, 1.25, 1.375]
      events.forEach((event, i) => expect(Math.abs(event.beat - expectedBeats[i]!) * rate / 2).toBeLessThan(1e-6))
      for (let index = 0; index < events.length; index += 2) {
        const on = events[index]!, off = events[index + 1]!
        expect(on.identity).toEqual(off.identity)
        expect(on.identity).toMatchObject({ source: JSON.stringify(['clip', 'a']), channel: 0, id: JSON.stringify(['clip', 0, 0, index < 4 ? 'first' : 'second']) })
        expect(on.identity?.path).toContain('["tr",0]')
        expect(on.identity?.path).toContain('["echo",0]')
        if (id !== 'a') expect(on.identity?.path).toContain('["up",0]')
        if (index % 4 === 2) {
          const token = on.identity?.path?.find(p => typeof p === 'string' && p.startsWith('echo:1:')) as string
          expect(token).toBeDefined()
          expect(Number(token.slice(7))).toBeCloseTo(index < 4 ? 0 : 1, 12)
        }
      }
    }
  })
}

for (const rate of [44100, 48000, 96000]) for (const chunk of [1, 97, 128, 173]) it(`orders a same-frame automation step before an arp-generated note (${rate}/${chunk})`, () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: 'a' }, domain: 'notes' as const, path: [], nodeId: 'tr', nodeType: 'transpose', paramId: 'semitones' }
  const graph = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'arp', type: 'arpeggiator', params: { rate: 1, gate: .5 } }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>arp.in', 'arp.out>tr.in', 'tr.out>out.in'])
  const clip = { ...createClip('C', 4, [createNote(60, 0, 3, 1)]), automation: [{ id: 'lane', enabled: true, target, points: [{ id: 'a', beat: 0, value: .5, interpolation: 'hold' as const }, { id: 'b', beat: 1, value: .75, interpolation: 'hold' as const }] }] }
  const e = new Engine(rate); diffProject(null, { ...p, tracks: [{ ...t, id: 'a', noteGraph: graph, clips: [clip] }] }).forEach(c => e.apply(c))
  const runtime = (e as unknown as { tracks: Map<string, { apply(e: NoteEvent): void }> }).tracks.get('a')!
  const capture = vi.spyOn(runtime, 'apply')
  e.apply({ type: 'scene/launch', scene: 0 })
  const frames = Math.ceil(rate * .6)
  for (let i = 0; i < frames; i += chunk) { const n = Math.min(chunk, frames - i); e.render(new Float32Array(n), new Float32Array(n)) }
  const event = capture.mock.calls.map(([e]) => e).find(e => e.kind === 'noteOn' && Math.abs(e.beat - 1) < 1e-8)
  expect(event).toMatchObject({ kind: 'noteOn', pitch: 72 })
})
