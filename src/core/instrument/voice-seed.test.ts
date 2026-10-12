import { describe, expect, it } from 'vitest'
import { type Patch, addNode, connect, createNode, setNodeParam } from '../patch'
import { SampleBank } from '../sample'
import { Instrument } from './instrument'

const RATE = 48000

/** noise -> output: no envelope, so a voice sounds for as long as it is held. */
const noisePatch = (voices: 'differ' | 'same'): Patch => {
  const noise = createNode('noise', 0, 0)
  const out = createNode('output', 0, 0)
  let patch = [noise, out].reduce(addNode, { nodes: [], connections: [] } as Patch)
  patch = setNodeParam(patch, noise.id, 'level', 1)
  patch = setNodeParam(patch, noise.id, 'voices', voices === 'differ' ? 0 : 1)
  return connect(patch, { node: noise.id, port: 'out' }, { node: out.id, port: 'in' })
}

const play = (patch: Patch, pitches: readonly number[]): Float32Array => {
  const instrument = new Instrument(patch, RATE, 4, new SampleBank())
  for (const pitch of pitches) instrument.noteOn(pitch)
  const out = new Float32Array(128 * 20)
  for (let block = 0; block < 20; block++) out.set(instrument.render(128).subarray(0, 128), block * 128)
  return out
}

const rms = (data: Float32Array) => Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)

describe('noise in a chord', () => {
  it('two voices make different noise by default, so their level adds as power, not as amplitude', () => {
    const patch = noisePatch('differ')
    const [one, two] = [play(patch, [60]), play(patch, [60, 64])]
    expect(rms(two) / rms(one)).toBeGreaterThan(1.25)
    expect(rms(two) / rms(one)).toBeLessThan(1.6)
    // Not just twice the first voice.
    expect(two).not.toEqual(one.map((v) => v * 2))
  })

  it('with Voices set to same they are the same noise, which adds up to exactly twice the level', () => {
    const patch = noisePatch('same')
    const [one, two] = [play(patch, [60]), play(patch, [60, 64])]
    expect(two).toEqual(one.map((v) => v * 2))
  })

  it('a single note sounds as it always did: the first voice is slot 0', () => {
    expect(play(noisePatch('differ'), [60])).toEqual(play(noisePatch('same'), [60]))
  })

  it('is the same every time for the same notes, voices differing or not', () => {
    for (const voices of ['differ', 'same'] as const) {
      const patch = noisePatch(voices)
      expect(play(patch, [60, 64, 67])).toEqual(play(patch, [60, 64, 67]))
    }
  })
})
