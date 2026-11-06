import type { Page } from '@playwright/test'
import { type InstrumentTrack, type Project, createArrangementClip, createClip, createNote, parseProject, renderProject, serializeProject, setGroupBus, timelineLanesOf } from '../../../src/core'
import { test, expect, expectSaved, openView } from '../support/fixtures'
import { sweepProject } from '../support/automation-project'

/*
 * Touch into the arrangement on the real worklet (round 12d): a fader held while the arrangement plays records a
 * timeline lane; after a reload the arrangement plays it as an offline bounce of the saved project does. 240 BPM, so
 * four beats are a second. One case is a group bus's fader; the other a track's fader held over two loop passes.
 */

declare global { interface Window { __touchSamples: number[] } }

const BEATS = 8

/** The sweep's track in group G (a bus), one region of a note held for eight beats; the loop brace on the first four. */
const project = (loop: boolean): Project => {
  const base = sweepProject(), track = base.tracks[0] as InstrumentTrack
  const content = { ...createClip('Held', BEATS, [createNote(60, 0, BEATS, 1)]), id: 'held' }
  return setGroupBus({
    ...base,
    tempo: 240,
    groups: [{ id: 'G', name: 'Group 1', colour: 'red' }],
    tracks: [{ ...track, groupId: 'G', volume: 0.5 }],
    arrangement: [{ ...createArrangementClip('sweep', 0, content), id: 'region' }],
    ...(loop && { arrangementLoop: { from: 0, to: 4, enabled: true } }),
  }, 'G', true)
}

/** Copies the worklet's left channel on the render thread, as the automation spec does. */
const installCapture = (page: Page) => page.addInitScript(() => {
  const Original = window.AudioWorkletNode
  window.AudioWorkletNode = class extends Original {
    constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
      super(context, name, options)
      window.__touchSamples = []
      const url = URL.createObjectURL(new Blob([`
        class TouchCapture extends AudioWorkletProcessor {
          process(inputs) {
            const left = inputs[0]?.[0];
            if (left) this.port.postMessage(left.slice());
            return true;
          }
        }
        registerProcessor('touch-capture', TouchCapture);
      `], { type: 'text/javascript' }))
      void context.audioWorklet.addModule(url).then(() => {
        const tap = new Original(context, 'touch-capture'), mute = context.createGain()
        mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
        tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          if (window.__touchSamples.length < 1_000_000) window.__touchSamples.push(...data)
        }
      }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
    }
  }
})

/** Starts the context with ▶ and ■, so the capture is connected and primed with silence before a sound. */
const prime = async (page: Page) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__touchSamples?.length ?? 0)).toBeGreaterThan(4096)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
}

for (const loop of [false, true]) test(loop ? "a track's fader touched over two loop passes plays back as offline" : "a bus's fader touched while the arrangement plays plays back after a reload as offline", async ({ page }) => {
  const initial = project(loop)
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(initial))
  await installCapture(page)
  await page.goto('/')
  await prime(page)

  await page.getByRole('button', { name: 'Arm Touch automation', exact: true }).click()
  const arrangement = await openView(page, 'Arrangement')
  const mixer = await openView(page, 'Mixer')
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect(mixer.getByText('Touch unavailable: no active destination', { exact: true })).toHaveCount(0)
  await page.waitForTimeout(300)
  const fader = mixer.getByRole('slider', { name: loop ? 'Sweep fader' : 'Group 1 fader', exact: true })
  const box = (await fader.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5); await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8, { steps: 10 })
  await page.waitForTimeout(loop ? 600 : 300)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3, { steps: 10 })
  await page.waitForTimeout(loop ? 900 : 300)
  await page.mouse.up()
  await expect(page.getByText(/^Touch take saved to the timeline/)).toBeVisible()
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()
  await expectSaved(page)

  const parsed = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
  if (!parsed.ok) throw new Error(parsed.error)
  const owner = loop ? { kind: 'track' as const, trackId: 'sweep' } : { kind: 'group' as const, groupId: 'G' }
  const lane = timelineLanesOf(parsed.project, owner)[0]!
  expect(lane.points.length).toBeGreaterThan(2)
  if (loop) {
    // Over two passes the take covers the whole brace and nothing past it: no guard before it, the base held from
    // the guard just after its end.
    expect(lane.points[0]!.beat).toBe(0)
    expect(Math.max(...lane.points.map((p) => p.beat))).toBeCloseTo(4, 5)
  }
  const bars = loop ? 1 : 2
  const expected = renderProject(parsed.project, [], { scope: { kind: 'arrangement' }, bars, maxTail: 0 }).left
  const untouched = renderProject(initial, [], { scope: { kind: 'arrangement' }, bars, maxTail: 0 }).left
  expect(Math.max(...expected.map((v, i) => Math.abs(v - untouched[i]!))), 'the take changes the level').toBeGreaterThan(0.01)

  // A fresh engine plays the saved take from the start of the timeline.
  await page.reload()
  await prime(page)
  await page.evaluate(() => { window.__touchSamples = [] })
  const view = await openView(page, 'Arrangement')
  await view.getByRole('button', { name: 'Stop', exact: true }).click()
  await view.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  const firstOffline = expected.findIndex((v) => Math.abs(v) > 1e-7)
  await expect.poll(() => page.evaluate(() => {
    const samples = window.__touchSamples, first = samples.findIndex((v) => Math.abs(v) > 1e-7)
    return first < 0 ? 0 : samples.length - first
  }), { timeout: 15000 }).toBeGreaterThanOrEqual(expected.length - firstOffline)
  await view.getByRole('button', { name: 'Stop', exact: true }).click()
  const live = await page.evaluate(() => window.__touchSamples)
  const firstLive = live.findIndex((v) => Math.abs(v) > 1e-7)
  expect(firstLive).toBeGreaterThanOrEqual(0); expect(firstOffline).toBeGreaterThanOrEqual(0)
  expect(live.every(Number.isFinite), 'captured samples are finite').toBe(true)
  let worst = 0, worstFrame = 0
  for (let i = 0; i < expected.length - firstOffline; i++) {
    const error = Math.abs(live[firstLive + i]! - expected[firstOffline + i]!)
    if (error > worst) { worst = error; worstFrame = i }
  }
  expect(worst, `real output matches offline: live start ${firstLive}, offline start ${firstOffline}, worst frame ${worstFrame}`).toBeLessThan(0.00002)
})
