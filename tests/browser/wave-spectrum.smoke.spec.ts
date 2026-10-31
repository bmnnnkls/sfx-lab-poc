import type { Locator, Page } from '@playwright/test'
import { test, expect, openView, viewRoot } from './fixtures'
import { drag } from './marked-sample'

/*
 * The Wave editor's spectrogram (round 11d, part 1): the lane modes in *View ▾*, the spectrogram filling in from the
 * worker, its settings in ⚙, and it following edits and the second pane.
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
  await expect(wave.getByText('0:01.000', { exact: false }).first()).toBeAttached()
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
