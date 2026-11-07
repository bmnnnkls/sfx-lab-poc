import type { Locator, Page } from '@playwright/test'
import { test, expect, openView } from '../support/fixtures'

/*
 * The arrangement's mark lane (round 12b): markers added, dragged, renamed and undone; a loop brace drawn, resized and
 * turned on, with playback going round it; a brace over a region; regions snapping to a marker. 24 px a beat.
 */

const PX = 24

/** Runs a lane menu's *Add clip* ▸ entry for a clip, from the menu just opened. */
const addClip = async (page: Page, name: string) => {
  await page.getByRole('menuitem', { name: 'Add clip', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

/** Presses at `from` (x in the element's box), moves by `dx`, and lets go. */
const dragIn = async (page: Page, element: Locator, from: { x: number; y: number }, dx: number, alt = false) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('nothing to drag')
  await page.mouse.move(box.x + from.x, box.y + from.y)
  if (alt) await page.keyboard.down('Alt')
  await page.mouse.down()
  await page.mouse.move(box.x + from.x + dx, box.y + from.y, { steps: 8 })
  await page.mouse.up()
  if (alt) await page.keyboard.up('Alt')
}

const setPosition = async (arrangement: Locator, beat: number) => {
  await arrangement.getByTestId('arrangement-ruler').click({ position: { x: beat * PX + 2, y: 10 } })
  await expect(arrangement.getByTestId('arrangement-position')).toHaveAttribute('data-beat', String(beat))
}

test('markers are added from the toolbar, drag onto a bar in one undo step, and rename in place', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByLabel('Grid').selectOption('bar')
  const markers = arrangement.getByTestId('arrangement-marker')
  const add = arrangement.getByRole('button', { name: '+ Marker', exact: true })

  await setPosition(arrangement, 0)
  await add.click()
  await setPosition(arrangement, 16)
  await add.click()
  await expect(markers).toHaveCount(2)
  await expect(arrangement.getByRole('button', { name: 'Marker 1', exact: true })).toHaveAttribute('data-beat', '0')
  await expect(arrangement.getByRole('button', { name: 'Marker 2', exact: true })).toHaveAttribute('data-beat', '16')

  // A bar and a bit to the right lands on bar 2; undo puts it back in one step.
  const first = markers.first()
  await dragIn(page, first, { x: 4, y: 10 }, 4 * PX + 10)
  await expect(first).toHaveAttribute('data-beat', '4')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(first).toHaveAttribute('data-beat', '0')

  // A click on a marker puts the position there.
  await arrangement.getByRole('button', { name: 'Marker 2', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-position')).toHaveAttribute('data-beat', '16')

  // A double-click renames it in place.
  await first.dblclick()
  const field = arrangement.getByLabel('Name of marker Marker 1', { exact: true })
  await expect(field).toBeFocused()
  await field.fill('Verse')
  await field.press('Enter')
  await expect(arrangement.getByRole('button', { name: 'Marker Verse', exact: true })).toBeVisible()
})

test('a brace drawn in the mark lane resizes by its end, loops on ⟳ Loop, and playback goes round it', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByLabel('Grid').selectOption('beat')
  const loopButton = arrangement.getByRole('button', { name: 'Loop', exact: true })
  await expect(loopButton).toBeDisabled()

  // Drawn from beat 2 to 4, then its end dragged to 6.
  const lane = arrangement.getByTestId('arrangement-marks')
  await dragIn(page, lane, { x: 2 * PX + 3, y: 10 }, 2 * PX)
  const brace = arrangement.getByTestId('arrangement-loop-brace')
  const span = () => brace.evaluate((element) => [parseFloat((element as HTMLElement).style.left), parseFloat((element as HTMLElement).style.width)])
  await expect.poll(span).toEqual([2 * PX, 2 * PX])
  await dragIn(page, arrangement.getByTestId('arrangement-loop-to'), { x: 3, y: 10 }, 2 * PX)
  await expect.poll(span).toEqual([2 * PX, 4 * PX])
  await expect(brace).not.toHaveAttribute('data-enabled')

  await loopButton.click()
  await expect(loopButton).toHaveAttribute('aria-pressed', 'true')
  await expect(brace).toHaveAttribute('data-enabled', 'true')

  // From before the brace, playback runs past its start, reaches its end and goes back to its start.
  await setPosition(arrangement, 0)
  const playhead = arrangement.getByTestId('arrangement-playhead')
  const beat = () => playhead.evaluate((element) => parseFloat((element as HTMLElement).style.left) / 24)
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect.poll(beat, { timeout: 10_000 }).toBeGreaterThan(5)
  await expect.poll(beat, { timeout: 10_000 }).toBeLessThan(4)
  expect(await beat()).toBeGreaterThanOrEqual(2)
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()

  // Undo takes the resize back, but not the toggle.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(span).toEqual([2 * PX, 2 * PX])
  await expect(loopButton).toHaveAttribute('aria-pressed', 'true')
})

test('Set loop to region puts the brace over it, and a region dragged near a marker snaps to it', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  const lane = arrangement.locator('[data-lane]').first()
  await arrangement.getByLabel('Grid').selectOption('bar')
  await lane.click({ button: 'right', position: { x: 4 * PX + 2, y: 20 } })
  await addClip(page, 'Root')
  const region = arrangement.getByTestId('arrangement-region')
  await region.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Set loop to region', exact: true }).click()
  const brace = arrangement.getByTestId('arrangement-loop-brace')
  const regionBox = (await region.boundingBox())!
  const braceBox = (await brace.boundingBox())!
  expect(braceBox.x).toBeCloseTo(regionBox.x, 0)
  expect(braceBox.width).toBeCloseTo(regionBox.width, 0)

  // With the grid off, a marker off the grid at 10.5 pulls the region's start from a few pixels away.
  await arrangement.getByLabel('Grid').selectOption('off')
  await arrangement.getByTestId('arrangement-ruler').click({ position: { x: 10.5 * PX, y: 10 } })
  await arrangement.getByRole('button', { name: '+ Marker', exact: true }).click()
  const left = () => region.evaluate((element) => parseFloat((element as HTMLElement).style.left))
  await dragIn(page, region, { x: 10, y: 20 }, 10.5 * PX - (await left()) + 4)
  expect(await left()).toBeCloseTo(10.5 * PX, 5)
})

test('M adds a marker at the position, ] and [ step between marks, L turns the loop on, and the palette adds a marker', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByLabel('Grid').selectOption('bar')
  const timeline = arrangement.getByLabel('Timeline', { exact: true })
  const position = arrangement.getByTestId('arrangement-position')
  const markers = arrangement.getByTestId('arrangement-marker')

  // A press in the mark lane's empty space gives the timeline the keys; M adds at the position, twice.
  await arrangement.getByTestId('arrangement-marks').click({ position: { x: 4 * PX + 2, y: 10 } })
  await expect(timeline).toBeFocused()
  await expect(position).toHaveAttribute('data-beat', '4')
  await page.keyboard.press('m')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('m')
  await expect(markers).toHaveCount(2)
  await expect(markers.nth(1)).toHaveAttribute('data-beat', '12')

  // [ and ] step between them, and stop at the first and the last.
  await page.keyboard.press('[')
  await expect(position).toHaveAttribute('data-beat', '4')
  await page.keyboard.press('[')
  await expect(position).toHaveAttribute('data-beat', '4')
  await page.keyboard.press(']')
  await expect(position).toHaveAttribute('data-beat', '12')

  // L does nothing without a brace; with one, it turns ⟳ Loop on and off.
  const loop = arrangement.getByRole('button', { name: 'Loop', exact: true })
  await page.keyboard.press('l')
  await expect(loop).toBeDisabled()
  await markers.first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Loop to next marker', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-loop-brace')).toBeVisible()
  // The closing menu gives the focus back to the marker first.
  await expect(markers.first()).toBeFocused()
  await timeline.focus()
  await expect(timeline).toBeFocused()
  await page.keyboard.press('l')
  await expect(loop).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('l')
  await expect(loop).toHaveAttribute('aria-pressed', 'false')

  // With the timeline focused at the start, the palette offers the timeline's own actions there.
  await page.keyboard.press('Home')
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Commands', exact: true })
  await page.keyboard.type('add marker')
  await expect(palette.getByRole('option').first()).toHaveText('Timeline at 1.1: Add marker here')
  await page.keyboard.press('Enter')
  await expect(markers).toHaveCount(3)
  await expect(markers.first()).toHaveAttribute('data-beat', '0')
})
