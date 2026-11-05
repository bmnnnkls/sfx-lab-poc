import type { Locator, Page } from '@playwright/test'
import { test, expect, openView, viewRoot } from '../support/fixtures'
import { at, drag } from '../support/marked-sample'

/*
 * The Wave editor's spectrogram (round 11d): the lane modes in *View ▾*, the spectrogram filling in from the worker, its
 * settings in ⚙, and it following edits and the second pane; a box drawn in it, and the spectral edits on the box.
 */
test.use({ viewport: { width: 1400, height: 1000 } })

const RATE = 48000
const FRAMES = 2 * RATE

/** A 2 s mono 16-bit WAV at 48 kHz: a 1 kHz tone in the first second, near silence in the second. */
const toneWav = (): Buffer => {
  const data = Buffer.alloc(FRAMES * 2)
  for (let i = 0; i < FRAMES; i++) data.writeInt16LE(i < RATE ? Math.round(Math.sin((2 * Math.PI * 1000 * i) / RATE) * 16000) : 0, i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const openTone = async (page: Page) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Tone.wav', mimeType: 'audio/wav', buffer: toneWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Tone' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByRole('img', { name: 'Waveform', exact: true })).toBeVisible()
  return { wave, detail: wave.getByTestId('wave-detail').first() }
}

/** The spectrogram is drawn, from the pyramid or the view's own columns: not `pending`. A 2 s sample in a wide lane is under a hop a pixel. */
const DRAWN = /^(levels|stretched|on-demand)$/

const lanes = async (page: Page, wave: Locator, mode: 'Waveform' | 'Spectrogram' | 'Split') => {
  await wave.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: mode, exact: true }).click()
}

/** Where `hz` is on the log scale, as a part of the lane's height from the top. */
const logY = (hz: number) => 1 - Math.log(hz / 20) / Math.log(RATE / 2 / 20)

/** The brightness (r + g + b) of the lane's canvas at fractions of its width and height. */
const brightness = (lane: Locator, x: number, y: number) =>
  lane.evaluate(
    (canvas: HTMLCanvasElement, [fx, fy]) => {
      const [r, g, b] = canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * fx!), Math.floor(canvas.height * fy!), 1, 1).data
      return r! + g! + b!
    },
    [x, y],
  )

test('the spectrogram fills in from the worker, shows the tone at its frequency, and keeps the mode and settings after a reload', async ({ page }) => {
  const { wave, detail } = await openTone(page)
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await lanes(page, wave, 'Spectrogram')
  const lane = wave.getByRole('img', { name: 'Spectrogram', exact: true })
  await expect(lane).toBeVisible()
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)
  await expect(detail).not.toHaveAttribute('data-draw', /./)
  expect(workers.some((url) => url.includes('spectrum'))).toBe(true)
  // The tone is bright at 1 kHz in the first second, and not at 8 kHz; in the second second neither is.
  await expect.poll(() => brightness(lane, 0.25, logY(1000))).toBeGreaterThan(300)
  expect(await brightness(lane, 0.25, logY(8000))).toBeLessThan(150)
  expect(await brightness(lane, 0.75, logY(1000))).toBeLessThan(150)

  // The tone's 2 s in a wide lane is under the hop a pixel: the view gets its own columns, and again after a zoom.
  await expect(detail).toHaveAttribute('data-spectrum', 'on-demand')
  const box = (await detail.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -300)
  await page.keyboard.up('Control')
  await expect(detail).toHaveAttribute('data-spectrum', 'on-demand')
  await expect.poll(() => brightness(lane, 0.25, logY(1000))).toBeGreaterThan(300)

  // Split: the waveform over the spectrogram.
  await lanes(page, wave, 'Split')
  await expect(detail).toHaveAttribute('data-draw', /peaks|frames/)
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)

  // ⚙: a new FFT size computes it again; the linear scale and the floor are kept.
  await wave.getByRole('button', { name: 'Editor settings', exact: true }).click()
  const settings = wave.getByRole('dialog', { name: 'Editor settings' })
  await settings.getByLabel('FFT size', { exact: true }).selectOption('4096')
  await settings.getByRole('radio', { name: 'Linear', exact: true }).check()
  await settings.getByLabel('Spectrogram floor', { exact: true }).fill('-80')
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => [localStorage.getItem('sfxlab:wave-lanes'), localStorage.getItem('sfxlab:wave-spectrum')])).toEqual([
    '"split"',
    '{"scale":"linear","fftSize":4096,"floorDb":-80}',
  ])

  // After a reload, the sample opened again draws the split lanes at once.
  await page.reload()
  const after = viewRoot(page, 'Wave editor')
  await after.getByRole('button', { name: 'Tone', exact: true }).click()
  await expect(after.getByTestId('wave-detail').first()).toHaveAttribute('data-spectrum', DRAWN)
  await expect(after.getByTestId('wave-detail').first()).toHaveAttribute('data-draw', /peaks|frames/)
})

test('the spectrogram follows a delete and its undo, and the second pane shows another sample’s own', async ({ page }) => {
  const { wave, detail } = await openTone(page)
  await lanes(page, wave, 'Spectrogram')
  const lane = wave.getByRole('img', { name: 'Spectrogram', exact: true })
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)
  // Delete the first half: the tone goes from the left of the lane.
  await drag(page, detail, 0.001, 0.5)
  await page.keyboard.press('Delete')
  // The length is left, less the pixel the drag starts in (about 2 ms). Anchored: the selection's readout before the
  // delete renders ("Selection 0:00.002 – 0:01.000 (…)") holds the same time, and matching it raced the delete.
  await expect(wave.getByText(/^0:01\.00\d$/).first()).toBeAttached()
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)
  await expect.poll(() => brightness(lane, 0.25, logY(1000))).toBeLessThan(150)
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(() => brightness(lane, 0.25, logY(1000))).toBeGreaterThan(300)

  // Another sample in the second pane draws its own spectrogram.
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.getByRole('listitem').filter({ hasText: 'Demo Kick' }).locator('[data-status="ready"]')).toHaveCount(1)
  const editor = await openView(page, 'Wave editor')
  await editor.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Second pane', exact: true }).click()
  const second = editor.getByTestId('wave-pane-second')
  await second.getByRole('button', { name: /pane's sample:/ }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Demo Kick', exact: true }).click()
  await expect(second.getByRole('button', { name: "Second pane's sample: Demo Kick", exact: true })).toBeVisible()
  await expect(second.getByTestId('wave-detail')).toHaveAttribute('data-spectrum', DRAWN)
  await expect(editor.getByTestId('wave-pane-main').getByTestId('wave-detail')).toHaveAttribute('data-spectrum', DRAWN)
})

/** Drags on an element from one point to another, each as fractions of its width and height, in steps. */
const dragBetween = async (page: Page, element: Locator, from: [number, number], to: [number, number]) => {
  const start = await at(element, ...from)
  const end = await at(element, ...to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 })
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up()
}

/** The selected band in Hz, from the detail's `data-band`; null without one. */
const bandOf = async (detail: Locator) => {
  const band = await detail.getAttribute('data-band')
  return band ? band.split('-').map(Number) : null
}

test('a drag in the spectrogram selects a box: only the spectral edits run on it, its corner drags, and Escape drops its band', async ({ page }) => {
  const { wave, detail } = await openTone(page)
  await lanes(page, wave, 'Spectrogram')
  const lane = wave.getByRole('img', { name: 'Spectrogram', exact: true })
  const status = wave.getByTestId('wave-status')
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)

  await dragBetween(page, lane, [0.1, logY(2000)], [0.4, logY(500)])
  await expect.poll(() => bandOf(detail)).not.toBeNull()
  const [low, high] = (await bandOf(detail))!
  expect(low).toBeGreaterThan(450)
  expect(low).toBeLessThan(550)
  expect(high).toBeGreaterThan(1800)
  expect(high).toBeLessThan(2200)
  await expect(status).toContainText(/\(0:00\.\d{3}\) · \d+ Hz – \d\.\d kHz$/)
  const cut = wave.getByRole('button', { name: 'Cut', exact: true })
  await expect(cut).toBeDisabled()
  await expect(cut).toHaveAttribute('title', /needs a selection without a frequency band\. Press Escape or click the waveform\./)
  await expect(wave.getByRole('button', { name: 'Copy', exact: true })).toHaveAttribute('title', 'Copies the whole time range: the clipboard has no band')

  // The top-left corner moves the start and the band's top; the end and the bottom stay.
  const before = await status.textContent()
  await dragBetween(page, lane, [0.1, logY(2000)], [0.05, logY(4000)])
  await expect.poll(async () => (await bandOf(detail))![1]).toBeGreaterThan(3600)
  expect((await bandOf(detail))![0]).toBe(low)
  expect(await status.textContent()).not.toBe(before)

  // Escape drops the band and keeps the time range: Cut runs again.
  await detail.focus()
  await page.keyboard.press('Escape')
  await expect(detail).not.toHaveAttribute('data-band', /./)
  await expect(status).toContainText('Selection')
  await expect(status).not.toContainText('Hz')
  await expect(cut).toBeEnabled()

  // In Split, a drag in the waveform part selects time only; one in the spectrogram part, a box.
  await lanes(page, wave, 'Split')
  const split = wave.getByRole('img', { name: 'Waveform', exact: true })
  await drag(page, split, 0.5, 0.8, 0.15)
  await expect(status).toContainText('Selection')
  await expect(detail).not.toHaveAttribute('data-band', /./)
  await dragBetween(page, split, [0.2, 0.5], [0.4, 0.8])
  await expect(detail).toHaveAttribute('data-band', /^\d+-\d+$/)
})

test('band gain removes the box’s band in its range, undo brings it back, and keep band removes what is outside it', async ({ page }) => {
  const { wave, detail } = await openTone(page)
  await lanes(page, wave, 'Spectrogram')
  const lane = wave.getByRole('img', { name: 'Spectrogram', exact: true })
  await expect(detail).toHaveAttribute('data-spectrum', DRAWN)
  await expect.poll(() => brightness(lane, 0.25, logY(1000))).toBeGreaterThan(300)

  // A box over the tone's row in the first quarter of the sample.
  await dragBetween(page, lane, [0.05, logY(2000)], [0.3, logY(500)])
  await expect(detail).toHaveAttribute('data-band', /^\d+-\d+$/)
  await wave.getByRole('button', { name: 'Process', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Band gain…', exact: true }).click()
  const settings = wave.getByRole('dialog', { name: 'Band gain' })
  await settings.getByRole('checkbox', { name: 'Remove' }).check()
  await expect(settings.getByLabel('Gain', { exact: true })).toBeDisabled()
  await settings.getByRole('button', { name: 'Apply', exact: true }).click()

  // The row goes dark in the range and stays bright after it; the box is still selected.
  await expect.poll(() => brightness(lane, 0.2, logY(1000))).toBeLessThan(150)
  expect(await brightness(lane, 0.4, logY(1000))).toBeGreaterThan(300)
  await expect(detail).toHaveAttribute('data-band', /^\d+-\d+$/)

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => brightness(lane, 0.2, logY(1000))).toBeGreaterThan(300)

  // Keep band on a box above the tone: the tone goes in the range.
  await detail.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await dragBetween(page, lane, [0.05, logY(16_000)], [0.3, logY(4000)])
  await expect(detail).toHaveAttribute('data-band', /^\d+-\d+$/)
  await wave.getByRole('button', { name: 'Process', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Keep band', exact: true }).click()
  await expect.poll(() => brightness(lane, 0.2, logY(1000))).toBeLessThan(150)
  expect(await brightness(lane, 0.4, logY(1000))).toBeGreaterThan(300)
})
