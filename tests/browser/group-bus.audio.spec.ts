import type { Locator, Page } from '@playwright/test'
import { test, expect, expectSound, openView } from './fixtures'
import { installAudioTap, listen } from './audio-tap'

/*
 * Mute, solo and summing through group buses on the real worklet, with the starter's three tracks playing scene 1. A
 * track panned hard left and another hard right tell apart in one window who is heard: the left channel is one, the
 * right the other.
 */

const SILENT = 0.0001
const HEARD = 0.02

const tree = async (page: Page) => (await openView(page, 'Tracks')).getByRole('tree', { name: 'Tracks' })

/** Runs an entry of a row's menu in the Tracks view, or of its submenu. */
const fromMenu = async (page: Page, name: string, entry: string, choice?: string) => {
  await (await tree(page)).getByRole('treeitem', { name, exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: entry, exact: true }).click()
  if (choice) await page.getByRole('menuitem', { name: choice, exact: true }).click()
}

const mixerControl = async (page: Page, role: 'slider' | 'button', name: string): Promise<Locator> =>
  (await openView(page, 'Mixer')).getByRole(role, { name, exact: true })

const set = async (page: Page, slider: string, value: string) => (await mixerControl(page, 'slider', slider)).fill(value)
const press = async (page: Page, button: string) => (await mixerControl(page, 'button', button)).click()

/** What the output is now: after the commands in flight reach the worklet and its buffered audio drains. */
const now = async (page: Page) => {
  await page.waitForTimeout(300)
  return listen(page)
}

/** The starter, Bass hard left, Pad hard right, Lead muted, scene 1 playing. */
const start = async (page: Page) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  await press(page, 'Lead mute')
  await set(page, 'Bass pan', '-1')
  await set(page, 'Pad pan', '1')
}

const play = async (page: Page) => {
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  await expectSound(page)
}

/** Bass in Group 1, which sums to a bus. */
const bassInBus = async (page: Page) => {
  await fromMenu(page, 'Bass', 'Group')
  await fromMenu(page, 'Group 1, group of 1 track', 'Sum to a bus')
}

test('a bus at unity sums its member exactly as the master would', async ({ page }) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  for (const name of ['Lead', 'Pad']) await press(page, `${name} mute`)
  // Bass straight to the master on the left, a copy through a bus on the right: the channels match.
  await set(page, 'Bass pan', '-1')
  const mixer = await openView(page, 'Mixer')
  await mixer.getByRole('region', { name: 'Bass channel', exact: true }).getByRole('button', { name: 'Bass', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await set(page, 'Bass copy pan', '1')
  await fromMenu(page, 'Bass copy', 'Group')
  await fromMenu(page, 'Group 1, group of 1 track', 'Sum to a bus')
  await play(page)
  const heard = await now(page)
  expect(heard.peak[0]).toBeGreaterThan(HEARD)
  expect(heard.peak[1]).toBeGreaterThan(HEARD)
  expect(heard.diffPeak).toBeLessThan(SILENT)
})

test('the bus fader silences its members but not their sends, and a group mute silences both', async ({ page }) => {
  await start(page)
  await press(page, 'Pad mute')
  await page.getByRole('button', { name: 'Add track', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Return track', exact: true }).click()
  await bassInBus(page)
  await set(page, 'Bass send to Return A', '1')
  await play(page)
  // Bass is hard left; the return is centred, so the right channel is the reverb alone.
  const both = await now(page)
  expect(both.peak[0]).toBeGreaterThan(HEARD)
  expect(both.peak[1]).toBeGreaterThan(HEARD)
  await set(page, 'Group 1 fader', '0')
  const wet = await now(page)
  expect(wet.diffPeak, 'only the centred return is heard').toBeLessThan(SILENT)
  expect(wet.peak[1]).toBeGreaterThan(HEARD)
  await set(page, 'Group 1 fader', '1')
  await press(page, 'Group 1 mute')
  expect(Math.max(...(await now(page)).peak)).toBeLessThan(SILENT)
})

test('a soloed member is heard through its bus, and its bus fader still counts', async ({ page }) => {
  await start(page)
  await bassInBus(page)
  await play(page)
  await press(page, 'Bass solo')
  const solo = await now(page)
  expect(solo.peak[0]).toBeGreaterThan(HEARD)
  expect(solo.peak[1]).toBeLessThan(SILENT)
  await set(page, 'Group 1 fader', '0')
  expect(Math.max(...(await now(page)).peak)).toBeLessThan(SILENT)
})

test('a soloed group: its members are heard, the other tracks are not', async ({ page }) => {
  await start(page)
  await bassInBus(page)
  await play(page)
  await press(page, 'Group 1 solo')
  const solo = await now(page)
  expect(solo.peak[0]).toBeGreaterThan(HEARD)
  expect(solo.peak[1]).toBeLessThan(SILENT)
})

test('a nested bus at 0 silences only its own members', async ({ page }) => {
  await start(page)
  // Group 1 (a bus) holds Pad and Group 2 (a bus), which holds Bass.
  await fromMenu(page, 'Bass', 'Group')
  await fromMenu(page, 'Bass', 'Group')
  await fromMenu(page, 'Pad', 'Move to group', 'Group 1')
  await fromMenu(page, 'Group 1, group of 2 tracks', 'Sum to a bus')
  await fromMenu(page, 'Group 2, group of 1 track', 'Sum to a bus')
  await play(page)
  const both = await now(page)
  expect(both.peak[0]).toBeGreaterThan(HEARD)
  expect(both.peak[1]).toBeGreaterThan(HEARD)
  await set(page, 'Group 2 fader', '0')
  const inner = await now(page)
  expect(inner.peak[0]).toBeLessThan(SILENT)
  expect(inner.peak[1]).toBeGreaterThan(HEARD)
})

declare global {
  interface Window {
    __busSamples: number[]
  }
}

/** The left channel of a 32-bit float stereo WAV. */
const leftOfWav = (bytes: Buffer): Float32Array => {
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4)
    if (id === 'data') {
      const frames = size / 8, left = new Float32Array(frames)
      for (let i = 0; i < frames; i++) left[i] = bytes.readFloatLE(at + 8 + i * 8)
      return left
    }
    at += 8 + size + (size % 2)
  }
  throw new Error('No data chunk in the exported WAV')
}

test('the live output with buses matches the offline scene export', async ({ page }) => {
  // Copy the left channel on the render thread, as the automation spec does.
  await page.addInitScript(() => {
    const Original = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Original {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        window.__busSamples = []
        const url = URL.createObjectURL(new Blob([`
          class BusCapture extends AudioWorkletProcessor {
            process(inputs) {
              const left = inputs[0]?.[0];
              if (left) this.port.postMessage(left.slice());
              return true;
            }
          }
          registerProcessor('bus-capture', BusCapture);
        `], { type: 'text/javascript' }))
        void context.audioWorklet.addModule(url).then(() => {
          const tap = new Original(context, 'bus-capture'), mute = context.createGain()
          mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
          tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
            if (window.__busSamples.length < 400000) window.__busSamples.push(...data)
          }
        }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
      }
    }
  })
  await page.goto('/?starter')
  for (const name of ['Lead', 'Pad']) await press(page, `${name} mute`)
  // Bass through a nested bus at 0.5, panned, inside another bus at 0.8.
  await fromMenu(page, 'Bass', 'Group')
  await fromMenu(page, 'Bass', 'Group')
  await fromMenu(page, 'Group 1, group of 1 track', 'Sum to a bus')
  await fromMenu(page, 'Group 2, group of 1 track', 'Sum to a bus')
  await set(page, 'Group 2 fader', '0.5')
  await set(page, 'Group 2 pan', '-0.4')
  await set(page, 'Group 1 fader', '0.8')

  // The context's rate, so the export renders at the rate the worklet plays.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__busSamples?.length ?? 0)).toBeGreaterThan(4096)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  const rate = await page.evaluate(() => new AudioContext().sampleRate)
  await page.getByText('File', { exact: true }).click()
  await page.getByRole('button', { name: 'Export audio (WAV)…', exact: true }).click()
  await page.getByLabel('Tail (seconds)').fill('0')
  await page.getByLabel('Sample rate').selectOption(String(rate))
  await page.getByLabel('Bit depth').selectOption('32')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  const { readFile } = await import('node:fs/promises')
  const expected = leftOfWav(await readFile((await download.path())!))
  const firstOffline = expected.findIndex((value) => Math.abs(value) > 1e-7)
  expect(firstOffline).toBeGreaterThanOrEqual(0)

  await page.evaluate(() => { window.__busSamples = [] })
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const samples = window.__busSamples, first = samples.findIndex((value) => Math.abs(value) > 1e-7)
    return first < 0 ? 0 : samples.length - first
  }), { timeout: 15000 }).toBeGreaterThanOrEqual(expected.length - firstOffline)
  const live = await page.evaluate(() => window.__busSamples)
  const firstLive = live.findIndex((value) => Math.abs(value) > 1e-7)
  let worst = 0, worstFrame = 0
  for (let i = 0; i < expected.length - firstOffline; i++) {
    const error = Math.abs(live[firstLive + i]! - expected[firstOffline + i]!)
    if (error > worst) { worst = error; worstFrame = i }
  }
  expect(expected.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0), 'the export is audible').toBeGreaterThan(HEARD)
  expect(worst, `live matches the export: live start ${firstLive}, export start ${firstOffline}, worst frame ${worstFrame}`).toBeLessThan(0.00002)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})
