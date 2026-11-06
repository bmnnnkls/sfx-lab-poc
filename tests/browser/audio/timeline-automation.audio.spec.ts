import {
  Engine,
  type AutomationLane,
  type ControlTarget,
  type EngineCommand,
  type Project,
  compileTimelineAutomation,
  createAudioTrack,
  createDefaultFxGraph,
  createDefaultGroupGraph,
  createDefaultMasterGraph,
  createEmptyProject,
  setGroupBus,
  setTimelineLanes,
} from '../../../src/core'
import type { Page } from '@playwright/test'
import { test, expect } from '../support/fixtures'

/*
 * Timeline automation on the real worklet (round 12c): an audio region in group G, G's bus fader ramping on its
 * timeline lane and the master's fader stepping down on its own, played once through the arrangement. The capture
 * matches an offline engine given the same commands. 240 BPM, so the four beats are one second.
 */

const ID = 'e'.repeat(64)
const BEATS = 4

declare global {
  interface Window {
    __timelineSamples: number[]
  }
}

const volume = (owner: ControlTarget['owner']): ControlTarget => ({ kind: 'mixer', owner, control: 'volume' })
const lane = (target: ControlTarget, points: readonly [number, number, 'linear' | 'hold'][]): AutomationLane => ({
  id: `lane-${target.owner.kind}`,
  target,
  enabled: true,
  points: points.map(([beat, value, interpolation], i) => ({ id: `p${i}`, beat, value, interpolation })),
})

/** The project the lanes are compiled against: the track in G, G with a bus, and the master. */
const project = (): Project => {
  const empty = createEmptyProject()
  let result: Project = { ...empty, tempo: 240, groups: [{ id: 'G', name: 'G', colour: 'red' }], tracks: [{ ...createAudioTrack('Swept', 1), id: 'swept', groupId: 'G' }] }
  result = setGroupBus(result, 'G', true)
  result = setTimelineLanes(result, { kind: 'group', groupId: 'G' }, [lane(volume({ kind: 'group', groupId: 'G' }), [[0, 0.2, 'linear'], [BEATS, 0.9, 'linear']])])
  return setTimelineLanes(result, { kind: 'master' }, [lane(volume({ kind: 'master' }), [[0, 1, 'hold'], [2, 0.5, 'hold']])])
}

const setupCommands = (): EngineCommand[] => [
  { type: 'master/setFx', graph: createDefaultMasterGraph() },
  { type: 'master/setVolume', volume: 1 },
  { type: 'transport/setTempo', bpm: 240 },
  { type: 'track/add', kind: 'group', trackId: 'G', fx: createDefaultGroupGraph(), volume: 1 },
  { type: 'track/add', kind: 'audio', trackId: 'swept', fx: createDefaultFxGraph(), clips: [], volume: 1, output: 'G' },
  {
    type: 'arrangement/set',
    clips: [{ id: 'r', trackId: 'swept', startBeat: 0, content: { id: 'c', name: 'Sweep', sampleId: ID, lengthBeats: BEATS, loop: false, warp: 'repitch', gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0 } }],
  },
  { type: 'arrangement/setLoop', loop: null },
  { type: 'automation/configure', tracks: [], timeline: compileTimelineAutomation(project()) },
]

const sweep = (frames: number) => Float32Array.from({ length: frames }, (_, i) => 0.05 + 0.3 * Math.cos((2 * Math.PI * i * (1 + i / frames)) / 97.3))

const offline = (rate: number): Float32Array => {
  const engine = new Engine(rate)
  for (const command of setupCommands()) engine.apply(command)
  engine.apply({ type: 'sample/add', sample: { id: ID, sampleRate: rate, channels: [sweep(rate)] } })
  engine.apply({ type: 'arrangement/play', fromBeat: 0 })
  const left = new Float32Array(rate)
  for (let i = 0; i < rate; i += 128) {
    const block = new Float32Array(Math.min(128, rate - i))
    engine.render(block, new Float32Array(block.length))
    left.set(block, i)
  }
  return left
}

/** Copies the worklet's left channel on the render thread, as the arrangement loop's spec does. */
const installCapture = (page: Page) => page.addInitScript(() => {
  const Original = window.AudioWorkletNode
  window.AudioWorkletNode = class extends Original {
    constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
      super(context, name, options)
      this.port.addEventListener('message', ({ data }) => {
        if (data.kind === 'status' && context.state === 'running') window.__sendEngineCommand = (command) => this.port.postMessage({ kind: 'command', command })
      })
      this.port.start()
      window.__timelineSamples = []
      const url = URL.createObjectURL(new Blob([`
        class TimelineCapture extends AudioWorkletProcessor {
          process(inputs) {
            const left = inputs[0]?.[0];
            if (left) this.port.postMessage(left.slice());
            return true;
          }
        }
        registerProcessor('timeline-capture', TimelineCapture);
      `], { type: 'text/javascript' }))
      void context.audioWorklet.addModule(url).then(() => {
        const tap = new Original(context, 'timeline-capture'), mute = context.createGain()
        mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
        tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          if (window.__timelineSamples.length < 1_000_000) window.__timelineSamples.push(...data)
        }
      }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
    }
  }
})

test('a group bus fader lane and a master lane on the timeline play on the worklet as offline', async ({ page }) => {
  await installCapture(page)
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await page.waitForFunction(() => !!window.__sendEngineCommand)
  const rate = await page.evaluate(() => new AudioContext().sampleRate)
  await page.evaluate((commands) => { for (const command of commands) window.__sendEngineCommand(command) }, setupCommands())
  await page.evaluate(({ id, rate }) => {
    const channel = Float32Array.from({ length: rate }, (_, i) => 0.05 + 0.3 * Math.cos((2 * Math.PI * i * (1 + i / rate)) / 97.3))
    window.__sendEngineCommand({ type: 'sample/add', sample: { id, sampleRate: rate, channels: [channel] } })
  }, { id: ID, rate })
  await page.waitForTimeout(1000) // The starter's release tails.
  await page.evaluate(() => { window.__timelineSamples = []; window.__sendEngineCommand({ type: 'arrangement/play', fromBeat: 0 }) })
  await expect.poll(() => page.evaluate(() => {
    const samples = window.__timelineSamples, first = samples.findIndex((value) => Math.abs(value) > 1e-7)
    return first < 0 ? 0 : samples.length - first
  }), { timeout: 15000 }).toBeGreaterThanOrEqual(rate)
  await page.evaluate(() => window.__sendEngineCommand({ type: 'arrangement/stop' }))
  const live = await page.evaluate(() => window.__timelineSamples)
  const start = live.findIndex((value) => Math.abs(value) > 1e-7)
  const expected = offline(rate)
  let worst = 0, worstFrame = 0
  for (let i = 0; i < rate; i++) {
    const error = Math.abs(live[start + i]! - expected[i]!)
    if (error > worst) { worst = error; worstFrame = i }
  }
  expect(worst, `the capture matches the offline render: worst frame ${worstFrame}`).toBeLessThan(0.00002)
  // The lanes are heard: the master's step at beat 2 halves the level against the ramp's rise.
  const level = (from: number, to: number) => Math.max(...expected.subarray(from, to).map(Math.abs))
  expect(level(rate / 2 - rate / 8, rate / 2)).toBeGreaterThan(level(rate / 2, rate / 2 + rate / 8))
})
