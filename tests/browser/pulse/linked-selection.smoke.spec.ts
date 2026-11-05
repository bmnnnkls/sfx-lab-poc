import type { Locator, Page } from '@playwright/test'
import { test, expect, openView, viewRoot } from '../support/fixtures'

/** Places the starter's Bass clip Root on the Bass lane at bar 3 from the lane's menu, and returns the region. */
const placeRoot = async (page: Page, arrangement: Locator) => {
  await arrangement.locator('[data-lane]').first().click({ button: 'right', position: { x: 8 * 24 + 1, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add clip', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Root', exact: true }).click()
  const region = arrangement.getByTestId('arrangement-region')
  await expect(region).toHaveCount(1)
  return region
}

/** The notes the piano roll in Clip shows. */
const notesIn = (clip: Locator) => clip.locator('[data-note-id]')

/** Draws a note on empty space near the top of the roll, below the ruler. */
const drawNote = async (page: Page, clip: Locator) => {
  const box = (await clip.getByTestId('note-surface').locator('xpath=ancestor::*[@data-scroll][1]').boundingBox())!
  await page.mouse.move(box.x + 140, box.y + 60)
  await page.mouse.down()
  await page.mouse.move(box.x + 190, box.y + 60, { steps: 4 })
  await page.mouse.up()
}

test("clicking a region shows its own copy in Clip, and a note added there changes the region and not its session source", async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  const region = await placeRoot(page, arrangement)
  const clip = await openView(page, 'Clip')
  await region.click()
  await expect(clip.getByText('Bass / Root · arrangement, bar 3', { exact: true })).toBeVisible()
  // A region has the automation toggle too (round 12c), showing its notes first.
  await expect(clip.getByRole('group', { name: 'Clip view' }).getByRole('button', { name: 'Notes / waveform', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const notes = await notesIn(clip).count()
  const marks = await region.locator('span').count()
  await drawNote(page, clip)
  await expect(notesIn(clip)).toHaveCount(notes + 1)
  await expect(region.locator('span')).toHaveCount(marks + 1)

  // The session clip still has its own notes.
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Edit Root', exact: true }).click()
  await expect(clip.getByText('Bass / Root', { exact: true })).toBeVisible()
  await expect(notesIn(clip)).toHaveCount(notes)
})

test('double-clicking a region, or Enter on it, opens it in Clip in place of Mixer', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  const region = await placeRoot(page, arrangement)
  const clip = viewRoot(page, 'Clip')
  await openView(page, 'Mixer')
  // A click selects without showing anything.
  await region.click()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
  await region.dblclick()
  await expect(clip).toBeVisible()
  await expect(clip.getByText('Bass / Root · arrangement, bar 3', { exact: true })).toBeVisible()

  await openView(page, 'Mixer')
  await region.focus()
  await page.keyboard.press('Enter')
  await expect(clip).toBeVisible()
  await expect(viewRoot(page, 'Mixer')).toBeHidden()
})

test("clicking a lane's name selects its track: it is marked, Instrument shows it, and the session header is marked too", async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  const instrument = viewRoot(page, 'Instrument')
  const name = arrangement.locator('[tabindex="0"]', { hasText: /^Lead$/ })
  await expect(name).not.toHaveAttribute('aria-current')
  await name.click()
  await expect(name).toHaveAttribute('aria-current', 'true')
  await expect(arrangement.locator('[aria-current]')).toHaveCount(1)
  await expect(instrument.getByText('Lead', { exact: true })).toBeVisible()
  const session = await openView(page, 'Session')
  await expect(session.locator('[class*="_header_"]', { hasText: 'Lead' })).toHaveClass(/_selected_/)
})

test('deleting the selected region empties Clip, and selecting a session clip deselects the region', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  let region = await placeRoot(page, arrangement)
  const clip = await openView(page, 'Clip')
  await region.click()
  await expect(clip.getByText('Bass / Root · arrangement, bar 3', { exact: true })).toBeVisible()
  await region.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await expect(region).toHaveCount(0)
  await expect(clip.getByText('No clip of “Bass” is selected.', { exact: true })).toBeVisible()

  region = await placeRoot(page, arrangement)
  await region.click()
  await expect(region).toHaveClass(/_selected_/)
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Edit Walk', exact: true }).click()
  await expect(clip.getByText('Bass / Walk', { exact: true })).toBeVisible()
  await openView(page, 'Arrangement')
  await expect(region).not.toHaveClass(/_selected_/)
})
