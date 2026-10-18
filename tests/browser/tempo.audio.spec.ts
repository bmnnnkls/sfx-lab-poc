import { createEmptyProject, noteGraphFrom, serializeProject, diffProject, Engine, type EngineCommand, type AudioClip } from '../../src/core'
import { test, expect } from './fixtures'

declare global {
  interface Window {
    __tempoCapture: {
      ready: boolean
      clocks: { frame: number; bpm: number; playing: boolean; beat: number }[]
      chunks: { frame: number; left: number[]; right: number[] }[]
      send(command: EngineCommand): void
    }
  }
}

for (const type of ['delay', 'pingPong']) test(`${type} real stereo output follows tempo edits with running tails and matches offline`, async ({ page }) => {
  const blank = { ...createEmptyProject(), tracks: [] }
  await page.addInitScript(saved => localStorage.setItem('sfxlab:project', saved), serializeProject(blank))
  await page.addInitScript(() => {
    const Original = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Original {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        const capture: Window['__tempoCapture'] = window.__tempoCapture = { ready: false, clocks: [] as Window['__tempoCapture']['clocks'], chunks: [] as Window['__tempoCapture']['chunks'], send: (command: EngineCommand) => this.port.postMessage({ kind: 'command', command }) }
        this.port.addEventListener('message', ({ data }) => {
          if (data.kind === 'status' && typeof data.audioTime === 'number') capture.clocks.push({ frame: Math.round(data.audioTime * context.sampleRate), bpm: data.status.tempo, playing: data.status.playing, beat: data.status.beat })
        })
        const url = URL.createObjectURL(new Blob([`
          class TempoCapture extends AudioWorkletProcessor {
            process(inputs) {
              const [left, right] = inputs[0] ?? [];
              if (left && right) this.port.postMessage({ frame: currentFrame, left: Array.from(left), right: Array.from(right) });
              return true;
            }
          }
          registerProcessor('tempo-capture', TempoCapture);
        `], { type: 'text/javascript' }))
        void context.audioWorklet.addModule(url).then(() => {
          const tap = new Original(context, 'tempo-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }), mute = context.createGain()
          mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
          tap.port.onmessage = ({ data }) => { if (capture.chunks.length < 4000) { capture.chunks.push(data); capture.ready = true } }
        }).catch(error => console.error(error)).finally(() => URL.revokeObjectURL(url))
      }
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__tempoCapture?.ready)).toBe(true)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await expect.poll(() => page.evaluate(() => window.__tempoCapture.clocks.at(-1)?.playing)).toBe(false)
  const data = new Float32Array(9600)
  data[0] = 0.4; data[2400] = 0.3; data[4800] = -0.2
  const clip: AudioClip = { id: 'impulse', name: 'Impulse', sampleId: 'impulse', lengthBeats: 16, loop: false, warp: 'off', gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0 }
  const fx = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'echo', type, params: { sync: 1, division: type === 'delay' ? 8 : 12, feedback: 0.7, mix: 0.7 } }, { id: 'out', type: 'trackOut' }], ['in.out>echo.in', 'echo.out>out.in'])
  const stereoFx = { ...fx, nodes: fx.nodes.map(n => n.id === 'echo' && type === 'delay' ? { ...n, stereo: true } : n) }
  const commands: EngineCommand[] = [
    { type: 'sample/add', sample: { id: 'impulse', sampleRate: 48000, data } },
    { type: 'track/add', kind: 'audio', trackId: 'tempo', fx: stereoFx, clips: [clip], volume: 1, pan: -0.25 },
  ]
  await page.evaluate(commands => {
    window.__tempoCapture.chunks = []; window.__tempoCapture.clocks = []
    for (const command of commands) window.__tempoCapture.send(command)
    window.__tempoCapture.send({ type: 'scene/launch', scene: 0 })
  }, commands)
  const elapsed = () => page.evaluate(() => {
    const c = window.__tempoCapture, first = c.clocks.find(c => c.playing && c.beat === 0)
    return first ? (c.chunks.at(-1)?.frame ?? first.frame) - first.frame : 0
  })
  await expect.poll(elapsed).toBeGreaterThan(26400)
  await page.evaluate(() => window.__tempoCapture.send({ type: 'transport/setTempo', bpm: 60 }))
  await expect.poll(elapsed).toBeGreaterThan(55200)
  await page.evaluate(() => window.__tempoCapture.send({ type: 'transport/setTempo', bpm: 240 }))
  await expect.poll(elapsed).toBeGreaterThan(144000)
  const capture = await page.evaluate(() => ({ clocks: window.__tempoCapture.clocks, chunks: window.__tempoCapture.chunks }))
  const start = capture.clocks.find(c => c.playing && c.beat === 0)!.frame
  const changes = [60, 240].map(bpm => ({ bpm, frame: capture.clocks.find(c => c.bpm === bpm)!.frame - start }))
  expect(changes[0]!.frame).toBeGreaterThan(26400)
  expect(changes[1]!.frame).toBeGreaterThan(changes[0]!.frame)
  expect(changes[1]!.frame, 'both edits occur inside the compared window with a full tail second afterwards').toBeLessThan(96000)
  const engine = new Engine(48000)
  for (const command of [...diffProject(null, blank), ...commands, { type: 'scene/launch', scene: 0 } as const]) engine.apply(command)
  const length = 144000, left = new Float32Array(length), right = new Float32Array(length)
  let frame = 0
  for (const change of [...changes, { frame: length, bpm: 240 }]) {
    engine.render(left.subarray(frame, change.frame), right.subarray(frame, change.frame))
    engine.apply({ type: 'transport/setTempo', bpm: change.bpm }); frame = change.frame
  }
  const actualL = new Float32Array(length), actualR = new Float32Array(length)
  let filled = 0
  for (const chunk of capture.chunks.filter(c => c.frame >= start && c.frame < start + length)) {
    expect(chunk.frame - start).toBe(filled)
    const n = Math.min(chunk.left.length, length - filled)
    actualL.set(chunk.left.slice(0, n), filled); actualR.set(chunk.right.slice(0, n), filled); filled += n
  }
  expect(filled).toBe(length)
  let worst = 0, tailPeak = 0, difference = 0
  for (let i = 0; i < length; i++) {
    worst = Math.max(worst, Math.abs(actualL[i]! - left[i]!), Math.abs(actualR[i]! - right[i]!))
    if (i > 60000) tailPeak = Math.max(tailPeak, Math.abs(actualL[i]!), Math.abs(actualR[i]!))
    difference = Math.max(difference, Math.abs(actualL[i]! - actualR[i]!))
  }
  expect(actualL.every(Number.isFinite) && actualR.every(Number.isFinite), 'the complete stereo capture is finite').toBe(true)
  expect(tailPeak).toBeGreaterThan(0.001)
  expect(difference).toBeGreaterThan(0.01)
  expect(worst).toBeLessThan(0.00002)
})
