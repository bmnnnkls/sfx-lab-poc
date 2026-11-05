import type { Locator, Page } from '@playwright/test'
import { test, expect, libraryMenu, libraryPanel, openView, treeRow } from '../support/fixtures'

/** Makes a folder at the top level from the Library's ⋯, named in place. */
const newFolder = async (page: Page, panel: Locator, name: string) => {
  await libraryMenu(panel, 'New folder')
  await panel.getByRole('textbox', { name: 'Name of New folder', exact: true }).fill(name)
  await page.keyboard.press('Enter')
  await expect(treeRow(panel, name)).toBeVisible()
}

/** A row by its exact name (a folder's label carries its count). */
const exactRow = (panel: Locator, name: string): Locator => panel.getByRole('tree', { name: 'Library' }).getByRole('treeitem', { name, exact: true })

/** Makes a row active and opens it, from the keyboard. */
const opened = async (row: Locator) => {
  await row.click()
  await row.press('ArrowRight')
}

test('⌘C then ⌘V copies a Factory sound into a folder; ⌘X marks it, Esc clears that, and ⌘V on another folder moves it', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await newFolder(page, panel, 'Kit')
  await newFolder(page, panel, 'Pads')

  // The Factory's Kick, copied, then pasted on Kit.
  const factory = treeRow(panel, 'Factory')
  await expect(factory).toHaveAttribute('aria-label', 'Factory, 49 items')
  await opened(factory)
  await opened(treeRow(panel, 'Drums'))
  await exactRow(panel, 'Kick').click()
  await page.keyboard.press('ControlOrMeta+c')
  // A Factory sound can't be cut: ⌘X leaves nothing marked.
  await page.keyboard.press('ControlOrMeta+x')
  await expect(panel.locator('[data-cut]')).toHaveCount(0)
  await treeRow(panel, 'Kit').click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.getByRole('status').filter({ hasText: 'Copied Kick to Kit' })).toBeVisible()
  await expect(treeRow(panel, 'Kit')).toHaveAttribute('aria-label', 'Kit, 1 item')

  // The copy, cut: dimmed until Esc.
  await factory.click()
  await factory.press('ArrowLeft')
  await opened(treeRow(panel, 'Kit'))
  const kick = exactRow(panel, 'Kick')
  await kick.click()
  await page.keyboard.press('ControlOrMeta+x')
  await expect(kick).toHaveAttribute('data-cut', 'true')
  await expect(kick).toHaveAccessibleDescription('Cut')
  await page.keyboard.press('Escape')
  await expect(kick).not.toHaveAttribute('data-cut')

  // Cut again and pasted on Pads, from its menu's Cut and the keyboard's ⌘V.
  await kick.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Cut', exact: true }).click()
  await expect(kick).toHaveAttribute('data-cut', 'true')
  await treeRow(panel, 'Pads').click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.getByRole('status').filter({ hasText: 'Moved Kick to Pads' })).toBeVisible()
  await expect(treeRow(panel, 'Pads')).toHaveAttribute('aria-label', 'Pads, 1 item')
  await expect(treeRow(panel, 'Kit')).toHaveAttribute('aria-label', 'Kit')
  await expect(panel.locator('[data-cut]')).toHaveCount(0)

  // A paste empties a cut: Paste here is disabled now.
  await treeRow(panel, 'Kit').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Paste here', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')

  // It stays moved after a reload.
  await page.reload()
  await openView(page, 'Library')
  await expect(treeRow(libraryPanel(page), 'Pads')).toHaveAttribute('aria-label', 'Pads, 1 item')
})
