import type { Locator } from '@playwright/test'
import { test, expect, openView } from './fixtures'

/** The regions of one lane: the lane body is a sibling of the regions, both children of the lane row. */
const regionsInLane = (view: Locator, index: number) =>
  view.locator('[data-lane]').nth(index).locator('xpath=..').getByTestId('arrangement-region')

test('the arrangement view places clips on the timeline and plays them', async ({ page }) => {
  await page.goto('/?starter')
  // The starter's Bass track has clips in the session grid; place one on the timeline.
  const arrangement = await openView(page, 'Arrangement')
  await expect(arrangement.getByTestId('arrangement-view')).toBeVisible()

  const lane = arrangement.locator('[data-lane]').first()
  await lane.click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add Root', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-region')).toHaveCount(1)

  // Playback follows the timeline: the placed clip sounds through the worklet.
  await page.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect.poll(async () => Number(await page.locator('[data-peak]').first().getAttribute('data-peak')),
    { message: 'the arrangement plays through the AudioWorklet', timeout: 10_000 }).toBeGreaterThan(0.02)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  // Moving a region is one undoable step.
  const region = arrangement.getByTestId('arrangement-region')
  const before = await region.boundingBox()
  if (!before) throw new Error('the placed region has no bounds')
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 96, before.y + before.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const restored = await region.boundingBox()
  expect(Math.round(restored!.x)).toBe(Math.round(before.x))

  // The arrangement is part of the project: switching views and back keeps it.
  await openView(page, 'Session')
  await expect((await openView(page, 'Arrangement')).getByTestId('arrangement-region')).toHaveCount(1)
})

test('looping regions repeat until the next region, and regions move across tracks', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  await expect(arrangement.getByTestId('arrangement-view')).toBeVisible()

  // Two regions on the first track, 16 beats apart.
  const lane = arrangement.locator('[data-lane]').first()
  await lane.click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add Root', exact: true }).click()
  await lane.click({ button: 'right', position: { x: 120 + 16 * 24, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add Root', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-region')).toHaveCount(2)

  // Loop the first: it shows the repeat badge and the span up to the next region.
  await arrangement.getByTestId('arrangement-region').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Loop until next region' }).click()
  await expect(arrangement.getByTestId('arrangement-region').first()).toHaveAttribute('data-looping', 'true')
  await expect(arrangement.getByTestId('arrangement-loop-tail')).toHaveCount(1)

  // Playback: the loop keeps the first region sounding well past its own four-beat end.
  const peak = async () => Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))
  await page.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect.poll(peak, { message: 'the arrangement plays through the AudioWorklet', timeout: 10_000 }).toBeGreaterThan(0.02)
  // At 110 BPM the region's own end is ~4.9 s in; three more seconds it is still looping.
  await page.waitForTimeout(3_000)
  await expect.poll(peak, { message: 'the loop keeps sounding past the region end', timeout: 5_000 }).toBeGreaterThan(0.02)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  // Dragging the first region onto the next lane moves it across tracks.
  const region = arrangement.getByTestId('arrangement-region').first()
  const box = await region.boundingBox()
  if (!box) throw new Error('the region has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 56, { steps: 6 })
  await page.mouse.up()
  // The dragged region is now on the second track's lane; the other one stayed.
  await expect(regionsInLane(arrangement, 1)).toHaveCount(1)
  await expect(regionsInLane(arrangement, 0)).toHaveCount(1)
})

test('a session slot places its clip on the arrangement', async ({ page }) => {
  await page.goto('/?starter')
  await page.getByRole('button', { name: '▶ Root', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Place on arrangement' }).click()
  const arrangement = await openView(page, 'Arrangement')
  // The copy landed on the Bass track's lane at the start of its timeline.
  await expect(regionsInLane(arrangement, 0)).toHaveCount(1)
  // Undo removes it again.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-region')).toHaveCount(0)
})

test('the arrangement bounces to a WAV', async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  const lane = arrangement.locator('[data-lane]').first()
  await lane.click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add Root', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-region')).toHaveCount(1)

  await page.getByText('File', { exact: true }).click()
  await page.getByRole('button', { name: 'Export audio (WAV)…', exact: true }).click()
  // The timeline has something on it, so the Arrangement scope is offered and defaults to its length
  // (the placed region spans beats 5 to 9: 2.25 bars).
  const scope = page.getByRole('radio', { name: 'Arrangement', exact: true })
  await expect(scope).toBeEnabled()
  await scope.check()
  await expect(page.getByLabel('Bars')).toHaveValue('2.25')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.wav$/)
})

test('the sample editor derives a reversed copy without touching the original', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await page.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  await expect(page.getByRole('listitem')).toHaveCount(5)

  await page.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: '✎', exact: true }).click()
  await expect(samples.getByTestId('sample-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Reverse', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  // The derived copy joins the library; the original is still there, untouched.
  await expect(page.getByRole('listitem')).toHaveCount(6)
  await expect(page.getByRole('listitem').filter({ hasText: 'Demo Kick (reversed)' })).toHaveCount(1)
  // Undo removes the derived copy from the project (the original stays).
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect(page.getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('listitem').filter({ hasText: 'Demo Kick' })).toHaveCount(1)
})
