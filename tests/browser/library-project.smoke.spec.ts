import { test, expect, dragTo, libraryMenu, libraryPanel, openExample, openView, treeRow, viewRoot } from './fixtures'
import type { Locator, Page } from '@playwright/test'

const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true }).click()

/** A row of the Library's tree by its exact label, at a level (2: the tracks of This project). */
const row = (panel: Locator, name: string, level: number) => panel.getByRole('tree', { name: 'Library' }).getByRole('treeitem', { name, exact: true, level })

/** Opens or closes a row with the keyboard, as the tree's arrows do. */
const toggle = async (target: Locator, open: boolean) => {
  await target.click()
  await target.press(open ? 'ArrowRight' : 'ArrowLeft')
  await expect(target).toHaveAttribute('aria-expanded', String(open))
}

/** The titles of the nodes the Instrument view shows, sorted. */
const nodeTitles = async (page: Page) => (await viewRoot(page, 'Instrument').locator('[data-node] [data-header]').allTextContents()).sort()

test("This project shows Low Light's tracks; its graphs save, refuse and copy by dragging, and its rows follow undo", async ({ page }) => {
  await page.goto('/?starter')
  await openExample(page, 'Low Light')
  const session = await openView(page, 'Session')
  await openView(page, 'Library')
  const panel = libraryPanel(page)

  // The root is first in the tree, collapsed, and opens onto the tracks, the returns and the master.
  const root = treeRow(panel, 'Low Light')
  await expect(panel.getByRole('treeitem').first()).toHaveAccessibleName('Low Light')
  await expect(root).toHaveAttribute('aria-expanded', 'false')
  await toggle(root, true)
  const tracks = await panel.getByRole('treeitem', { level: 2 }).evaluateAll((rows) => rows.map((element) => element.getAttribute('aria-label')))
  expect(tracks.slice(0, 18)).toEqual(['Kick', 'Clap', 'Hat', 'Open hat', 'Shaker', 'Knocks', 'Bass', 'Stab', 'Arp', 'Drone', 'Riser', 'Crash', 'Dust', 'Room', 'Echo', 'Hall', 'Master', 'Modules, 4 items'])

  // Bass's effects read the kick's audio: ⚠, and My library refuses them with the reason.
  const bass = row(panel, 'Bass', 2)
  await toggle(bass, true)
  const effects = row(panel, 'Effects', 3)
  await expect(effects).toHaveAttribute('title', 'Uses Track audio from Kick')
  const mine = treeRow(panel, 'My library')
  await dragTo(page, effects, mine, {
    whileOver: async () => {
      await expect(mine).toHaveAttribute('data-drop', 'refuse')
      await expect(mine).toHaveAttribute('data-drop-reason', 'Uses Track audio from Kick')
    },
  })
  await expect(mine).toHaveAttribute('aria-label', 'My library')
  await toggle(bass, false)

  // Kick's instrument dragged onto a folder is saved there.
  await libraryMenu(panel, 'New folder')
  await panel.getByRole('textbox', { name: 'Name of New folder', exact: true }).fill('Drums')
  await page.keyboard.press('Enter')
  const kick = row(panel, 'Kick', 2)
  await toggle(kick, true)
  await dragTo(page, row(panel, 'Instrument', 3), treeRow(panel, 'Drums'))
  await expect(page.getByRole('status').filter({ hasText: 'Saved Kick to Drums' })).toBeVisible()
  await expect(treeRow(panel, 'Drums')).toHaveAttribute('aria-label', 'Drums, 1 item')

  // Show on a clip row selects the clip and opens it.
  await toggle(row(panel, 'Clips, 7 items', 3), true)
  const clip = panel.getByRole('treeitem', { level: 4 }).first()
  const clipName = (await clip.getAttribute('aria-label'))!
  await clip.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit notes', exact: true }).click()
  await expect(viewRoot(page, 'Clip').getByText(`Kick / ${clipName}`)).toBeVisible()
  await toggle(kick, false)

  // Hat's instrument dragged onto Clap's session header: Clap gets the hat's graph, and one undo gives its own back.
  await openView(page, 'Instrument')
  await session.getByRole('button', { name: 'Hat', exact: true }).click()
  const hat = await nodeTitles(page)
  await session.getByRole('button', { name: 'Clap', exact: true }).click()
  const clap = await nodeTitles(page)
  expect(clap).not.toEqual(hat)
  await openView(page, 'Library')
  const hatRow = row(panel, 'Hat', 2)
  await toggle(hatRow, true)
  await dragTo(page, row(panel, 'Instrument', 3), session.getByRole('button', { name: 'Clap', exact: true }))
  await expect(page.getByRole('status').filter({ hasText: 'copied into project' })).toBeVisible()
  await openView(page, 'Instrument')
  await session.getByRole('button', { name: 'Clap', exact: true }).click()
  await expect.poll(() => nodeTitles(page)).toEqual(hat)
  await undo(page)
  await expect.poll(() => nodeTitles(page)).toEqual(clap)

  // Undoing an edit updates the rows: a track renamed from its row, then undone.
  await openView(page, 'Library')
  await toggle(hatRow, false)
  await row(panel, 'Clap', 2).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Name of Clap', exact: true }).fill('Snap')
  await page.keyboard.press('Enter')
  await expect(row(panel, 'Snap', 2)).toBeVisible()
  await undo(page)
  await expect(row(panel, 'Clap', 2)).toBeVisible()
  await expect(row(panel, 'Snap', 2)).toHaveCount(0)
})
