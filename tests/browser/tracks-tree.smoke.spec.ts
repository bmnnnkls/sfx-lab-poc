import type { Locator, Page } from '@playwright/test'
import { dragTo, expect, expectSaved, openView, test, viewRoot } from './fixtures'

/** The tree's rows as text, a group's members indented by their level. */
const outline = async (tree: Locator) =>
  (await tree.getByRole('treeitem').evaluateAll((rows) =>
    rows.map((row) => '  '.repeat(Number(row.getAttribute('aria-level')) - 1) + (row.getAttribute('aria-label') ?? '')))).join('\n')

const openTracks = async (page: Page) => {
  const view = await openView(page, 'Tracks')
  return { view, tree: view.getByRole('tree', { name: 'Tracks' }) }
}

const row = (tree: Locator, name: string) => tree.getByRole('treeitem', { name, exact: true })

/** Groups a track from its row's menu. */
const group = async (page: Page, tree: Locator, name: string) => {
  await row(tree, name).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Group', exact: true }).click()
}

test('the activity bar opens the Tracks view in the primary sidebar, listing the tracks in order', async ({ page }) => {
  await page.goto('/?starter')
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Tracks', exact: true }).click()
  const view = viewRoot(page, 'Tracks')
  await expect(view).toBeVisible()
  expect(await outline(view.getByRole('tree', { name: 'Tracks' }))).toBe('Bass\nLead\nPad')
})

test('a track groups from its menu, the group renames in place and takes a dragged track', async ({ page }) => {
  await page.goto('/?starter')
  const { tree } = await openTracks(page)
  await group(page, tree, 'Lead')
  expect(await outline(tree)).toBe('Bass\nGroup 1, group of 1 track\n  Lead\nPad')

  await row(tree, 'Group 1, group of 1 track').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const field = tree.getByRole('textbox', { name: 'Name of Group 1', exact: true })
  await expect(field).toBeFocused()
  await field.fill('Leads')
  await field.press('Enter')

  await dragTo(page, row(tree, 'Pad'), row(tree, 'Leads, group of 1 track'))
  expect(await outline(tree)).toBe('Bass\nLeads, group of 2 tracks\n  Lead\n  Pad')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await outline(tree)).toBe('Bass\nLeads, group of 1 track\n  Lead\nPad')
})

test('a row drags before or after another, by the half it is dropped on', async ({ page }) => {
  await page.goto('/?starter')
  const { tree } = await openTracks(page)
  await dragTo(page, row(tree, 'Pad'), row(tree, 'Bass'), { position: { x: 40, y: 3 } })
  expect(await outline(tree)).toBe('Pad\nBass\nLead')
  await dragTo(page, row(tree, 'Pad'), row(tree, 'Lead'), { position: { x: 40, y: 20 } })
  expect(await outline(tree)).toBe('Bass\nLead\nPad')
})

test('the keyboard moves rows and collapses groups, and undo leaves a group collapsed', async ({ page }) => {
  await page.goto('/?starter')
  const { tree } = await openTracks(page)
  await group(page, tree, 'Pad')
  const header = row(tree, 'Group 1, group of 1 track')
  await header.click()
  await page.keyboard.press('ArrowLeft')
  await expect(header).toHaveAttribute('aria-expanded', 'false')
  expect(await outline(tree)).toBe('Bass\nLead\nGroup 1, group of 1 track')

  await page.keyboard.press('Home')
  await expect(row(tree, 'Bass')).toBeFocused()
  await page.keyboard.press('Alt+ArrowDown')
  expect(await outline(tree)).toBe('Lead\nBass\nGroup 1, group of 1 track')
  await expect(row(tree, 'Bass')).toBeFocused()
  // Collapsing isn't an undo step: undo takes back the move, and the group stays collapsed.
  await page.keyboard.press('ControlOrMeta+z')
  expect(await outline(tree)).toBe('Bass\nLead\nGroup 1, group of 1 track')
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowRight')
  expect(await outline(tree)).toBe('Bass\nLead\nGroup 1, group of 1 track\n  Pad')
})

test('the eye hides a track, Show all shows it, and groups, collapse and hiding survive a reload', async ({ page }) => {
  await page.goto('/?starter')
  const { view, tree } = await openTracks(page)
  await row(tree, 'Lead').hover()
  await view.getByRole('button', { name: 'Hide Lead', exact: true }).click()
  await expect(row(tree, 'Lead, hidden')).toBeVisible()
  await view.getByRole('button', { name: 'Show all', exact: true }).click()
  await expect(row(tree, 'Lead')).toBeVisible()

  await view.getByRole('button', { name: 'Hide Lead', exact: true }).click()
  await group(page, tree, 'Bass')
  await row(tree, 'Group 1, group of 1 track').getByText('▾').click()
  await expectSaved(page)
  await page.reload()
  const after = (await openTracks(page)).tree
  expect(await outline(after)).toBe('Group 1, group of 1 track\nLead, hidden\nPad')
})

test('a group ungroups, or deletes with its tracks, and undo brings them back', async ({ page }) => {
  await page.goto('/?starter')
  const { tree } = await openTracks(page)
  await group(page, tree, 'Lead')
  const header = row(tree, 'Group 1, group of 1 track')
  await header.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ungroup', exact: true }).click()
  expect(await outline(tree)).toBe('Bass\nLead\nPad')
  await page.keyboard.press('ControlOrMeta+z')
  await header.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete group and tracks', exact: true }).click()
  expect(await outline(tree)).toBe('Bass\nPad')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await outline(tree)).toBe('Bass\nGroup 1, group of 1 track\n  Lead\nPad')
})

/** The session grid's column headers, by the name each shows. */
const columnNames = (session: Locator) =>
  session.locator('[role="group"][aria-label$=", collapsed"], button[class*="trackName"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label') ?? element.textContent ?? '').filter((name) => name !== 'Master'))

test('the session grid draws a group as a band, and a collapsed group as one column whose cells launch its members', async ({ page }) => {
  await page.goto('/?starter')
  const { tree } = await openTracks(page)
  await group(page, tree, 'Lead')
  await dragTo(page, row(tree, 'Pad'), row(tree, 'Group 1, group of 1 track'))
  const session = await openView(page, 'Session')
  const band = session.getByRole('group', { name: 'Group Group 1', exact: true })
  await expect(band).toBeVisible()
  // The band spans the two members' columns.
  const [bandBox, lead, pad] = await Promise.all([band.boundingBox(), session.getByRole('button', { name: 'Lead', exact: true }).boundingBox(), session.getByRole('button', { name: 'Pad', exact: true }).boundingBox()])
  expect(bandBox!.x).toBeLessThanOrEqual(lead!.x)
  expect(bandBox!.x + bandBox!.width).toBeGreaterThanOrEqual(pad!.x + pad!.width)

  await session.getByRole('button', { name: 'Collapse Group 1', exact: true }).click()
  expect(await columnNames(session)).toEqual(['Bass', 'Group Group 1, collapsed'])
  await expect(row(tree, 'Group 1, group of 2 tracks')).toHaveAttribute('aria-expanded', 'false')
  // Lead has no clip in scene 2, Pad has; nobody has one in scene 4.
  await expect(session.getByRole('button', { name: 'Launch Group 1 in scene 2', exact: true })).toBeVisible()
  await expect(session.getByRole('button', { name: 'Stop Group 1 in scene 4', exact: true })).toBeVisible()
  const launch = session.getByRole('button', { name: 'Launch Group 1 in scene 1', exact: true })
  await launch.click()
  await expect(launch).toHaveAttribute('data-state', 'playing')
  await expect(session.getByRole('button', { name: 'Launch scene 1', exact: true })).toBeVisible()
  await session.getByRole('button', { name: 'Expand Group 1', exact: true }).click()
  await expect(session.getByRole('button', { name: '■ Arp', exact: true })).toBeVisible()
  await expect(session.getByRole('button', { name: '■ Cm', exact: true })).toBeVisible()
  await expect(session.getByRole('button', { name: '▶ Root', exact: true })).toBeVisible()
})

test('a hidden track leaves the grid, which counts it and lights while it sounds', async ({ page }) => {
  await page.goto('/?starter')
  const { view, tree } = await openTracks(page)
  await row(tree, 'Bass').hover()
  await view.getByRole('button', { name: 'Hide Bass', exact: true }).click()
  const session = await openView(page, 'Session')
  expect(await columnNames(session)).toEqual(['Lead', 'Pad'])
  const hidden = session.getByRole('button', { name: '1 hidden track', exact: true })
  await expect(hidden).toBeVisible()
  // Only Bass plays: the hidden track still sounds, and the grid says so.
  await session.getByRole('button', { name: 'Launch scene 2', exact: true }).click()
  await session.getByRole('button', { name: 'Stop Pad', exact: true }).click()
  await expect(session.getByRole('button', { name: '1 hidden track, sounding', exact: true })).toBeVisible()
  await expect((await openTracks(page)).tree.getByRole('treeitem', { name: 'Bass, hidden', exact: true }).locator('[data-sounding]')).toBeVisible()
  await (await openView(page, 'Session')).getByRole('button', { name: '1 hidden track, sounding', exact: true }).click()
  await expect(viewRoot(page, 'Tracks')).toBeVisible()
})
