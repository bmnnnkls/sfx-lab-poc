import { Engine, createDefaultFxGraph, createDefaultMasterGraph, type ArrangementClip, type EngineCommand } from '../../../src/core'
import type { Page } from '@playwright/test'
import { test, expect, openView } from '../support/fixtures'
import '../support/audio-tap'

/*
 * The arrangement loop on the real worklet (round 12b): a one-bar brace over an unlooped audio region, played for three
 * passes. Each pass after the first is the bar again, sample for sample, after the 5 ms tail of the jump; the bar is
 * what an offline engine renders from the same commands. 240 BPM, so a bar is one second: whole samples at any rate.
 */

const ID = 'f'.repeat(64)
const BAR_BEATS = 4
const TAIL_SECONDS = 0.01

declare global {
  interface Window {
    __loopSamples: number[]
  }
}

/** A sample that tells every frame apart: a sweep, never zero at the start. */
const sweep = (frames: number) => Float32Array.from({ length: frames }, (_, i) => 0.05 + 0.3 * Math.cos((2 * Math.PI * i * (1 + i / frames)) / 97.3))

const region: ArrangementClip = {
  id: 'r-loop', trackId: 'looped', startBeat: 0,
  content: { id: 'c-loop', name: 'Sweep', sampleId: ID, lengthBeats: BAR_BEATS, loop: false, warp: 'repitch', gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0 },
}

/** What the live engine and the offline one get; the sample is added after, as raw audio. */
const setupCommands: EngineCommand[] = [
  { type: 'master/setFx', graph: createDefaultMasterGraph() },
  { type: 'master/setVolume', volume: 1 },
  { type: 'transport/setTempo', bpm: 240 },
  { type: 'track/add', kind: 'audio', trackId: 'looped', fx: createDefaultFxGraph(), clips: [], volume: 1 },
  { type: 'arrangement/set', clips: [region] },
  { type: 'arrangement/setLoop', loop: { from: 0, to: BAR_BEATS } },
]

/** The bar as an offline engine renders it, from the same commands. */
const offlineBar = (rate: number): Float32Array => {
  const engine = new Engine(rate)
  for (const command of setupCommands) engine.apply(command)
  engine.apply({ type: 'sample/add', sample: { id: ID, sampleRate: rate, channels: [sweep(rate)] } })
  engine.apply({ type: 'arrangement/play', fromBeat: 0 })
  const left = new Float32Array(rate)
  engine.render(left, new Float32Array(rate))
  return left
}

/** Copies the worklet's left channel on the render thread, and gives raw commands once the host's queue has drained. */
const installCapture = (page: Page) => page.addInitScript(() => {
  const Original = window.AudioWorkletNode
  window.AudioWorkletNode = class extends Original {
    constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
      super(context, name, options)
      // As `installAudioTap` does.
      this.port.addEventListener('message', ({ data }) => {
        if (data.kind === 'status' && context.state === 'running') window.__sendEngineCommand = (command) => this.port.postMessage({ kind: 'command', command })
      })
      this.port.start()
      window.__loopSamples = []
      const url = URL.createObjectURL(new Blob([`
        class LoopCapture extends AudioWorkletProcessor {
          process(inputs) {
            const left = inputs[0]?.[0];
            if (left) this.port.postMessage(left.slice());
            return true;
          }
        }
        registerProcessor('loop-capture', LoopCapture);
      `], { type: 'text/javascript' }))
      void context.audioWorklet.addModule(url).then(() => {
        const tap = new Original(context, 'loop-capture'), mute = context.createGain()
        mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
        tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          if (window.__loopSamples.length < 1_000_000) window.__loopSamples.push(...data)
        }
      }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
    }
  }
})

/** The starter, with the engine given the sweep on a track of its own, at 240 BPM, through a neutral master. */
const prepare = async (page: Page, commands: readonly EngineCommand[]): Promise<number> => {
  await installCapture(page)
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await page.waitForFunction(() => !!window.__sendEngineCommand)
  const rate = await page.evaluate(() => new AudioContext().sampleRate)
  await page.evaluate((commands) => { for (const command of commands) window.__sendEngineCommand(command) }, commands)
  await page.evaluate(({ id, rate }) => {
    const channel = Float32Array.from({ length: rate }, (_, i) => 0.05 + 0.3 * Math.cos((2 * Math.PI * i * (1 + i / rate)) / 97.3))
    window.__sendEngineCommand({ type: 'sample/add', sample: { id, sampleRate: rate, channels: [channel] } })
  }, { id: ID, rate })
  await page.waitForTimeout(1000) // The starter's release tails.
  return rate
}

/** Three passes from the first sound on: each matches the offline bar, after the jump's tail. */
const expectPasses = async (page: Page, rate: number) => {
  await expect.poll(() => page.evaluate(() => {
    const samples = window.__loopSamples, first = samples.findIndex((value) => Math.abs(value) > 1e-7)
    return first < 0 ? 0 : samples.length - first
  }), { timeout: 15000 }).toBeGreaterThanOrEqual(3 * rate)
  const live = await page.evaluate(() => window.__loopSamples)
  const start = live.findIndex((value) => Math.abs(value) > 1e-7)
  const bar = offlineBar(rate)
  const tail = Math.round(TAIL_SECONDS * rate)
  for (let pass = 0; pass < 3; pass++) {
    let worst = 0, worstFrame = 0
    for (let i = pass === 0 ? 0 : tail; i < rate; i++) {
      const error = Math.abs(live[start + pass * rate + i]! - bar[i]!)
      if (error > worst) { worst = error; worstFrame = i }
    }
    expect(worst, `pass ${pass + 1} matches the offline bar: worst frame ${worstFrame}`).toBeLessThan(0.00002)
  }
}

test('the arrangement loop repeats a bar on the worklet, each pass the offline bar after the jump\u2019s tail', async ({ page }) => {
  const rate = await prepare(page, setupCommands)
  await page.evaluate(() => { window.__loopSamples = []; window.__sendEngineCommand({ type: 'arrangement/play', fromBeat: 0 }) })
  await expectPasses(page, rate)
  await page.evaluate(() => window.__sendEngineCommand({ type: 'arrangement/stop' }))
})

test('the same loop drawn, turned on and played from the arrangement view', async ({ page }) => {
  // The engine gets the sweep's region; the view draws the brace over bar 1, turns it on and plays from the start.
  const rate = await prepare(page, setupCommands.filter((command) => command.type !== 'arrangement/setLoop'))
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByLabel('Grid').selectOption('bar')
  const lane = (await arrangement.getByTestId('arrangement-marks').boundingBox())!
  await page.mouse.move(lane.x + 3, lane.y + 10)
  await page.mouse.down()
  await page.mouse.move(lane.x + 4 * 24 - 3, lane.y + 10, { steps: 6 })
  await page.mouse.up()
  await arrangement.getByRole('button', { name: '\u27f3 Loop', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-loop-brace')).toHaveAttribute('data-enabled', 'true')
  await page.evaluate(() => { window.__loopSamples = [] })
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expectPasses(page, rate)
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()
})
