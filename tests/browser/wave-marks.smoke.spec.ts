import { test, expect, openView, viewRoot } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/*
 * Markers, regions and the loop in the Wave editor's mark lane (round 11c, part 2). Positions are read back from the
 * saved project, in frames of the 4 s, 48 kHz test file.
 */

const RATE = 48000
const FRAMES = 4 * RATE

/** A 4 s stereo 16-bit WAV at 48 kHz: a 220 Hz tone on the left, 330 Hz on the right. */
const stereoWav = (): Buffer => {
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

interface SavedMarks {
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

const near = (frame: number | undefined, fraction: number) => Math.abs((frame ?? -1) / FRAMES - fraction) < 0.01

test('a marker added from the menu shows in the mark lane, drags with one undo step, renames in place, and follows a delete', async ({ page }) => {
  const { detail, lane, saved } = await openMarked(page)
  const point = await at(detail, 0.3)
  await page.mouse.click(point.x, point.y)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Add marker', exact: true }).click()
  await expect(lane).toHaveAttribute('aria-label', 'Marks: 1 marker, 0 regions')
  await expect.poll(async () => near((await saved())?.markers?.[0]?.frame, 0.3)).toBe(true)

  await drag(page, lane, 0.3, 0.5)
  await expect.poll(async () => near((await saved())?.markers?.[0]?.frame, 0.5)).toBe(true)
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(async () => near((await saved())?.markers?.[0]?.frame, 0.3)).toBe(true)

  const flag = await at(lane, 0.3)
  await page.mouse.dblclick(flag.x, flag.y)
  const field = lane.getByRole('textbox', { name: 'Name of marker Marker 1', exact: true })
  await expect(field).toBeFocused()
  await field.fill('Downbeat')
  await field.press('Enter')
  await expect.poll(async () => (await saved())?.markers?.[0]?.name).toBe('Downbeat')

  // Deleting a stretch before it moves it left by that much.
  const before = (await saved())!.markers![0]!.frame
  await drag(page, detail, 0.05, 0.15)
  await detail.press('Delete')
  await expect.poll(async () => (await saved())?.durationSeconds).toBeLessThan(4)
  const removed = FRAMES - Math.round((await saved())!.durationSeconds * RATE)
  expect((await saved())!.markers![0]!.frame).toBe(before - removed)
})

test('a region made from the selection selects on a click and resizes by its edge; the loop plays from its menu', async ({ page }) => {
  const { detail, lane, status, saved } = await openMarked(page)
  await drag(page, detail, 0.6, 0.8)
  const inside = await at(detail, 0.7)
  await page.mouse.click(inside.x, inside.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Make region', exact: true }).click()
  await expect(lane).toHaveAttribute('aria-label', 'Marks: 0 markers, 1 region')
  await expect.poll(async () => (await saved())?.regions?.length).toBe(1)
  const region = (await saved())!.regions![0]!

  // A click elsewhere clears the selection; a click on the region selects it.
  const away = await at(detail, 0.2)
  await page.mouse.click(away.x, away.y)
  await expect(status).toHaveText(/^Cursor/)
  const band = await at(lane, 0.7)
  await page.mouse.click(band.x, band.y)
  await expect(status).toContainText('Selection')
  await expect(lane).toBeFocused()

  // Its right edge drags.
  await drag(page, lane, 0.8, 0.9)
  await expect.poll(async () => near((await saved())?.regions?.[0]?.to, 0.9)).toBe(true)
  expect((await saved())!.regions![0]!.from).toBe(region.from)

  // The loop, set from another selection, plays from its own menu.
  await drag(page, detail, 0.2, 0.3)
  const loopPoint = await at(detail, 0.25)
  await page.mouse.click(loopPoint.x, loopPoint.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Set loop', exact: true }).click()
  await expect(lane).toHaveAttribute('aria-label', 'Marks: 0 markers, 1 region, a loop')
  await expect.poll(async () => near((await saved())?.loop?.from, 0.2)).toBe(true)
  const loopBand = await at(lane, 0.25)
  await page.mouse.click(loopBand.x, loopBand.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Play loop', exact: true }).click()
  await expect(detail.getByTestId('wave-playhead')).toBeVisible()
  await page.mouse.click(loopBand.x, loopBand.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Stop', exact: true }).click()
  await expect(detail.getByTestId('wave-playhead')).toHaveCount(0)
})
