import { test, expect, openView, viewRoot } from './fixtures'
import type { Page } from '@playwright/test'

/** A short mono 16-bit WAV of a sine at the given frequency, so each file decodes to a distinct sample. */
const wav = (frequency: number): Buffer => {
  const rate = 8000
  const frames = 800
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 12000), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

test('✎ on a sample opens it in the Wave editor beside the Samples list, and Close empties the editor', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)

  await samples.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave).toBeVisible()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  // The Samples view keeps showing its list.
  await expect(samples.getByRole('listitem')).toHaveCount(5)

  await wave.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(wave.getByText('No sample is open.', { exact: true })).toBeVisible()
  await expect(wave.getByTestId('sample-editor')).toHaveCount(0)

  // The empty state offers the project's samples.
  await wave.getByRole('button', { name: 'Demo Kick', exact: true }).click()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
})

test("the Wave editor's empty state imports samples, offers eight of them and then the full list", async ({ page }) => {
  await page.goto('/?starter')
  const wave = await openView(page, 'Wave editor')
  await expect(wave.getByText('No sample is open.', { exact: true })).toBeVisible()
  await expect(wave.getByRole('button', { name: 'Show samples', exact: true })).toHaveCount(0)

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    wave.getByRole('button', { name: 'Import samples…', exact: true }).click(),
  ])
  await chooser.setFiles(Array.from({ length: 9 }, (_, i) => ({ name: `Tone ${i + 1}.wav`, mimeType: 'audio/wav', buffer: wav(220 + i * 110) })))
  await expect(wave.getByRole('button', { name: /^Tone \d$/ })).toHaveCount(8)

  await wave.getByRole('button', { name: 'Show samples', exact: true }).click()
  const samples = viewRoot(page, 'Samples')
  await expect(samples).toBeVisible()
  await expect(samples.getByRole('listitem')).toHaveCount(9)
})

/** A 4 s stereo 16-bit WAV at 48 kHz: a decaying 220 Hz tone on the left, a 330 Hz one on the right. */
const stereoWav = (): Buffer => {
  const rate = 48000
  const frames = rate * 4
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    const decay = Math.exp(-((i % rate) / rate) * 3)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * decay * 16000), i * 4)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * decay * 8000), i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** Drags across the detail view from `from` to `to` (fractions of its width), at `y` (a fraction of its height). */
const dragAcross = async (page: Page, detail: ReturnType<Page['locator']>, from: number, to: number, y = 0.5) => {
  const box = (await detail.boundingBox())!
  await page.mouse.move(box.x + box.width * from, box.y + box.height * y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * ((from + to) / 2), box.y + box.height * y, { steps: 4 })
  await page.mouse.move(box.x + box.width * to, box.y + box.height * y, { steps: 4 })
  await page.mouse.up()
}

test('a stereo sample opens with a lane per channel, zooms to single samples, selects, plays and keeps its view', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Stereo 98 BPM.wav', mimeType: 'audio/wav', buffer: stereoWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Stereo 98 BPM' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()

  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByRole('img', { name: 'Left', exact: true })).toBeVisible()
  await expect(wave.getByRole('img', { name: 'Right', exact: true })).toBeVisible()
  const detail = wave.getByTestId('wave-detail')
  const status = wave.getByTestId('wave-status')
  await expect(detail).toHaveAttribute('data-draw', 'peaks')
  await expect(wave.getByRole('scrollbar', { name: 'Waveform position' })).toBeVisible()

  // A drag in the top quarter of the left lane selects the left channel only; in the middle, both.
  await dragAcross(page, detail, 0.3, 0.4, 0.05)
  await expect(status).toContainText('left only')
  await dragAcross(page, detail, 0.3, 0.5)
  await expect(status).toContainText('Selection 0:01.')
  await expect(status).not.toContainText('only')
  const selected = await status.textContent()

  // ⌘/Ctrl with the wheel zooms around the pointer, from the pyramid to the audio to single samples.
  const box = (await detail.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.keyboard.down('Control')
  for (const band of ['frames', 'points']) {
    await expect(async () => {
      await page.mouse.wheel(0, -400)
      await expect(detail).toHaveAttribute('data-draw', band, { timeout: 200 })
    }).toPass()
  }
  await page.keyboard.up('Control')
  await wave.getByRole('button', { name: 'Zoom to fit', exact: true }).click()
  await expect(detail).toHaveAttribute('data-draw', 'peaks')

  // The ruler counts beats, at the project's tempo or the one in the sample's name.
  await wave.getByRole('button', { name: 'Time', exact: true }).click()
  await expect(wave.locator('[data-ruler]')).toHaveAttribute('data-ruler', 'beats')
  await wave.getByRole('button', { name: /^Project \d+ BPM$/ }).click()
  await expect(wave.getByRole('button', { name: 'Sample 98 BPM', exact: true })).toBeVisible()
  await wave.getByRole('button', { name: 'Beats', exact: true }).click()
  await expect(wave.locator('[data-ruler]')).toHaveAttribute('data-ruler', 'time')

  // ▶ plays the selection, looping, with a playhead that moves.
  await wave.getByRole('button', { name: 'Loop', exact: true }).click()
  await wave.getByRole('button', { name: 'Play selection', exact: true }).click()
  const playhead = wave.getByTestId('wave-playhead')
  await expect(playhead).toBeVisible()
  const first = await playhead.evaluate((element) => (element as HTMLElement).style.left)
  await expect.poll(() => playhead.evaluate((element) => (element as HTMLElement).style.left)).not.toBe(first)
  await wave.getByRole('button', { name: 'Stop preview', exact: true }).click()
  await expect(playhead).toHaveCount(0)

  // Another tab and back: the selection is still there.
  await openView(page, 'Session')
  await openView(page, 'Wave editor')
  await expect(status).toHaveText(selected!)
})
