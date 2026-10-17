import { renderProject, serializeProject } from '../../src/core'
import { test, expect } from './fixtures'
import { sweepProject } from './automation-project'

declare global { interface Window { __sweepSamples: number[] } }
test('the real worklet filter sweep matches offline scene and clip WAV sample timing across wraps', async ({ page }) => {
  const project = sweepProject()
  const offline = renderProject(project, [], { scope: { kind: 'clip', trackId: 'sweep', clipId: 'sweep-clip' }, bars: 1, maxTail: 0 })
  const scene = renderProject(project, [], { scope: { kind: 'scene', scene: 0 }, bars: 1, maxTail: 0 })
  expect(scene.left).toEqual(offline.left)
  await page.addInitScript((saved) => localStorage.setItem('sfxlab:project', saved), serializeProject(project))
  await page.addInitScript(() => {
    const Original = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Original {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        window.__sweepSamples = []
        const tap = context.createScriptProcessor(1024, 2, 1), mute = context.createGain()
        mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
        tap.onaudioprocess = ({ inputBuffer }) => { if (window.__sweepSamples.length < 180000) window.__sweepSamples.push(...inputBuffer.getChannelData(0)) }
      }
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__sweepSamples?.length ?? 0), { timeout: 10000 }).toBeGreaterThan(110000)
  const live = await page.evaluate(() => window.__sweepSamples)
  const firstLive = live.findIndex((v) => Math.abs(v) > 1e-7), firstOffline = offline.left.findIndex((v) => Math.abs(v) > 1e-7)
  expect(firstLive).toBeGreaterThanOrEqual(0); expect(firstOffline).toBeGreaterThanOrEqual(0)
  let worst = 0
  for (let i = 0; i < offline.left.length - firstOffline; i++) worst = Math.max(worst, Math.abs(live[firstLive + i]! - offline.left[firstOffline + i]!))
  expect(worst, 'two loops of real output match deterministic offline samples').toBeLessThan(0.00002)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})
