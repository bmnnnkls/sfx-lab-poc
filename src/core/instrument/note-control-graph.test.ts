import { expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import { NoteControlGraph } from './note-control-graph'

const patch = () => noteGraphFrom([
  { id: 'v', type: 'control', params: { value: 0 } },
  { id: 'a', type: 'smooth', params: { time: 0.01 } },
  { id: 'b', type: 'smooth', params: { time: 0.02 } },
  { id: 'tr', type: 'transpose' },
], ['v.out>a.in', 'a.out>b.in', 'b.out>tr.param:semitones'])

for (const rate of [8000, 44100, 48000, 96000]) for (const chunk of [1, 97, 128, 173]) {
  it(`clocks chained helpers chronologically at ${rate} Hz with caller chunk ${chunk}`, () => {
    const graph = new NoteControlGraph(patch(), rate)
    let actual = NaN
    const write = (_node: string, _param: string, value: number) => { actual = value }
    graph.process(write)
    expect(actual).toBe(0) // first sample primes both helpers with their input
    graph.setParam('v', 'value', 1)
    let a = 0, b = 0
    const frames = Math.round(rate * .025)
    for (let start = 0; start < frames; start += chunk) {
      for (let i = start; i < Math.min(frames, start + chunk); i++) {
        a += (1 - a) * (1 - Math.exp(-1 / (.01 * rate)))
        b += (Math.fround(a) - b) * (1 - Math.exp(-1 / (.02 * rate)))
        graph.process(write)
        expect(actual).toBeCloseTo(Math.fround(b), 6)
      }
    }
  })
}

it('configuration-only updates do not advance state; compatible edits keep state and wires own parameters', () => {
  const graph = new NoteControlGraph(patch(), 8000)
  let actual = NaN
  const write = (_n: string, _p: string, v: number) => { actual = v }
  graph.process(write)
  const updated = patch()
  const nodes = updated.nodes.map(n => n.id === 'v' ? { ...n, params: { ...n.params, value: 1 } } : n)
  expect(graph.sync({ ...updated, nodes })).toBe(true)
  expect(actual).toBe(0)
  graph.setParam('b', 'in', 99) // driven socket ignores scalar writes
  graph.process(write)
  const a = Math.fround(1 - Math.exp(-1 / 80))
  expect(actual).toBeCloseTo(Math.fround(a * (1 - Math.exp(-1 / 160))), 7)
  expect(graph.sync({ ...updated, connections: [] })).toBe(false)
})
