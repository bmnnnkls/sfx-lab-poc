import { describe, expect, it } from 'vitest'
import type { NoteEvent } from '../session'
import { type NoteGraphSpec, NoteGraph, type TapBoard, noteTapSources } from './graph'
import { Merger } from './merge'
import { findNoteNode } from './registry'

const on = (beat: number, pitch: number, velocity = 0.8): NoteEvent => ({ beat, kind: 'noteOn', pitch, velocity })
const off = (beat: number, pitch: number): NoteEvent => ({ beat, kind: 'noteOff', pitch })
const allOff = (beat: number): NoteEvent => ({ beat, kind: 'allOff' })
const summary = (events: NoteEvent[]) => events.map((e) => `${e.beat}:${e.kind === 'allOff' ? 'X' : (e.kind === 'noteOn' ? '+' : '-') + e.pitch}`)
const pitchesOn = (events: NoteEvent[]) => events.flatMap((e) => (e.kind === 'noteOn' ? [e.pitch] : []))

interface TestNode {
  id: string
  type: string
  params?: Record<string, number>
  trackId?: string
  bypassed?: boolean
}

/** Builds a graph spec from "a.out>b.in" style wires. */
const spec = (nodes: TestNode[], wires: string[]): NoteGraphSpec => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    type: node.type,
    params: Object.fromEntries((findNoteNode(node.type)?.params ?? []).map((p) => [p.id, node.params?.[p.id] ?? p.default])),
    trackId: node.trackId,
    bypassed: node.bypassed,
  })),
  connections: wires.map((wire) => {
    const [from, to] = wire.split('>') as [string, string]
    const [fromNode, fromPort] = from.split('.') as [string, string]
    const [toNode, toPort] = to.split('.') as [string, string]
    return { from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } }
  }),
})

const empty: TapBoard = new Map()
const run = (graph: NoteGraph, events: NoteEvent[], from = 0, to = 4, board: TapBoard = empty) => graph.process(events, from, to, board)

const passthrough = spec([{ id: 'c', type: 'clipNotes' }, { id: 'o', type: 'noteOut' }], ['c.out>o.in'])

describe('NoteGraph basics', () => {
  it('clip notes straight to the instrument come out untouched (the same events)', () => {
    const graph = new NoteGraph()
    graph.sync(passthrough)
    const input = [on(0, 60)]
    expect(run(graph, input)).toBe(input)
  })

  it('a graph with no instrument output is silent', () => {
    const graph = new NoteGraph()
    graph.sync(spec([{ id: 'c', type: 'clipNotes' }], []))
    expect(run(graph, [on(0, 60)])).toEqual([])
  })

  it('applies effects along a chain, in order', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 't', type: 'transpose', params: { semitones: 1 } }, { id: 's', type: 'scaleLock', params: { root: 0, scale: 0 } }, { id: 'o', type: 'noteOut' }],
      ['c.out>t.in', 't.out>s.in', 's.out>o.in'],
    ))
    expect(summary(run(graph, [on(0, 60)]))).toEqual(['0:+60']) // 61 snaps back to 60
  })

  it('unknown node types are ignored and their wires go nowhere', () => {
    const graph = new NoteGraph()
    graph.sync(spec([{ id: 'c', type: 'clipNotes' }, { id: 'x', type: 'nope' }, { id: 'o', type: 'noteOut' }], ['c.out>x.in', 'x.out>o.in', 'c.out>o.in']))
    expect(summary(run(graph, [on(0, 60)]))).toEqual(['0:+60'])
  })

  it('nodes on a cycle do not run, and nothing hangs', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 'a', type: 'transpose' }, { id: 'b', type: 'transpose' }, { id: 'o', type: 'noteOut' }],
      ['c.out>o.in', 'a.out>b.in', 'b.out>a.in'],
    ))
    expect(summary(run(graph, [on(0, 60)]))).toEqual(['0:+60'])
  })
})

describe('splitting and merging', () => {
  it('an output can feed several branches: the stream is cloned', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 'up', type: 'transpose', params: { semitones: 12 } }, { id: 'o', type: 'noteOut' }],
      ['c.out>o.in', 'c.out>up.in', 'up.out>o.in'],
    ))
    expect(pitchesOn(run(graph, [on(0, 60)]))).toEqual([60, 72])
  })

  it('branches get different effects before they meet again', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [
        { id: 'c', type: 'clipNotes' },
        { id: 'fifth', type: 'transpose', params: { semitones: 7 } },
        { id: 'octave', type: 'transpose', params: { semitones: 12 } },
        { id: 'o', type: 'noteOut' },
      ],
      ['c.out>fifth.in', 'c.out>octave.in', 'fifth.out>o.in', 'octave.out>o.in'],
    ))
    const out = run(graph, [on(0, 60), off(1, 60)])
    expect(pitchesOn(out).sort()).toEqual([67, 72])
    expect(summary(out).filter((e) => e.includes('-')).sort()).toEqual(['1:-67', '1:-72'])
  })

  it('a range split sends low and high notes to different branches', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [
        { id: 'c', type: 'clipNotes' },
        { id: 's', type: 'rangeSplit', params: { lowPitch: 60 } },
        { id: 'chord', type: 'chord', params: { chord: 2 } },
        { id: 'o', type: 'noteOut' },
      ],
      ['c.out>s.in', 's.inside>chord.in', 'chord.out>o.in', 's.outside>o.in'],
    ))
    const out = run(graph, [on(0, 48), on(0, 64)])
    expect(pitchesOn(out).sort((a, b) => a - b)).toEqual([48, 64, 68, 71]) // 48 passes, 64 becomes a major chord
  })

  it('a note-off follows its note-on through a range split, even after the range changes', () => {
    const graph = new NoteGraph()
    const nodes = (low: number): TestNode[] => [{ id: 'c', type: 'clipNotes' }, { id: 's', type: 'rangeSplit', params: { lowPitch: low } }, { id: 'a', type: 'transpose', params: { semitones: 1 } }, { id: 'o', type: 'noteOut' }]
    const wires = ['c.out>s.in', 's.inside>a.in', 'a.out>o.in']
    graph.sync(spec(nodes(60), wires))
    expect(summary(run(graph, [on(0, 62)], 0, 1))).toEqual(['0:+63'])
    graph.sync(spec(nodes(70), wires)) // a knob turn: 62 is now outside, but it started inside
    expect(summary(run(graph, [off(1, 62)], 1, 2))).toEqual(['1:-63'])
  })

  it('range split can also filter by velocity', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 's', type: 'rangeSplit', params: { lowPitch: 0, minVelocity: 0.5 } }, { id: 'o', type: 'noteOut' }],
      ['c.out>s.in', 's.inside>o.in'],
    ))
    expect(pitchesOn(run(graph, [on(0, 60, 0.9), on(0, 62, 0.2)]))).toEqual([60])
  })
})

describe('merger', () => {
  it('passes notes of different pitches through', () => {
    expect(summary(new Merger().process([on(0, 60), on(0, 64), off(1, 60), off(1, 64)]))).toEqual(['0:+60', '0:+64', '1:-60', '1:-64'])
  })

  it('keeps a note sounding until the last overlapping note of that pitch ends', () => {
    // one stream holds C from 0 to 4, another plays C from 1 to 2
    const out = new Merger().process([on(0, 60), off(4, 60), on(1, 60), off(2, 60)])
    expect(summary(out)).toEqual(['0:+60', '1:-60', '1:+60', '4:-60'])
  })

  it('a note that ends exactly when another begins does not cut the new one', () => {
    expect(summary(new Merger().process([on(0, 60), off(1, 60), on(1, 60), off(2, 60)]))).toEqual(['0:+60', '1:-60', '1:+60', '2:-60'])
  })

  it('the same note arriving twice at the same beat is one note', () => {
    expect(summary(new Merger().process([on(0, 60), on(0, 60), off(2, 60), off(2, 60)]))).toEqual(['0:+60', '2:-60'])
  })

  it('remembers across calls, and "all off" clears it', () => {
    const merger = new Merger()
    merger.process([on(0, 60), on(0.5, 60)])
    expect(merger.process([off(1, 60)])).toEqual([]) // one still sounding
    expect(merger.process([off(2, 60)])).toEqual([off(2, 60)])
    merger.process([on(3, 62), on(3.5, 62)])
    merger.process([allOff(4)])
    expect(merger.process([off(5, 62)])).toEqual([off(5, 62)])
  })
})

describe('merging in the graph', () => {
  it('two branches playing the same pitch do not cut each other short', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 'echo', type: 'transpose', params: { semitones: 0 } }, { id: 'o', type: 'noteOut' }],
      ['c.out>o.in', 'c.out>echo.in', 'echo.out>o.in'],
    ))
    // the same note arrives by two routes; only when both have ended does the instrument get the off
    const out = run(graph, [on(0, 60), off(2, 60)])
    expect(summary(out).filter((e) => e.includes('-'))).toEqual(['2:-60'])
  })
})

describe('notes from another track', () => {
  const board = (): TapBoard =>
    new Map([['other', { clip: [on(0, 48), off(1, 48)], out: [on(0, 55), off(1, 55)] }]])
  const tapGraph = (tap: number, trackId: string | null = 'other') =>
    spec([{ id: 't', type: 'trackNotes', trackId: trackId ?? undefined, params: { tap } }, { id: 'o', type: 'noteOut' }], ['t.out>o.in'])

  it('takes the other track\'s clip notes, or what leaves its own graph', () => {
    const graph = new NoteGraph()
    graph.sync(tapGraph(0))
    expect(pitchesOn(run(graph, [], 0, 4, board()))).toEqual([48])
    graph.sync(tapGraph(1))
    expect(pitchesOn(run(graph, [], 0, 4, board()))).toEqual([55])
  })

  it('mixes them with this track\'s own notes', () => {
    const graph = new NoteGraph()
    graph.sync(spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 't', type: 'trackNotes', trackId: 'other' }, { id: 'o', type: 'noteOut' }],
      ['c.out>o.in', 't.out>o.in'],
    ))
    expect(pitchesOn(run(graph, [on(0, 72)], 0, 4, board())).sort((a, b) => a - b)).toEqual([48, 72])
  })

  it('a node with no track, or a track that played nothing, gives no notes', () => {
    const graph = new NoteGraph()
    graph.sync(tapGraph(0, null))
    expect(run(graph, [], 0, 4, board())).toEqual([])
    graph.sync(tapGraph(0, 'missing'))
    expect(run(graph, [], 0, 4, board())).toEqual([])
  })

  it('knows which tracks it reads from', () => {
    const graph = new NoteGraph()
    const s = tapGraph(0)
    graph.sync(s)
    expect(graph.tapSources()).toEqual(['other'])
    expect(noteTapSources(s)).toEqual(['other'])
  })
})

describe('editing a running graph', () => {
  const arpGraph = (gate: number) =>
    spec([{ id: 'c', type: 'clipNotes' }, { id: 'a', type: 'arpeggiator', params: { rate: 1, gate } }, { id: 'o', type: 'noteOut' }], ['c.out>a.in', 'a.out>o.in'])

  it('turning a knob keeps running state, so an arpeggio does not restart', () => {
    const graph = new NoteGraph()
    graph.sync(arpGraph(0.5))
    const first = run(graph, [on(0, 60), on(0, 64), on(0, 67)], 0, 1)
    expect(pitchesOn(first)).toEqual([60, 64])
    graph.sync(arpGraph(0.9))
    const second = run(graph, [], 1, 2)
    expect(second.some((e) => e.kind === 'allOff')).toBe(false)
    expect(pitchesOn(second)).toEqual([67, 60]) // carried on
  })

  it('changing the wiring restarts and silences first, once', () => {
    const graph = new NoteGraph()
    graph.sync(passthrough)
    run(graph, [on(0, 60)], 0, 1)
    graph.sync(spec([{ id: 'c', type: 'clipNotes' }, { id: 't', type: 'transpose' }, { id: 'o', type: 'noteOut' }], ['c.out>t.in', 't.out>o.in']))
    expect(run(graph, [], 1, 2)[0]).toEqual(allOff(1))
    expect(run(graph, [], 2, 3)).toEqual([])
  })

  it('the very first sync does not emit an all-off', () => {
    const graph = new NoteGraph()
    graph.sync(passthrough)
    expect(run(graph, [], 0, 1)).toEqual([])
  })

  it('a bypassed effect lets notes through unchanged', () => {
    const graph = new NoteGraph()
    graph.sync(spec([{ id: 'c', type: 'clipNotes' }, { id: 't', type: 'transpose', params: { semitones: 7 }, bypassed: true }, { id: 'o', type: 'noteOut' }], ['c.out>t.in', 't.out>o.in']))
    expect(summary(run(graph, [on(0, 60)]))).toEqual(['0:+60'])
  })

  it('gives the same events however the time is cut into ranges', () => {
    const s = spec(
      [{ id: 'c', type: 'clipNotes' }, { id: 'a', type: 'arpeggiator', params: { pattern: 4, rate: 2 } }, { id: 'e', type: 'echo' }, { id: 'o', type: 'noteOut' }],
      ['c.out>a.in', 'a.out>e.in', 'e.out>o.in'],
    )
    const input = [on(0, 57), on(0, 61), on(0, 64), off(3.5, 57), off(3.5, 61), off(3.5, 64)]
    const go = (cuts: number[]) => {
      const graph = new NoteGraph()
      graph.sync(s)
      return cuts.slice(0, -1).flatMap((from, i) => {
        const to = cuts[i + 1]!
        return summary(graph.process(input.filter((e) => e.beat >= from && e.beat < to), from, to, empty))
      })
    }
    const fine = Array.from({ length: 65 }, (_, i) => i * 0.0625)
    expect(go(fine)).toEqual(go([0, 1, 2, 3, 4]))
    expect(go(fine)).toEqual(go([0, 0.37, 1.91, 2.5, 4]))
    expect(go(fine).length).toBeGreaterThan(40)
  })

  it('reset forgets held notes', () => {
    const graph = new NoteGraph()
    graph.sync(arpGraph(0.5))
    run(graph, [on(0, 60)], 0, 0.6)
    graph.reset()
    expect(pitchesOn(run(graph, [], 1, 3))).toEqual([])
  })
})
