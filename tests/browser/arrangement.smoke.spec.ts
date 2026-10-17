import { test, expect } from './fixtures'

test('the arrangement view places clips on the timeline and plays them', async ({ page }) => {
  await page.goto('/?starter')
  // The starter's Bass track has clips in the session grid; place one on the timeline.
  await page.getByRole('button', { name: 'Arrangement view', exact: true }).click()
  await expect(page.getByTestId('arrangement-view')).toBeVisible()

  const lane = page.locator('[data-lane]').first()
  await lane.click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add Root', exact: true }).click()
  await expect(page.getByTestId('arrangement-region')).toHaveCount(1)

  // Playback follows the timeline: the placed clip sounds through the worklet.
  await page.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect.poll(async () => Number(await page.locator('[data-peak]').first().getAttribute('data-peak')),
    { message: 'the arrangement plays through the AudioWorklet', timeout: 10_000 }).toBeGreaterThan(0.02)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  // Moving a region is one undoable step.
  const region = page.getByTestId('arrangement-region')
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
  await page.getByRole('button', { name: 'Session view', exact: true }).click()
  await page.getByRole('button', { name: 'Arrangement view', exact: true }).click()
  await expect(page.getByTestId('arrangement-region')).toHaveCount(1)
})

test('the sample editor derives a reversed copy without touching the original', async ({ page }) => {
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'Samples', exact: true }).click()
  await page.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5)
  await expect(page.getByRole('listitem')).toHaveCount(5)

  await page.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: '✎', exact: true }).click()
  await expect(page.getByTestId('sample-editor')).toBeVisible()
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
