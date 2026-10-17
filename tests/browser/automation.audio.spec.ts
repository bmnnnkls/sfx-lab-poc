import { renderProject, serializeProject } from '../../src/core'
import { test, expect } from './fixtures'
import { slotSweepProject, sweepProject } from './automation-project'

declare global { interface Window { __sweepSamples: number[] } }
for (const slots of [false, true]) test(`the real worklet ${slots ? 'return/master slots' : 'clip filter sweep'} matches offline sample timing across wraps`, async ({ page }) => {
  const project = slots ? slotSweepProject() : sweepProject()
  const offline = renderProject(project, [], { scope: { kind: 'clip', trackId: 'sweep', clipId: 'sweep-clip' }, bars: slots ? 2 : 1, maxTail: 0 })
  const scene = renderProject(project, [], { scope: { kind: 'scene', scene: 0 }, bars: slots ? 2 : 1, maxTail: 0 })
  if (slots) expect(scene.left).not.toEqual(offline.left)
  else expect(scene.left).toEqual(offline.left)
  const expected = slots ? scene : offline
  await page.addInitScript((saved) => localStorage.setItem('sfxlab:project', saved), serializeProject(project))
  await page.addInitScript(() => {
    const Original = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Original {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        window.__sweepSamples = []
        // Copy on the render thread: ScriptProcessor can lose startup/underflow buffers.
        const url = URL.createObjectURL(new Blob([`
          class SweepCapture extends AudioWorkletProcessor {
            process(inputs) {
              const left = inputs[0]?.[0];
              if (left) this.port.postMessage(left.slice());
              return true;
            }
          }
          registerProcessor('sweep-capture', SweepCapture);
        `], { type: 'text/javascript' }))
        void context.audioWorklet.addModule(url).then(() => {
          const tap = new Original(context, 'sweep-capture'), mute = context.createGain()
          mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
          tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
            if (window.__sweepSamples.length < 400000) window.__sweepSamples.push(...data)
          }
        }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
      }
    }
  })
  await page.goto('/')
  // Prime the render-thread capture with silence before any sound starts.
  // Wait for the capture node to be connected before sending a launch command.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__sweepSamples?.length ?? 0)).toBeGreaterThan(4096)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  const firstOffline = expected.left.findIndex((v) => Math.abs(v) > 1e-7)
  await expect.poll(() => page.evaluate(() => {
    const samples = window.__sweepSamples, first = samples.findIndex((v) => Math.abs(v) > 1e-7)
    return first < 0 ? 0 : samples.length - first
  }), { timeout: 15000 }).toBeGreaterThanOrEqual(expected.left.length - firstOffline)
  const live = await page.evaluate(() => window.__sweepSamples)
  const firstLive = live.findIndex((v) => Math.abs(v) > 1e-7)
  expect(firstLive).toBeGreaterThan(0); expect(firstOffline).toBeGreaterThanOrEqual(0)
  expect(live.length - firstLive).toBeGreaterThanOrEqual(expected.left.length - firstOffline)
  expect(live.every(Number.isFinite), 'captured samples are finite').toBe(true)
  let worst = 0, worstFrame = 0
  for (let i = 0; i < expected.left.length - firstOffline; i++) { const error = Math.abs(live[firstLive + i]! - expected.left[firstOffline + i]!); if (error > worst) { worst = error; worstFrame = i } }
  expect(worst, `real output matches offline: live start ${firstLive}, offline start ${firstOffline}, worst frame ${worstFrame}`).toBeLessThan(0.00002)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})
