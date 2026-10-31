import type { Locator, Page } from '@playwright/test'
import { expect, openView, viewRoot } from './fixtures'

/* A 4 s stereo test file opened in the Wave editor, and pointer helpers for its lanes: shared by the wave specs. */

export const RATE = 48000
export const FRAMES = 4 * RATE

/** A 4 s stereo 16-bit WAV at 48 kHz: a 220 Hz tone on the left, 330 Hz on the right. */
export const stereoWav = (): Buffer => {
  const data = Buffer.alloc(FRAMES * 4)
  for (let i = 0; i < FRAMES; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * 16000), i * 4)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / RATE) * 8000), i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

export interface SavedMarks {
  durationSeconds: number
  markers?: Array<{ frame: number; name: string }>
  regions?: Array<{ from: number; to: number; name: string }>
  loop?: { from: number; to: number }
}

/** Imports the test file and opens it; returns the editor's parts and what is saved of the sample. */
export const openMarked = async (page: Page) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Marked.wav', mimeType: 'audio/wav', buffer: stereoWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Marked' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByRole('img', { name: 'Left', exact: true })).toBeVisible()
  const saved = () =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('sfxlab:project') ?? '{"project":{"samples":[]}}') as { project: { samples: Array<{ name: string } & SavedMarks> } }).project.samples.find((sample) => sample.name === 'Marked'))
  await expect.poll(async () => (await saved())?.durationSeconds).toBe(4)
  return { wave, detail: wave.getByTestId('wave-detail'), lane: wave.getByTestId('mark-lane'), status: wave.getByTestId('wave-status'), saved }
}

/** A point on an element, at fractions of its width and height. */
export const at = async (element: Locator, x: number, y = 0.5) => {
  const box = (await element.boundingBox())!
  return { x: box.x + box.width * x, y: box.y + box.height * y }
}

/** Drags on an element from `from` to `to` (fractions of its width), in steps. */
export const drag = async (page: Page, element: Locator, from: number, to: number, y = 0.5) => {
  const start = await at(element, from, y)
  const end = await at(element, to, y)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + end.x) / 2, start.y, { steps: 4 })
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up()
}
