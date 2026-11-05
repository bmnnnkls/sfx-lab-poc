import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import type { EngineCommand } from './commands'

const engineWith = (...commands: EngineCommand[]) => {
  const engine = new Engine(48000)
  for (const command of commands) engine.apply(command)
  return engine
}
const render = (engine: Engine, frames: number, block = 128) => {
  for (let done = 0; done < frames; done += block) {
    const n = Math.min(block, frames - done)
    engine.render(new Float32Array(n), new Float32Array(n))
  }
}
const counters = (engine: Engine) => ({ run: engine.clock().run, lap: engine.clock().lap })
// At 120 BPM and 48 kHz a beat is 24000 frames.
const BEAT = 24000
const loop: EngineCommand = { type: 'arrangement/setLoop', loop: { from: 0, to: 2 } }

describe('The clock\'s runs and laps', () => {
  it.each([1, 97, 128, 4096])('each loop jump adds one lap (blocks of %i)', (block) => {
    const engine = engineWith(loop, { type: 'arrangement/play', fromBeat: 0 })
    const start = counters(engine)
    render(engine, BEAT * 2 * 3 + BEAT / 2, block) // three passes and a half
    expect(counters(engine)).toEqual({ run: start.run, lap: 3 })
    expect(engine.status()).toMatchObject({ run: start.run, lap: 3 })
  })

  it('a seek while playing, and a start, begin a new run with no laps', () => {
    const engine = engineWith(loop, { type: 'arrangement/play', fromBeat: 0 })
    const first = engine.clock().run!
    render(engine, BEAT * 5)
    expect(engine.clock().lap).toBe(2)
    engine.apply({ type: 'arrangement/play', fromBeat: 1 })
    expect(counters(engine)).toEqual({ run: first + 1, lap: 0 })
    engine.apply({ type: 'transport/stop' })
    expect(engine.clock().run).toBe(first + 1)
    engine.apply({ type: 'transport/play' })
    expect(counters(engine)).toEqual({ run: first + 2, lap: 0 })
  })

  it('a launch while playing is not a new run', () => {
    const engine = engineWith({ type: 'transport/play' })
    const run = engine.clock().run
    engine.apply({ type: 'transport/play' })
    engine.apply({ type: 'scene/launch', scene: 0 })
    expect(engine.clock().run).toBe(run)
  })

  it('a count-in and the start it makes are one run', () => {
    const engine = engineWith({ type: 'transport/countIn', bars: 1, then: { type: 'arrangement/play', fromBeat: 8 } })
    const run = engine.clock().run
    render(engine, BEAT * 4 + 256)
    expect(engine.status()).toMatchObject({ playing: true, mode: 'arrangement', run, lap: 0 })
    expect(engine.status().beat).toBeGreaterThan(8)
  })
})
