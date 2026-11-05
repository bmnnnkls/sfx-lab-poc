import { test, expect, openView, viewRoot } from '../support/fixtures'

test('graph navigation pans, zooms at the cursor and keeps node dragging in graph coordinates', async ({ page }) => {
  await page.goto('/?starter')
  await page.locator('[class*="_trackName_"]').filter({ hasText: 'Bass' }).first().click()
  const viewport = page.getByTestId('graph-viewport')
  const node = viewport.locator('[data-testid^="node-"]').first()
  const initial = (await node.boundingBox())!
  const bounds = (await viewport.boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2

  await page.getByRole('button', { name: 'Pan graph', exact: true }).click()
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 70, y + 40, { steps: 5 })
  await page.mouse.up()
  let panned = (await node.boundingBox())!
  expect(panned.x - initial.x).toBeCloseTo(70, 0)
  expect(panned.y - initial.y).toBeCloseTo(40, 0)
  await page.getByRole('button', { name: 'Pan graph', exact: true }).click()

  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 30)
  await expect.poll(async () => (await node.boundingBox())!.y).toBeCloseTo(panned.y - 30, 0)
  const scrolled = (await node.boundingBox())!
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(x + 10, y + 15, { steps: 3 })
  await page.mouse.up({ button: 'middle' })
  panned = (await node.boundingBox())!
  expect(panned.x - scrolled.x).toBeCloseTo(10, 0)
  expect(panned.y - scrolled.y).toBeCloseTo(15, 0)

  await page.mouse.move(panned.x + 20, panned.y + 10)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -50)
  await page.keyboard.up('Control')
  await expect(page.getByRole('button', { name: 'Reset graph view' })).toHaveText('165%')
  const zoomed = (await node.boundingBox())!
  const scale = zoomed.width / panned.width
  expect(zoomed.x + 20 * scale).toBeCloseTo(panned.x + 20, 0)
  expect(zoomed.y + 10 * scale).toBeCloseTo(panned.y + 10, 0)

  // Selection boxes must use canvas coordinates after both panning and zooming.
  await page.mouse.move(zoomed.x - 8, zoomed.y - 8)
  await page.mouse.down()
  await page.mouse.move(zoomed.x + zoomed.width + 8, zoomed.y + zoomed.height + 8, { steps: 5 })
  await page.mouse.up()
  await expect(node).toHaveAttribute('data-selected', 'true')

  const originalX = Number(await node.evaluate(el => (el as HTMLElement).style.left.replace('px', '')))
  const header = (await node.locator('[data-header]').boundingBox())!
  await page.mouse.move(header.x + 20, header.y + 10)
  await page.mouse.down()
  await page.mouse.move(header.x + 80, header.y + 40, { steps: 5 })
  await page.mouse.up()
  const movedX = Number(await node.evaluate(el => (el as HTMLElement).style.left.replace('px', '')))
  expect(movedX - originalX).toBeCloseTo(60 / scale, 0)

  await page.getByRole('button', { name: 'Reset graph view' }).click()
  await expect(page.getByRole('button', { name: 'Reset graph view' })).toHaveText('100%')
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reset graph view' })).toHaveText('83%')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reset graph view' })).toHaveText('100%')
})

test("switching tracks brings back each graph's zoom", async ({ page }) => {
  await page.goto('/?starter')
  const session = viewRoot(page, 'Session')
  const instrument = await openView(page, 'Instrument')
  const readout = instrument.getByRole('button', { name: 'Reset graph view', exact: true })
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  await expect(readout).toHaveText('100%')
  await instrument.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await instrument.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(readout).toHaveText('144%')
  await session.getByRole('button', { name: 'Lead', exact: true }).click()
  // Lead's graph, which starts where it was left: at the top level, unzoomed.
  await expect(instrument.getByText('Lead', { exact: true })).toBeVisible()
  await expect(readout).toHaveText('100%')
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  await expect(readout).toHaveText('144%')
})
