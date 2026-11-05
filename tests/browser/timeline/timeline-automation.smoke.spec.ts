import type { Page } from '@playwright/test'
import { test, expect, openView } from '../support/fixtures'

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
