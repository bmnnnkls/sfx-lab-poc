import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { createRng, hashSigned } from '../random'
import { requireNodeDefinition } from '../registry'
import { fractalNoise, gradientNoise } from './perlin.node'
import { rollBetween } from './random.node'

const RATE = 48000
const BLOCK = 128

const context = (frames: number) => ({
  frames,
  sampleRate: RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

/** `blocks` blocks of 128 through a node, params set before the first; returns each output as one long array. `inputs(block)` gives the input buffers of a block. */
const render = (
  type: string,
  params: Record<string, number>,
  blocks: number,
  inputs: (block: number) => ReadonlyArray<Float32Array | null> = () => [],
): Float32Array[] => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const outputs = definition.outputs.map(() => new Float32Array(blocks * BLOCK))
  for (let block = 0; block < blocks; block++) {
    const views = outputs.map((output) => output.subarray(block * BLOCK, (block + 1) * BLOCK))
    node.process(context(BLOCK), inputs(block), views)
  }
  return outputs
}

const energy = (data: Float32Array) => data.reduce((sum, v) => sum + v * v, 0)
const rms = (data: Float32Array) => Math.sqrt(energy(data) / data.length)
const edges = (data: Float32Array) => {
  let count = 0
  for (let i = 1; i < data.length; i++) if (data[i]! > 0.5 && data[i - 1]! <= 0.5) count++
  return count
}
/** Mean energy of the sample-to-sample change over the energy of the signal: high for bright noise, low for a rumble. */
const brightness = (data: Float32Array) => {
  let change = 0
  for (let i = 1; i < data.length; i++) change += (data[i]! - data[i - 1]!) ** 2
  return change / energy(data)
}

describe('seeded randomness', () => {
  it('the same seed is the same sequence, a different seed another, and reseeding goes back to the start', () => {
    const [a, b, c] = [createRng(7), createRng(7), createRng(8)]
    const first = Array.from({ length: 20 }, () => a.next())
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(first)
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(first)
    a.reseed(7)
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(first)
  })

  it('stays in [0, 1) and is spread evenly, and neighbouring seeds do not start alike', () => {
    const rng = createRng(1)
    const values = Array.from({ length: 20000 }, () => rng.next())
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(values.reduce((s, v) => s + v, 0) / values.length).toBeCloseTo(0.5, 1)
    expect(createRng(0).next()).not.toBeCloseTo(createRng(1).next(), 3)
  })

  it('survives a seed that is not a whole number', () => {
    for (const seed of [Number.NaN, Infinity, -5, 0.5, 1e12]) {
      const value = createRng(seed).next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('a lattice hash depends only on the index and seed, within [-1, 1)', () => {
    expect(hashSigned(5, 1)).toBe(hashSigned(5, 1))
    expect(hashSigned(5, 1)).not.toBe(hashSigned(6, 1))
    expect(hashSigned(5, 1)).not.toBe(hashSigned(5, 2))
    for (let i = -50; i < 50; i++) expect(Math.abs(hashSigned(i, 3))).toBeLessThanOrEqual(1)
  })
})

describe('noise', () => {
  const take = (params: Record<string, number>, blocks = 400) => render('noise', params, blocks)[0]!

  it('is the same every time for a seed, and different for another seed', () => {
    expect(take({ seed: 4 }, 4)).toEqual(take({ seed: 4 }, 4))
    expect(take({ seed: 4 }, 4)).not.toEqual(take({ seed: 5 }, 4))
  })

  it('white noise is evenly spread over the level it is given: rms level / sqrt(3), peak under the level', () => {
    const white = take({ colour: 0, level: 0.6 })
    expect(rms(white)).toBeCloseTo(0.6 / Math.sqrt(3), 2)
    expect(Math.max(...white.map(Math.abs))).toBeLessThanOrEqual(0.6)
    expect(white.reduce((s, v) => s + v, 0) / white.length).toBeCloseTo(0, 1)
  })

  it('pink and brown are softer in the highs: white is brighter than pink, and pink than brown', () => {
    const [white, pink, brown] = [0, 1, 2].map((colour) => brightness(take({ colour, level: 1 }))) as [number, number, number]
    expect(white).toBeGreaterThan(1.8)
    expect(pink).toBeLessThan(white * 0.75)
    expect(brown).toBeLessThan(pink * 0.25)
  })

  it('every colour stays inside -1..1 and finite at full level over a long run, and level 0 is silent', () => {
    for (const colour of [0, 1, 2]) {
      const data = take({ colour, level: 1 }, 1500)
      expect(data.every((v) => Number.isFinite(v) && Math.abs(v) <= 1), `colour ${colour}`).toBe(true)
      expect(rms(data), `colour ${colour} has some sound`).toBeGreaterThan(0.05)
      expect(take({ colour, level: 0 }, 4).every((v) => v === 0)).toBe(true)
    }
  })

  it('brown noise does not drift off: its mean stays near zero', () => {
    const brown = take({ colour: 2, level: 1 }, 1500)
    expect(Math.abs(brown.reduce((s, v) => s + v, 0) / brown.length)).toBeLessThan(0.1)
  })
})

describe('perlin noise', () => {
  it('gradient noise is 0 at every whole number and stays within -1..1 between them', () => {
    for (let i = -5; i <= 5; i++) expect(gradientNoise(i, 3)).toBeCloseTo(0, 12)
    for (let x = -10; x < 10; x += 0.013) expect(Math.abs(gradientNoise(x, 3))).toBeLessThanOrEqual(1)
  })

  it('has no jumps: neighbouring points are close, and it is not flat', () => {
    let largest = 0
    let seen = 0
    for (let x = 0; x < 50; x += 0.001) {
      largest = Math.max(largest, Math.abs(gradientNoise(x + 0.001, 9) - gradientNoise(x, 9)))
      seen = Math.max(seen, Math.abs(gradientNoise(x, 9)))
    }
    expect(largest).toBeLessThan(0.01)
    expect(seen).toBeGreaterThan(0.2)
  })

  it('fractal noise stays within -1..1 for any octaves and persistence, and with persistence 0 is just the first octave', () => {
    for (const octaves of [1, 3, 6]) for (const persistence of [0, 0.5, 1]) {
      for (let x = 0; x < 30; x += 0.07) expect(Math.abs(fractalNoise(x, 2, octaves, persistence))).toBeLessThanOrEqual(1)
    }
    expect(fractalNoise(3.37, 2, 4, 0)).toBeCloseTo(gradientNoise(3.37, 2), 12)
  })

  it('the node is smooth and seeded; uni is out shifted into 0..depth; depth scales it', () => {
    const [out, uni] = render('perlin', { rate: 2, octaves: 3, depth: 0.5 }, 200)
    let largest = 0
    for (let i = 1; i < out!.length; i++) largest = Math.max(largest, Math.abs(out![i]! - out![i - 1]!))
    expect(largest).toBeLessThan(0.002)
    expect(Math.max(...out!.map(Math.abs))).toBeLessThanOrEqual(0.5)
    expect(Math.max(...out!.map(Math.abs))).toBeGreaterThan(0.05)
    for (let i = 0; i < out!.length; i += 17) expect(uni![i]).toBeCloseTo((out![i]! + 0.5) / 2, 6)
    expect(render('perlin', { rate: 2, octaves: 3, depth: 0.5 }, 20)[0]).toEqual(out!.subarray(0, 20 * BLOCK))
    expect(render('perlin', { rate: 2, octaves: 3, depth: 0.5, seed: 9 }, 20)[0]).not.toEqual(out!.subarray(0, 20 * BLOCK))
  })

  it('a higher rate wanders faster: it crosses zero more often', () => {
    const crossings = (rate: number) => {
      const out = render('perlin', { rate, octaves: 1 }, 1500)[0]!
      let count = 0
      for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 !== out[i]! < 0) count++
      return count
    }
    expect(crossings(8)).toBeGreaterThan(crossings(1) * 3)
  })

  it('a rise on Retrig starts the wandering from the start again, so notes wander alike', () => {
    const gate = (block: number) => {
      const buffer = new Float32Array(BLOCK)
      if (block === 60) buffer.fill(1)
      return [buffer]
    }
    const [out] = render('perlin', { rate: 3, octaves: 2 }, 90, gate)
    const restarted = out!.subarray(60 * BLOCK, 60 * BLOCK + 50)
    expect([...restarted.subarray(0, 50)]).toEqual([...out!.subarray(0, 50)])
  })
})

describe('geiger', () => {
  const seconds = 8
  const blocks = Math.ceil((seconds * RATE) / BLOCK)

  it('clicks about `rate` times a second on average, at irregular times', () => {
    const [, trigger] = render('geiger', { rate: 20, gate: 0.001 }, blocks)
    const clicks = edges(trigger!)
    // 160 expected, standard deviation about 13, and the seed makes it the same every run.
    expect(clicks).toBeGreaterThan(110)
    expect(clicks).toBeLessThan(210)
    const gaps: number[] = []
    let last = -1
    trigger!.forEach((v, i) => {
      if (v > 0.5 && (i === 0 || trigger![i - 1]! <= 0.5)) {
        if (last >= 0) gaps.push(i - last)
        last = i
      }
    })
    expect(new Set(gaps).size).toBeGreaterThan(gaps.length / 2)
  })

  it('is the same for a seed, and different for another', () => {
    const run = (seed: number) => render('geiger', { rate: 50, seed }, 100)
    expect(run(2)).toEqual(run(2))
    expect(run(2)[0]).not.toEqual(run(3)[0])
  })

  it('makes nothing at rate 0, and a click of crackle that dies away', () => {
    const [silent, none] = render('geiger', { rate: 0 }, 50)
    expect(silent!.every((v) => v === 0) && none!.every((v) => v === 0)).toBe(true)
    // One click per ~second: the crackle after a click is louder at the start than 20 ms later.
    const [click, trigger] = render('geiger', { rate: 3, decay: 5, spread: 0 }, 400)
    const start = trigger!.findIndex((v) => v > 0.5)
    expect(start).toBeGreaterThanOrEqual(0)
    const early = rms(click!.subarray(start, start + 120))
    const late = rms(click!.subarray(start + 2400, start + 2520))
    expect(early).toBeGreaterThan(late * 5)
  })

  it('the trigger stays high for the gate time after a click', () => {
    const [, trigger] = render('geiger', { rate: 5, gate: 0.01 }, 800)
    const runs: number[] = []
    let length = 0
    for (const v of trigger!) {
      if (v > 0.5) length++
      else if (length > 0) { runs.push(length); length = 0 }
    }
    expect(runs.length).toBeGreaterThan(5)
    expect(Math.min(...runs)).toBeGreaterThanOrEqual(480)
  })

  it('spread varies the strength of the clicks; no spread makes them alike', () => {
    const peaks = (spread: number) => {
      const [click, trigger] = render('geiger', { rate: 4, decay: 0.2, spread, gate: 0.001 }, 1500)
      const found: number[] = []
      trigger!.forEach((v, i) => {
        if (v > 0.5 && (i === 0 || trigger![i - 1]! <= 0.5)) found.push(Math.max(...click!.subarray(i, i + 20).map(Math.abs)))
      })
      return found
    }
    const [flat, varied] = [peaks(0), peaks(1)]
    expect(flat.length).toBeGreaterThan(5)
    expect(Math.max(...varied) - Math.min(...varied)).toBeGreaterThan(Math.max(...flat) - Math.min(...flat))
    expect(Math.max(...flat, ...varied)).toBeLessThanOrEqual(1)
  })

  it('is always finite, even at the fastest rate and the shortest decay', () => {
    const [click, trigger] = render('geiger', { rate: 5000, decay: 0.05, gate: 0.001 }, 200)
    expect(click!.every(Number.isFinite) && trigger!.every((v) => v === 0 || v === 1)).toBe(true)
  })
})

describe('random', () => {
  const roll = (high: readonly number[]) => (block: number) => {
    const buffer = new Float32Array(BLOCK)
    if (high.includes(block)) buffer.fill(1)
    return [buffer]
  }
  const values = (out: Float32Array, blocks: number) => Array.from({ length: blocks }, (_, block) => out[block * BLOCK + 5]!)

  it('rolls a value from its seed before anything is asked, within the range, and keeps it', () => {
    const [out] = render('random', { min: 10, max: 20 }, 10)
    expect(out![0]).toBeGreaterThanOrEqual(10)
    expect(out![0]).toBeLessThanOrEqual(20)
    expect(new Set(out).size).toBe(1)
    expect(render('random', { min: 10, max: 20 }, 3)[0]![0]).toBe(out![0])
    expect(render('random', { min: 10, max: 20, seed: 6 }, 3)[0]![0]).not.toBe(out![0])
  })

  it('a rise on Roll draws a new value; a level that stays high does not draw again', () => {
    const [out] = render('random', { min: 0, max: 100 }, 12, roll([3, 4, 5, 9]))
    const seen = values(out!, 12)
    expect(seen[0]).toBe(seen[2])
    expect(seen[3]).not.toBe(seen[2])
    expect(seen[3]).toBe(seen[4])
    expect(seen[4]).toBe(seen[5])
    expect(seen[6]).toBe(seen[5])
    expect(seen[9]).not.toBe(seen[8])
  })

  it('the same seed gives the same rolls, in order', () => {
    const run = () => values(render('random', { seed: 12 }, 12, roll([2, 5, 8]))[0]!, 12)
    expect(run()).toEqual(run())
  })

  it('snaps to the step, takes the limits either way round, and follows Min and Max without a new roll', () => {
    const [stepped] = render('random', { min: 0, max: 10, step: 2.5 }, 30, roll([2, 5, 8, 11, 14, 17, 20, 23, 26]))
    for (const v of stepped!) expect([0, 2.5, 5, 7.5, 10]).toContain(v)
    expect(rollBetween(0.3, 20, 10, 0)).toBeCloseTo(13, 6)
    const definition = requireNodeDefinition('random')
    const node = definition.create(RATE)
    const out = new Float32Array(BLOCK)
    node.process(context(BLOCK), [], [out])
    node.setParam('min', 100)
    node.setParam('max', 200)
    const again = new Float32Array(BLOCK)
    node.process(context(BLOCK), [], [again])
    expect(again[0]).toBeGreaterThanOrEqual(100)
    expect(again[0]).toBeLessThanOrEqual(200)
  })

  it('never gives NaN or leaves its range, whatever the settings', () => {
    expect(rollBetween(0.5, Number.NaN, 1, 0)).toBe(0.5) // a limit that is not a number counts as 0
    expect(Number.isFinite(rollBetween(Number.NaN, Infinity, -Infinity, Number.NaN))).toBe(true)
    expect(rollBetween(0.5, 0, 1, 0.3)).toBeLessThanOrEqual(1)
    expect(rollBetween(2, 0, 1, 0)).toBeLessThanOrEqual(1)
  })
})
