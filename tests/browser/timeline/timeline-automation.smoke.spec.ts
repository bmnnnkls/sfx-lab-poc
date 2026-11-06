import type { Page } from '@playwright/test'
import { serializeProject } from '../../../src/core'
import { test, expect, openView } from '../support/fixtures'
import { sweepProject } from '../support/automation-project'

/*
 * Automation on the arrangement's timeline (round 12c): returns' and the master's rows, the lanes twisty, timeline
 * lanes drawn and edited, Show automation on the timeline, and a region opened in Clip with its playhead and lanes.
 */

/** The starter with a return added from the session's + menu. */
const withReturn = async (page: Page) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Add track', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Return track', exact: true }).click()
  return openView(page, 'Arrangement')
}

test("returns and the master have rows after the clip tracks, without regions, and their headers have M and S and a lanes twisty", async ({ page }) => {
  const arrangement = await withReturn(page)
  const rows = arrangement.locator('[data-owner-row]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toHaveAttribute('data-owner-row', 'master')
  const returnRow = rows.first()
  await expect(returnRow).toContainText('Return A')
  await expect(returnRow.locator('[data-lane]')).toHaveCount(0)

  // M on the return mutes it; the master has neither.
  await returnRow.getByRole('button', { name: 'Return A mute', exact: true }).click()
  await expect(returnRow.getByRole('button', { name: 'Return A mute', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.nth(1).getByRole('button', { name: /mute|solo/ })).toHaveCount(0)

  // The twisty opens and closes; it isn't an undo step.
  const twisty = arrangement.getByRole('button', { name: 'Show automation lanes of Master', exact: true })
  await twisty.click()
  const hide = arrangement.getByRole('button', { name: 'Hide automation lanes of Master', exact: true })
  await expect(hide).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(hide).toHaveAttribute('aria-expanded', 'true')
  await expect(returnRow.getByRole('button', { name: 'Return A mute', exact: true })).toHaveAttribute('aria-pressed', 'false')

  // Every clip track has one, and a group only with a bus.
  await expect(arrangement.getByRole('button', { name: 'Show automation lanes of Bass', exact: true })).toBeVisible()
})

test('a box drawn with Ctrl selects points in the clip editor', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(sweepProject(true)))
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit Sweep clip', exact: true }).click()
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  const area = page.getByRole('application', { name: 'Automation drawing area' })
  const box = (await area.boundingBox())!
  for (const [x, y] of [[0.2, 0.3], [0.4, 0.6], [0.6, 0.4], [0.9, 0.5]]) await page.mouse.click(box.x + box.width * x!, box.y + box.height * y!)
  await expect(page.locator('[data-point-id]')).toHaveCount(4)
  await page.keyboard.down('Control')
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.9, { steps: 6 })
  await expect(page.getByTestId('automation-box')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Control')
  await page.getByRole('button', { name: 'Delete points', exact: true }).click()
  await expect(page.locator('[data-point-id]')).toHaveCount(1)
})

/** Groups Lead and makes the group sum to a bus, from the Tracks view. */
const leadInBus = async (page: Page) => {
  const tree = (await openView(page, 'Tracks')).getByRole('tree', { name: 'Tracks' })
  for (const [row, entry] of [['Lead', 'Group'], ['Group 1, group of 1 track', 'Sum to a bus']] as const) {
    await tree.getByRole('treeitem', { name: row, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: entry, exact: true }).click()
  }
}

test("a bus's fader lane on the timeline: added, drawn, dragged and undone, held, played and overridden, deleted", async ({ page }) => {
  await page.goto('/?starter')
  await leadInBus(page)
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByLabel('Grid').selectOption('bar')
  await arrangement.getByRole('button', { name: 'Show automation lanes of Group 1', exact: true }).click()
  await arrangement.getByRole('button', { name: 'Add an automation lane to Group 1', exact: true }).click()
  await arrangement.getByLabel('Target for a new lane of Group 1').selectOption({ label: 'Mixer / volume' })
  const lane = arrangement.getByRole('application', { name: 'Mixer / volume lane', exact: true })
  await expect(lane).toBeVisible()

  // Three points on bars 1, 2 and 3 (24 px a beat, the grid on bars).
  const box = (await lane.boundingBox())!
  for (const [x, y] of [[3, 30], [4 * 24 + 4, 10], [8 * 24 - 4, 20]]) await page.mouse.click(box.x + x!, box.y + y!)
  await expect(lane).toHaveAttribute('data-beats', '0,4,8')

  // The middle one dragged two bars on, then undone in one step.
  await page.mouse.move(box.x + 4 * 24, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 12 * 24 + 5, box.y + 10, { steps: 8 })
  await page.mouse.up()
  await expect(lane).toHaveAttribute('data-beats', '0,8,12')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lane).toHaveAttribute('data-beats', '0,4,8')

  // The first segment held, from its menu.
  await lane.click({ button: 'right', position: { x: 2 * 24, y: 36 } })
  await page.getByRole('menuitem', { name: 'Hold segment', exact: true }).click()
  await expect(lane).toHaveAttribute('data-holds', '1')

  // Off and on again.
  const enabled = arrangement.getByRole('checkbox', { name: 'Enable Mixer / volume', exact: true })
  await enabled.uncheck()
  await enabled.check()

  // Playing, the fader follows the lane: moved by hand it is overridden until Read.
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  const mixer = await openView(page, 'Mixer')
  const bus = mixer.getByRole('region', { name: 'Group 1 bus', exact: true })
  await expect(bus.getByText(/^Read: /)).toBeVisible()
  await bus.getByRole('slider', { name: 'Group 1 fader', exact: true }).fill('0.3')
  const read = arrangement.getByRole('button', { name: 'Read', exact: true })
  await expect(read).toBeVisible()
  await read.click()
  await expect(read).toHaveCount(0)
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()

  // Deleted from its header's menu, and back with undo.
  await arrangement.locator('[data-timeline-lane]').getByText('Mixer / volume', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete lane', exact: true }).click()
  await expect(lane).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lane).toHaveAttribute('data-beats', '0,4,8')
})

test("Show automation on timeline on a bus fader adds its lane, opens the bus's lanes and focuses the lane", async ({ page }) => {
  await page.goto('/?starter')
  await leadInBus(page)
  const mixer = await openView(page, 'Mixer')
  await mixer.getByRole('slider', { name: 'Group 1 fader', exact: true }).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Show automation in clip', exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Show automation on timeline', exact: true }).click()
  const arrangement = page.locator('[data-view="arrangement"]')
  const lane = arrangement.getByRole('application', { name: 'Mixer / volume lane', exact: true })
  await expect(lane).toBeFocused()
  await expect(arrangement.getByRole('button', { name: 'Hide automation lanes of Group 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lane).toHaveCount(0)
})

test("a region opened in Clip edits its own lanes, not its session source's, and shows its playhead while the arrangement plays", async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(sweepProject()))
  await page.goto('/')
  await (await openView(page, 'Session')).getByRole('button', { name: '▶ Sweep clip', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Place on arrangement', exact: true }).click()
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByTestId('arrangement-region').first().dblclick()
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  const editor = page.locator('[data-automation-editor]')
  await expect(editor.locator('[data-point-id]')).toHaveCount(2)
  const area = editor.getByRole('application', { name: 'Automation drawing area' })
  const box = (await area.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5)
  await expect(editor.locator('[data-point-id]')).toHaveCount(3)

  // Playing the arrangement, the region's editor draws where it is.
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect(editor.locator('line[class*="playhead"]')).toHaveCount(1)
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()

  // The session clip keeps its two points.
  await (await openView(page, 'Session')).getByRole('button', { name: 'Edit Sweep clip', exact: true }).click()
  await expect(page.locator('[data-automation-editor] [data-point-id]')).toHaveCount(2)
})
