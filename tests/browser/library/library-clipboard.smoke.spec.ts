import type { Locator, Page } from '@playwright/test'
import { test, expect, dragTo, libraryMenu, libraryPanel, openView, treeRow } from '../support/fixtures'

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

test('three selected items drag into a folder at once, and onto a track they are refused', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await newFolder(page, panel, 'Kit')

  // Three Factory drums, selected with ⇧ and copied in by ⌘C, ⌘V.
  const factory = treeRow(panel, 'Factory')
  await expect(factory).toHaveAttribute('aria-label', 'Factory, 49 items')
  await opened(factory)
  await opened(treeRow(panel, 'Drums'))
  await exactRow(panel, 'Clap').click()
  await exactRow(panel, 'Hat').click({ modifiers: ['Shift'] })
  await page.keyboard.press('ControlOrMeta+c')
  await treeRow(panel, 'My library').click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.getByRole('status').filter({ hasText: 'Copied 3 things to My library' })).toBeVisible()
  await factory.click()
  await factory.press('ArrowLeft')

  const [clap, crash, hat] = ['Clap', 'Crash', 'Hat'].map((name) => exactRow(panel, name))
  await clap!.click()
  await hat!.click({ modifiers: ['Shift'] })
  for (const row of [clap!, crash!, hat!]) await expect(row).toHaveAttribute('aria-selected', 'true')

  // Several sounds onto a track: refused, saying why.
  const lead = session.getByRole('button', { name: 'Lead', exact: true })
  await dragTo(page, crash!, lead, { whileOver: () => expect(page.locator('[data-drop-reason="Drop one sound at a time"]')).toHaveCount(1) })
  await expect(treeRow(panel, 'My library')).toHaveAttribute('aria-label', 'My library, 3 items')

  // Onto Kit: all three move, in one drag of the middle one.
  await dragTo(page, crash!, treeRow(panel, 'Kit'))
  await expect(page.getByRole('status').filter({ hasText: 'Moved 3 things to Kit' })).toBeVisible()
  await expect(treeRow(panel, 'Kit')).toHaveAttribute('aria-label', 'Kit, 3 items')
  await page.reload()
  await openView(page, 'Library')
  await expect(treeRow(libraryPanel(page), 'Kit')).toHaveAttribute('aria-label', 'Kit, 3 items')
})
