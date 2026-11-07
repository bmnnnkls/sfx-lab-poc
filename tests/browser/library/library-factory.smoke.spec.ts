import type { Locator, Page } from '@playwright/test'
import { test, expect, dragTo, libraryPanel, openView, treeRow } from '../support/fixtures'

/** The Library's Factory root, open, once its catalog has loaded. */
const openFactory = async (page: Page): Promise<Locator> => {
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  const factory = treeRow(panel, 'Factory')
  await expect(factory).toHaveAttribute('aria-label', 'Factory, 49 items')
  await factory.click()
  await factory.press('ArrowRight')
  return panel
}

/** An item row by its exact name (a folder's label carries its count). */
const itemRow = (panel: Locator, name: string): Locator => panel.getByRole('tree', { name: 'Library' }).getByRole('treeitem', { name, exact: true })

const opened = async (panel: Locator, folder: string) => {
  await treeRow(panel, folder).click()
  await treeRow(panel, folder).press('ArrowRight')
}

test('the Factory shows its folders after My library, read-only, and previews a sound', async ({ page }) => {
  await page.goto('/?starter')
  const panel = await openFactory(page)
  const roots = await panel.getByRole('treeitem', { level: 1 }).evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(roots).toEqual(['Demo project', 'My library', 'Factory, 49 items', 'Trash'])
  await expect(treeRow(panel, 'Factory')).toHaveAttribute('aria-description', 'Read-only')
  const folders = await panel.getByRole('treeitem', { level: 2 }).evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(folders).toEqual(['Bass, 2 items', 'Clips', 'Drums, 8 items', 'Effects', 'Generative, 3 items', 'Keys and synths, 3 items', 'Note effects, 2 items', 'Starters, 5 items', 'Textures, 5 items'])

  await opened(panel, 'Drums')
  const kick = itemRow(panel, 'Kick')
  await kick.click()
  const details = panel.getByLabel('Library details', { exact: true })
  await expect(details).toContainText('Instrument · Factory')
  await expect(details).toContainText("Low Light's kick")
  await page.keyboard.press('Space')
  await expect(panel.getByRole('button', { name: 'Stop preview of Kick', exact: true })).toBeVisible()

  // Its menu uses and copies it; nothing edits it.
  await kick.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Copy to My library', exact: true })).toBeVisible()
  for (const entry of ['Rename', 'Duplicate', 'Move to', 'Trash']) await expect(page.getByRole('menuitem', { name: entry, exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('a Factory sound dragged onto a track replaces its instrument, and Sounds offers it from the library', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const panel = await openFactory(page)
  await opened(panel, 'Bass')
  await dragTo(page, itemRow(panel, 'Bass'), session.getByRole('button', { name: 'Lead', exact: true }))
  await expect(page.getByRole('status').filter({ hasText: 'Asset and presets copied into project' })).toBeVisible()
  await session.getByRole('button', { name: 'Lead', exact: true }).click()
  const sounds = await openView(page, 'Sounds')
  // The link names the Factory's Bass, which Sounds reads in the Factory catalog.
  const fromLibrary = sounds.getByRole('region', { name: 'From the library · Bass', exact: true })
  await expect(fromLibrary.getByRole('button', { name: 'Recall Bass', exact: true })).toHaveAccessibleDescription('Library sound')
})

test('nothing drops onto the Factory', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const panel = await openFactory(page)
  const drums = treeRow(panel, 'Drums')
  // A clip from the project, and a Factory sound, onto a Factory folder: refused, so no save and no move.
  await dragTo(page, session.getByRole('button', { name: 'Play Root', exact: true }), drums, { whileOver: () => expect(drums).toHaveAttribute('data-drop', 'refuse') })
  await opened(panel, 'Bass')
  await dragTo(page, itemRow(panel, 'Sub'), drums, { whileOver: () => expect(drums).toHaveAttribute('data-drop', 'refuse') })
  await expect(drums).toHaveAttribute('aria-label', 'Drums, 8 items')
  await expect(itemRow(panel, 'Bass, 2 items')).toBeVisible()
  await expect(treeRow(panel, 'My library')).toHaveAttribute('aria-label', 'My library')
  await expect(page.getByRole('status').filter({ hasText: /Saved|Moved|Copied/ })).toHaveCount(0)
})

test('Copy to My library makes an editable copy, by menu or by dragging, that is still there after a reload', async ({ page }) => {
  await page.goto('/?starter')
  const panel = await openFactory(page)
  await opened(panel, 'Drums')
  await itemRow(panel, 'Kick').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy to My library', exact: true }).click()
  // Show makes the copy active and names it in place, as after a save.
  await page.getByRole('status').filter({ hasText: 'Copied Kick to My library' }).getByRole('button', { name: 'Show', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Name of Kick', exact: true }).fill('My kick')
  await page.keyboard.press('Enter')
  await expect(treeRow(panel, 'My kick')).toHaveAttribute('aria-selected', 'true')
  await expect(treeRow(panel, 'My library')).toHaveAttribute('aria-label', 'My library, 1 item')
  // The Factory's Kick is as it was.
  await expect(itemRow(panel, 'Kick')).toBeVisible()

  // A drag onto My library copies too.
  await opened(panel, 'Bass')
  await dragTo(page, itemRow(panel, 'Sub'), treeRow(panel, 'My library'))
  await expect(page.getByRole('status').filter({ hasText: 'Copied Sub to My library' })).toBeVisible()
  await expect(treeRow(panel, 'My library')).toHaveAttribute('aria-label', 'My library, 2 items')

  await page.reload()
  await openView(page, 'Library')
  await expect(treeRow(panel, 'My library')).toHaveAttribute('aria-label', 'My library, 2 items')
  await expect(itemRow(panel, 'My kick')).toBeVisible()
  await expect(itemRow(panel, 'Sub')).toBeVisible()
  await itemRow(panel, 'My kick').click()
  await expect(panel.getByLabel('Library details', { exact: true })).toContainText('Instrument')
  await expect(panel.getByLabel('Library details', { exact: true })).not.toContainText('Factory')
})
