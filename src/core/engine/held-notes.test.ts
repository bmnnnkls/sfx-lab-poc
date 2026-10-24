import { describe, expect, it } from 'vitest'
import { createDefaultFxGraph, createDefaultNoteGraph, createDefaultPatch, noteGraphFrom, setNodeParam, type Patch } from '../patch'
import { createClip, createNote } from '../project'
import type { EngineCommand } from './commands'
import { Engine } from './engine'
import type { LiveNoteAddress } from './live-notes'

const RATE = 48000
const BEAT = 24000
// A gate straight to the output makes ownership audible: each held voice adds exactly one.
const gatePatch: Patch = {
  nodes: [
    { id: 'note', type: 'note', x: 0, y: 0, params: {} },
    { id: 'out', type: 'output', x: 0, y: 0, params: {} },
  ],
  connections: [{ id: 'wire', from: { node: 'note', port: 'gate' }, to: { node: 'out', port: 'in' } }],
}
const address = (noteId: string, sourceId = 'keyboard', channel = 0): LiveNoteAddress => ({ noteId, sourceId, channel })
const chain = (...effects: [string, Record<string, number>?][]): Patch => {
  const nodes = [{ id: 'c', type: 'clipNotes' }, ...effects.map(([type, params], i) => ({ id: `e${i}`, type, params })), { id: 'o', type: 'noteOut' }]
  return noteGraphFrom(nodes, nodes.slice(1).map((node, i) => `${nodes[i]!.id}.out>${node.id}.in`))
}
const setup = (graph = createDefaultNoteGraph(), voices = 8, patch = gatePatch) => {
  const engine = new Engine(RATE)
  const clip = createClip('held', 4, [createNote(60, 0, 3, 1)])
  const add = (trackId: string, noteGraph = graph, volume = 0.1) => engine.apply({
    type: 'track/add', kind: 'instrument', trackId, patch, noteGraph, voices,
    fx: createDefaultFxGraph(), clips: [clip], volume,
  })
  add('a')
  return { engine, clip, add }
}
const render = (engine: Engine, frames = 128, chunk = 128): Float32Array => {
  const out = new Float32Array(frames)
  for (let offset = 0; offset < frames; offset += chunk) {
    const size = Math.min(chunk, frames - offset)
    const left = new Float32Array(size)
    engine.render(left, new Float32Array(size))
    out.set(left, offset)
  }
  return out
}
const level = (engine: Engine): number => render(engine)[127]!
const peak = (signal: Float32Array): number => signal.reduce((best, value) => Math.max(best, Math.abs(value)), 0)
const on = (engine: Engine, note: LiveNoteAddress, pitch = 60, trackId = 'a') => engine.apply({ type: 'track/noteOn', trackId, note, pitch, velocity: 1 })
const off = (engine: Engine, note: LiveNoteAddress, trackId = 'a') => engine.apply({ type: 'track/noteOff', trackId, note })
const pedal = (engine: Engine, down: boolean, sourceId = 'keyboard', channel = 0) => engine.apply({ type: 'notes/sustain', sourceId, channel, down })
const disconnect = (engine: Engine, sourceId = 'keyboard', channel?: number) => engine.apply({ type: 'notes/releaseSource', sourceId, ...(channel === undefined ? {} : { channel }) })

const oneVoice = Math.tanh(0.1)
const expectVoices = (engine: Engine, count: number) => expect(level(engine)).toBeCloseTo(Math.tanh(0.1 * count), 6)

describe('held-note engine input', () => {
  it('holds chords indefinitely while stopped and releases each identity independently', () => {
    const { engine } = setup()
    const notes = [address('c'), address('e'), address('g')]
    notes.forEach((note, i) => on(engine, note, [60, 64, 67][i]!))
    expectVoices(engine, 3)
    render(engine, RATE, 173)
    expectVoices(engine, 3)
    expect(engine.status()).toMatchObject({ playing: false, beat: 0 })
    off(engine, notes[1]!)
    expectVoices(engine, 2)
    off(engine, notes[0]!)
    off(engine, notes[2]!)
    expectVoices(engine, 0)
  })

  it('separates repeated same-pitch presses, sources and channels with equal note ids', () => {
    const { engine } = setup()
    const notes = [address('1'), address('2'), address('1', 'other'), address('1', 'keyboard', 1)]
    for (const note of notes) on(engine, note)
    expectVoices(engine, 4)
    for (const [i, note] of notes.entries()) { off(engine, note); expectVoices(engine, 3 - i) }
  })

  it('ignores duplicate identities and unmatched/duplicate releases', () => {
    const { engine } = setup()
    const note = address('1')
    on(engine, note); on(engine, note)
    expectVoices(engine, 1)
    off(engine, address('missing'))
    expectVoices(engine, 1)
    off(engine, note); off(engine, note)
    expectVoices(engine, 0)
  })

  it('handles a whole key press between render calls without hanging', () => {
    const { engine } = setup(chain(['arpeggiator'], ['echo']))
    on(engine, address('short')); off(engine, address('short'))
    expect(peak(render(engine, BEAT * 2, 157))).toBe(0)
  })

  it('sustains only its source and channel; repeated notes still release separately', () => {
    const { engine } = setup()
    pedal(engine, true)
    const a = address('a'), b = address('b'), other = address('a', 'other'), channel = address('a', 'keyboard', 1)
    for (const note of [a, b, other, channel]) on(engine, note)
    expectVoices(engine, 4)
    for (const note of [a, b, other, channel]) off(engine, note)
    expectVoices(engine, 2)
    pedal(engine, false)
    expectVoices(engine, 0)
  })

  it('pedal up retains keys still physically down', () => {
    const { engine } = setup()
    pedal(engine, true)
    on(engine, address('a')); on(engine, address('b'))
    expectVoices(engine, 2)
    off(engine, address('a')); pedal(engine, false)
    expectVoices(engine, 1)
    off(engine, address('b'))
    expectVoices(engine, 0)
  })

  it.each(['live first', 'clip first'])('separates overlapping clip/live notes at the same pitch: %s', (order) => {
    const { engine, clip } = setup()
    const live = address('live')
    if (order === 'live first') { on(engine, live); render(engine) }
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    render(engine)
    if (order === 'clip first') { on(engine, live); render(engine) }
    expectVoices(engine, 2)
    off(engine, live)
    expectVoices(engine, 1)
    render(engine, BEAT * 3, 173)
    expectVoices(engine, 0)
  })

  it('clip releases, edits and quantized stops leave a same-pitch live note held', () => {
    const { engine, clip } = setup()
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    on(engine, address('live'))
    expectVoices(engine, 2)
    engine.apply({ type: 'track/setClips', trackId: 'a', clips: [{ ...clip, notes: [] }] })
    expectVoices(engine, 1)
    engine.apply({ type: 'track/stop', trackId: 'a' })
    render(engine, BEAT * 5, 251)
    expectVoices(engine, 1)
    off(engine, address('live')); expectVoices(engine, 0)
  })

  it('source disconnect cancels sustained keys, clears the pedal and preserves other owners', () => {
    const { engine } = setup(chain(['transpose', { semitones: 12 }], ['chord']))
    pedal(engine, true)
    on(engine, address('a')); on(engine, address('a', 'other'))
    expectVoices(engine, 6)
    off(engine, address('a'))
    disconnect(engine)
    expectVoices(engine, 3)
    on(engine, address('b')); expectVoices(engine, 6)
    off(engine, address('b')); expectVoices(engine, 3) // pedal was cleared
    disconnect(engine, 'other'); expectVoices(engine, 0)
  })

  it('supports channel-scoped source cleanup', () => {
    const { engine } = setup()
    on(engine, address('a')); on(engine, address('a', 'keyboard', 1))
    expectVoices(engine, 2)
    disconnect(engine, 'keyboard', 0); expectVoices(engine, 1)
    disconnect(engine); expectVoices(engine, 0)
  })

  it('source cleanup and sustain never cancel a simultaneous same-pitch clip voice', () => {
    const { engine, clip } = setup(chain(['transpose', { semitones: 12 }]))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    pedal(engine, true); on(engine, address('live'))
    expectVoices(engine, 2)
    off(engine, address('live')); expectVoices(engine, 2)
    disconnect(engine); expectVoices(engine, 1)
    engine.apply({ type: 'track/setClips', trackId: 'a', clips: [] })
    expectVoices(engine, 0)
  })

  it('panic keeps transport running and allows future clip note-ons', () => {
    const { engine, clip } = setup()
    const next = { ...clip, notes: [createNote(60, 0, 0.5, 1), createNote(60, 1, 0.5, 1)] }
    engine.apply({ type: 'track/setClips', trackId: 'a', clips: [next] })
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: next.id })
    expectVoices(engine, 1)
    engine.apply({ type: 'notes/panic' })
    expectVoices(engine, 0)
    expect(engine.status().playing).toBe(true)
    render(engine, BEAT - 256, 173)
    expectVoices(engine, 1)
    render(engine, BEAT, 173)
    expectVoices(engine, 0)
  })

  it('keeps transformed branches owned independently when their pitches meet at a merge', () => {
    const graph = noteGraphFrom([
      { id: 'c', type: 'clipNotes' }, { id: 't', type: 'transpose', params: { semitones: 0 } },
      { id: 'v', type: 'velocity' }, { id: 'o', type: 'noteOut' },
    ], ['c.out>t.in', 'c.out>v.in', 't.out>o.in', 'v.out>o.in'])
    const { engine } = setup(graph)
    on(engine, address('a')); on(engine, address('a', 'other'))
    expectVoices(engine, 4)
    off(engine, address('a')); expectVoices(engine, 2)
    disconnect(engine, 'other'); expectVoices(engine, 0)
  })

  it('transformed releases remember the mapping before a parameter edit', () => {
    const { engine } = setup(chain(['transpose', { semitones: 12 }], ['chord']))
    on(engine, address('a')); expectVoices(engine, 3)
    engine.apply({ type: 'track/setNoteGraph', trackId: 'a', graph: chain(['transpose', { semitones: -12 }], ['chord', { chord: 0 }]) })
    off(engine, address('a')); expectVoices(engine, 0)
  })

  it('an arpeggiator holds equal-pitch owners independently and source cleanup cancels generated notes', () => {
    const { engine } = setup(chain(['arpeggiator', { rate: 2, gate: 1 }]))
    on(engine, address('a')); on(engine, address('a', 'other'))
    render(engine, 1000, 97)
    off(engine, address('a'))
    expect(peak(render(engine, BEAT, 173))).toBeGreaterThan(0.01)
    disconnect(engine, 'other')
    expect(peak(render(engine, BEAT * 3, 211))).toBe(0)
  })

  it('disconnect and panic cancel delayed echo notes without cancelling another source', () => {
    const { engine } = setup(chain(['echo', { repeats: 3, decay: 1 }]))
    on(engine, address('a')); on(engine, address('a', 'other'))
    expectVoices(engine, 2)
    off(engine, address('a')); off(engine, address('a', 'other'))
    disconnect(engine)
    const echo = render(engine, BEAT * 2, 157)
    expect(peak(echo)).toBeCloseTo(oneVoice, 6)
    engine.apply({ type: 'notes/panic' })
    expect(peak(render(engine, BEAT * 3, 173))).toBe(0)
  })

  it('a delayed off for a stolen voice cannot release its replacement at the same pitch', () => {
    const { engine } = setup(chain(['echo', { repeats: 1, decay: 1 }]), 1)
    on(engine, address('a')); render(engine, BEAT / 2 + 100) // the echo steals the original
    on(engine, address('b')); expectVoices(engine, 1) // steal the echo
    off(engine, address('a'))
    render(engine, BEAT / 4, 173) // stale echo off
    expectVoices(engine, 1)
    off(engine, address('b')); expectVoices(engine, 0)
  })

  it('audition is short and cannot release a simultaneous held note', () => {
    const { engine } = setup()
    on(engine, address('a'))
    engine.apply({ type: 'track/audition', trackId: 'a', pitch: 60, velocity: 1 })
    expectVoices(engine, 2)
    render(engine, RATE / 2, 173)
    expectVoices(engine, 1)
    off(engine, address('a')); expectVoices(engine, 0)
  })

  it.each(['notes/panic', 'transport/stop'] as const)('%s clears keys, sustain and generated events while leaving transport-stop tails renderable', (type) => {
    const { engine } = setup(chain(['arpeggiator'], ['echo']))
    pedal(engine, true); on(engine, address('a'))
    render(engine, 1000)
    engine.apply({ type })
    expect(peak(render(engine, BEAT * 4, 197))).toBe(0)
    on(engine, address('b'))
    render(engine, BEAT)
    off(engine, address('b'))
    disconnect(engine)
    expect(peak(render(engine, BEAT * 2))).toBe(0)
  })

  it.each(['patch', 'voices', 'graph', 'bypass', 'remove', 'replace'] as const)('cleans up %s rebuilds and transitive Track notes readers', (change) => {
    const { engine, add } = setup(chain(['echo']))
    const tap = (source: string) => noteGraphFrom([{ id: 't', type: 'trackNotes', trackId: source, params: { tap: 1 } }, { id: 'e', type: 'echo' }, { id: 'o', type: 'noteOut' }], ['t.out>e.in', 'e.out>o.in'])
    add('b', tap('a')); add('c', tap('b'))
    on(engine, address('a'))
    expect(level(engine)).toBeGreaterThan(oneVoice * 2)
    if (change === 'patch') engine.apply({ type: 'track/setPatch', trackId: 'a', patch: gatePatch })
    if (change === 'voices') engine.apply({ type: 'track/setVoices', trackId: 'a', voices: 2 })
    if (change === 'graph') engine.apply({ type: 'track/setNoteGraph', trackId: 'a', graph: createDefaultNoteGraph() })
    if (change === 'bypass') engine.apply({ type: 'track/setNoteGraph', trackId: 'a', graph: { ...chain(['echo']), nodes: chain(['echo']).nodes.map((node) => node.id === 'e0' ? { ...node, bypassed: true } : node) } })
    if (change === 'remove') engine.apply({ type: 'track/remove', trackId: 'a' })
    if (change === 'replace') add('a')
    expect(peak(render(engine, BEAT * 5, 157))).toBe(0)
  })

  it('structural cleanup preserves unrelated tracks', () => {
    const { engine, add } = setup()
    add('b')
    on(engine, address('a')); on(engine, address('b'), 60, 'b')
    expectVoices(engine, 2)
    engine.apply({ type: 'track/remove', trackId: 'a' })
    expectVoices(engine, 1)
    off(engine, address('b'), 'b'); expectVoices(engine, 0)
  })

  it('runs live Track notes readers while stopped and cleans a disconnected source in every graph', () => {
    const { engine, add } = setup(chain(['transpose', { semitones: 12 }]))
    add('b', noteGraphFrom([{ id: 't', type: 'trackNotes', trackId: 'a', params: { tap: 1 } }, { id: 'e', type: 'arpeggiator', params: { gate: 1 } }, { id: 'o', type: 'noteOut' }], ['t.out>e.in', 'e.out>o.in']))
    on(engine, address('a'))
    expectVoices(engine, 2)
    disconnect(engine)
    expect(peak(render(engine, BEAT * 2, 173))).toBe(0)
  })

  it('aligns clip arpeggios with transport when playback starts after an uneven idle interval', () => {
    const { engine, clip } = setup(chain(['arpeggiator', { rate: 2, gate: 1 }]))
    render(engine, 4567, 173)
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    expectVoices(engine, 1) // beat zero starts immediately, even though the render clock is between grid steps
    expect(engine.status().beat).toBeCloseTo(128 / BEAT)
  })

  it('keeps converging scale pitches and range-split routes independently owned', () => {
    const scaled = setup(chain(['scaleLock', { root: 0, scale: 0 }]))
    on(scaled.engine, address('c'), 60); on(scaled.engine, address('cs'), 61)
    expectVoices(scaled.engine, 2)
    off(scaled.engine, address('c')); expectVoices(scaled.engine, 1)
    off(scaled.engine, address('cs')); expectVoices(scaled.engine, 0)

    const graph = noteGraphFrom([
      { id: 'c', type: 'clipNotes' }, { id: 's', type: 'rangeSplit', params: { minVelocity: 0.5 } },
      { id: 't', type: 'transpose', params: { semitones: 12 } }, { id: 'o', type: 'noteOut' },
    ], ['c.out>s.in', 's.inside>t.in', 't.out>o.in', 's.outside>o.in'])
    const { engine } = setup(graph)
    on(engine, address('loud'))
    engine.apply({ type: 'track/noteOn', trackId: 'a', note: address('quiet'), pitch: 60, velocity: 0.2 })
    expectVoices(engine, 2)
    off(engine, address('loud')); expectVoices(engine, 1)
    off(engine, address('quiet')); expectVoices(engine, 0)
  })

  it('starts clip playback after stopped live input without rewinding or hanging the live graph', () => {
    const { engine, clip } = setup(chain(['arpeggiator', { rate: 2, gate: 1 }]))
    on(engine, address('live'), 64)
    render(engine, 4567, 173)
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    render(engine, BEAT, 157)
    off(engine, address('live')); disconnect(engine)
    engine.apply({ type: 'track/setClips', trackId: 'a', clips: [] })
    render(engine, BEAT) // the current arp gate ends naturally after its input key is released
    expect(peak(render(engine, BEAT * 2, 173))).toBe(0)
  })

  it('is deterministic and handles uneven render block sizes while stopped', () => {
    const run = (chunk: number) => {
      const { engine } = setup(chain(['arpeggiator', { rate: 2, gate: 0.5 }], ['echo']))
      on(engine, address('a')); on(engine, address('b'), 64)
      return render(engine, BEAT * 3, chunk)
    }
    expect(run(173)).toEqual(run(173))
    const a = run(128), b = run(173)
    // Existing musical scheduler rounds event boundaries to samples; odd blocks may differ by one sample.
    const differing = a.reduce((count, value, i) => count + (Math.abs(value - b[i]!) > 1e-6 ? 1 : 0), 0)
    expect(differing).toBeLessThan(64)
    expect(peak(b)).toBeGreaterThan(0.01)
  })

  it('transformed live input sounds at the transformed pitch and stop preserves its release tail', () => {
    let patch = createDefaultPatch()
    for (const node of patch.nodes) {
      if (node.type === 'oscillator') patch = setNodeParam(patch, node.id, 'waveform', 0)
      if (node.type === 'filter') patch = setNodeParam(patch, node.id, 'cutoff', 20000)
      if (node.type === 'delay') patch = setNodeParam(patch, node.id, 'mix', 0)
    }
    const { engine } = setup(chain(['transpose', { semitones: 12 }]), 8, patch)
    on(engine, address('tone'), 57)
    const signal = render(engine, RATE / 2, 173)
    let crossings = 0
    for (let i = 4001; i < 20000; i++) if (signal[i - 1]! <= 0 && signal[i]! > 0) crossings++
    expect(crossings * RATE / 15999).toBeCloseTo(440, -1) // 57 + 12 = A4
    engine.apply({ type: 'transport/stop' })
    const tail = render(engine, RATE, 157)
    expect(peak(tail.subarray(0, 1000))).toBeGreaterThan(0.001)
    expect(peak(tail.subarray(RATE - 4000))).toBeLessThan(1e-4)
  })

  it('commands survive JSON serialization and invalid or absent destinations are harmless', () => {
    const { engine } = setup()
    const command: EngineCommand = { type: 'track/noteOn', trackId: 'a', note: address('json'), pitch: 60, velocity: 1 }
    engine.apply(JSON.parse(JSON.stringify(command)) as EngineCommand)
    expectVoices(engine, 1)
    on(engine, address('bad'), 60, 'absent')
    on(engine, address('bad'), NaN)
    off(engine, address('json')); expectVoices(engine, 0)
  })
})
