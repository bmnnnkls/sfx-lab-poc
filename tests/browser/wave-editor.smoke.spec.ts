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

test('an edit in place survives a reload, and the clip that played the sample plays the edited one', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  const kick = samples.getByRole('listitem').filter({ hasText: 'Demo Kick' })
  await kick.getByRole('button', { name: 'New audio track', exact: true }).click()
  await kick.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  await wave.getByRole('button', { name: 'Reverse', exact: true }).click()

  type Saved = { samples: Array<{ id: string; name: string; origin?: string }>; tracks: Array<{ kind: string; clips: Array<{ sampleId?: string } | null> }> }
  const saved = () => page.evaluate(() => (JSON.parse(localStorage.getItem('sfxlab:project') ?? '{"project":{"samples":[],"tracks":[]}}') as { project: Saved }).project)
  const edited = async () => (await saved()).samples.find((sample) => sample.name === 'Demo Kick' && sample.origin)
  await expect.poll(edited).toBeTruthy()
  const { id } = (await edited())!

  await page.reload()
  const after = await openView(page, 'Samples')
  // The edited file was stored before the project named it, so every sample loads.
  await expect(after.locator('[data-status="ready"]')).toHaveCount(5)
  const project = await saved()
  expect(project.samples.filter((sample) => sample.name === 'Demo Kick').map((sample) => sample.id)).toEqual([id])
  const clips = project.tracks.filter((track) => track.kind === 'audio').flatMap((track) => track.clips).filter((clip) => clip !== null)
  expect(clips.map((clip) => clip.sampleId)).toEqual([id])
})

/** The selection's start and end in seconds, from the editor's status line. */
const selectionOf = async (wave: ReturnType<Page['locator']>) => {
  const text = (await wave.getByTestId('wave-status').textContent()) ?? ''
  const match = /^Selection (\d+):(\d+\.\d+) – (\d+):(\d+\.\d+)/.exec(text)
  if (!match) throw new Error(`No selection in "${text}"`)
  return { from: Number(match[1]) * 60 + Number(match[2]), to: Number(match[3]) * 60 + Number(match[4]) }
}

test('a session clip, its region and a sampler open their sample in the Wave editor, at the part they play', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  await samples.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: 'New audio track', exact: true }).click()
  await samples.getByRole('listitem').filter({ hasText: 'Demo Snare' }).getByRole('button', { name: 'New sampler track', exact: true }).click()

  // The clip, trimmed to start about halfway, opens its sample with the trim selected.
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Edit Demo Kick', exact: true }).click()
  const clip = viewRoot(page, 'Clip')
  const handle = clip.getByTestId('trim-start')
  const waveform = (await clip.getByTestId('audio-waveform').boundingBox())!
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(waveform.x + waveform.width / 2, grip.y + grip.height / 2, { steps: 4 })
  await page.mouse.up()
  const start = Number(await handle.getAttribute('aria-valuenow')) / 100
  expect(start).toBeGreaterThan(0.3)
  await clip.getByRole('button', { name: 'Edit sample', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  await expect(wave.getByTestId('wave-status')).toContainText('Selection')
  const fromClip = await selectionOf(wave)
  expect(fromClip.from / fromClip.to).toBeCloseTo(start, 1)
  await wave.getByRole('button', { name: 'Close', exact: true }).click()

  // A region is a copy of the clip, trim and all; its menu opens the same part.
  await (await openView(page, 'Session')).getByRole('button', { name: '▶ Demo Kick', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Place on arrangement' }).click()
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByTestId('arrangement-region').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit sample' }).click()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  await expect(wave.getByTestId('wave-status')).toContainText('Selection')
  expect(await selectionOf(wave)).toEqual(fromClip)

  // The sampler's Edit opens the sample it plays.
  await (await openView(page, 'Session')).getByRole('button', { name: 'Demo Snare', exact: true }).click()
  const instrument = await openView(page, 'Instrument')
  await instrument.locator('[data-node]', { hasText: 'Sampler' }).locator('[data-header]').dblclick()
  await instrument.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Snare')
})
