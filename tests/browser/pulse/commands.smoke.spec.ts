import type { Page } from '@playwright/test'
import { emptyLibrary, saveLibraryFolder } from '../../../src/core'
import { exportLibraryBundle } from '../../../src/storage'
import { test, expect, libraryPanel, openView, treeRow, viewRoot } from '../support/fixtures'

/** The region keys' modifiers: ⌃⌘ on macOS, Ctrl+Alt elsewhere. */
const REGION = process.platform === 'darwin' ? 'Control+Meta' : 'Control+Alt'

/** Clicks an empty spot of Session, so the focus is in a view but on nothing of its own. */
const focusSession = (page: Page) => viewRoot(page, 'Session').click({ position: { x: 5, y: 300 } })

test('the region keys hide and show each region, and the maximize key fills the window with a group and restores it', async ({ page }) => {
  await page.goto('/?starter')
  await focusSession(page)
  await expect(viewRoot(page, 'Samples')).toBeHidden()
  await page.keyboard.press(`${REGION}+b`)
  await expect(viewRoot(page, 'Samples')).toBeVisible()
  await page.keyboard.press(`${REGION}+b`)
  await expect(viewRoot(page, 'Samples')).toBeHidden()
  await page.keyboard.press(`${REGION}+Shift+b`)
  await expect(viewRoot(page, 'Sounds')).toBeVisible()
  await page.keyboard.press(`${REGION}+Shift+b`)
  await expect(viewRoot(page, 'Sounds')).toBeHidden()
  await page.keyboard.press(`${REGION}+j`)
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await page.keyboard.press(`${REGION}+j`)
  await expect(viewRoot(page, 'Instrument')).toBeVisible()

  // Session's group fills the layout, the panel counting as hidden; the key again restores it.
  await focusSession(page)
  await page.keyboard.press(`${REGION}+m`)
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await expect(viewRoot(page, 'Session')).toBeVisible()
  await page.keyboard.press(`${REGION}+m`)
  await expect(viewRoot(page, 'Instrument')).toBeVisible()
})

test('Space plays and stops, and on a focused button presses the button only', async ({ page }) => {
  await page.goto('/?starter')
  const position = page.locator('header [class*="_position_"]')
  const start = await position.textContent()
  await focusSession(page)
  await page.keyboard.press('Space')
  await expect(position).not.toHaveText(start ?? '')
  // Stopping goes back to the start, and stays there.
  await page.keyboard.press('Space')
  await expect(position).toHaveText(start ?? '')
  await page.waitForTimeout(500)
  await expect(position).toHaveText(start ?? '')

  // On the Stop button, Space presses Stop and doesn't start playing again.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(position).not.toHaveText(start ?? '')
  await page.getByRole('button', { name: 'Stop', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(position).toHaveText(start ?? '')
  await page.waitForTimeout(500)
  await expect(position).toHaveText(start ?? '')
})

test("a graph's selection answers Delete, undo, Duplicate, and Copy and Paste at the pointer", async ({ page }) => {
  await page.goto('/?starter')
  await viewRoot(page, 'Session').getByRole('button', { name: 'Lead', exact: true }).click()
  const instrument = await openView(page, 'Instrument')
  const cards = instrument.locator('[data-node]')
  const filter = () => instrument.locator('[data-node]', { hasText: 'Filter' })
  const before = await cards.count()

  await filter().first().locator('[data-header]').click()
  await expect(instrument.getByTestId('graph-viewport')).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(cards).toHaveCount(before - 1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(cards).toHaveCount(before)

  await filter().first().locator('[data-header]').click()
  const original = await filter().first().evaluate((card: HTMLElement) => [parseFloat(card.style.left), parseFloat(card.style.top)])
  await page.keyboard.press('ControlOrMeta+d')
  await expect(cards).toHaveCount(before + 1)
  const copies = await filter().evaluateAll((list) => list.map((card) => [parseFloat((card as HTMLElement).style.left), parseFloat((card as HTMLElement).style.top)]))
  expect(copies).toContainEqual([original[0]! + 32, original[1]! + 32])

  await filter().first().locator('[data-header]').click()
  await page.keyboard.press('ControlOrMeta+c')
  const box = (await instrument.getByTestId('graph-viewport').boundingBox())!
  const at = { x: box.x + box.width - 260, y: box.y + box.height - 140 }
  await page.mouse.move(at.x, at.y)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(cards).toHaveCount(before + 2)
  const placed = await filter().evaluateAll((list) => list.map((card) => card.getBoundingClientRect()).map((rect) => [Math.round(rect.x), Math.round(rect.y)]))
  expect(placed.some(([x, y]) => Math.abs(x! - at.x) <= 2 && Math.abs(y! - at.y) <= 2)).toBe(true)
})

test('a focused session clip answers Delete and F2', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Play Root', exact: true }).focus()
  await page.keyboard.press('F2')
  const field = session.getByRole('textbox', { name: 'Name of Root', exact: true })
  await expect(field).toBeFocused()
  await page.keyboard.press('Escape')
  await session.getByRole('button', { name: 'Play Walk', exact: true }).focus()
  await page.keyboard.press('Delete')
  await expect(session.getByRole('button', { name: 'Play Walk', exact: true })).toHaveCount(0)
})

test("Delete with the focus in the Mixer and a track selected deletes nothing, and ⌘Z in a field isn't the project's", async ({ page }) => {
  await page.goto('/?starter')
  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  const mixer = await openView(page, 'Mixer')
  const strip = mixer.getByRole('region', { name: 'Bass channel', exact: true })
  await strip.getByRole('slider').first().focus()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await expect(strip).toBeVisible()

  // A project edit, then ⌘Z typed in the project's name: the edit stays.
  await openView(page, 'Session')
  await session.getByRole('button', { name: 'Play Walk', exact: true }).focus()
  await page.keyboard.press('Delete')
  await expect(session.getByRole('button', { name: 'Play Walk', exact: true })).toHaveCount(0)
  const name = page.getByLabel('Project name', { exact: true })
  await name.click()
  await page.keyboard.type('x')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(session.getByRole('button', { name: 'Play Walk', exact: true })).toHaveCount(0)
})

test('⌘K opens the palette: a typed command runs, and Escape closes it with the focus back where it was', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const root = session.getByRole('button', { name: 'Play Root', exact: true })
  const palette = page.getByRole('dialog', { name: 'Commands', exact: true })
  await root.focus()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(palette).toBeVisible()
  await expect(palette.getByRole('combobox', { name: 'Command', exact: true })).toBeFocused()
  await page.keyboard.type('mixer')
  await expect(palette.getByRole('option').first()).toHaveText('View: Show Mixer')
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
  await expect(root).toBeFocused()

  await page.keyboard.press('ControlOrMeta+Shift+P')
  await expect(palette).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  await expect(root).toBeFocused()
})

test("the palette offers the focused or selected thing's actions: Bass: Duplicate", async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  // The focus moves off Bass; the selection still offers its actions.
  await focusSession(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('dup')
  const palette = page.getByRole('dialog', { name: 'Commands', exact: true })
  await expect(palette.getByRole('option').first()).toHaveText('Bass: Duplicate')
  await page.keyboard.press('Enter')
  await expect(session.getByRole('button', { name: 'Bass copy', exact: true })).toBeVisible()
})

test('the palette lists the saved layouts to load, and loads a built-in one', async ({ page }) => {
  await page.goto('/?starter')
  await page.getByRole('contentinfo').getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save layout as…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save layout' })
  await dialog.getByLabel('Layout name', { exact: true }).fill('Mine')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  const palette = page.getByRole('dialog', { name: 'Commands', exact: true })
  await focusSession(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('load')
  await expect(palette.getByRole('option', { name: 'Load layout: Mine', exact: true })).toBeVisible()
  for (let index = 0; index < 4; index++) await page.keyboard.press('Backspace')
  await page.keyboard.type('compose')
  await expect(palette.getByRole('option').first()).toHaveText('Layout: Compose layout')
  await page.keyboard.press('Enter')
  await expect(viewRoot(page, 'Clip')).toBeVisible()
  await expect(viewRoot(page, 'Session')).toBeVisible()
})

test('the Library menu names what it saves, says why an entry is disabled, saves the selection, and imports a bundle', async ({ page }) => {
  const catalog = saveLibraryFolder(emptyLibrary(), 'Shared', null, 'shared')
  const file = await exportLibraryBundle(catalog, { folderIds: ['shared'] }, 'Shared', async () => undefined)
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Lead', exact: true }).click()
  const libraryButton = page.getByRole('banner').getByRole('button', { name: 'Library', exact: true })
  await libraryButton.click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Save effects of Lead to library', exact: true })).toBeEnabled()
  const clip = menu.getByRole('menuitem', { name: 'Save clip to library', exact: true })
  await expect(clip).toBeDisabled()
  await expect(clip).toHaveAttribute('title', 'Select a session clip')
  await menu.getByRole('menuitem', { name: 'Save instrument of Lead to library', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved Lead to My library' })).toBeVisible()

  // The Library has never been shown: the request waits for it, and it opens the file picker once it mounts.
  const chooser = page.waitForEvent('filechooser')
  await libraryButton.click()
  await page.getByRole('menuitem', { name: 'Import .sfxlib…', exact: true }).click()
  await (await chooser).setFiles({ name: file.fileName, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) })
  const review = page.getByRole('dialog', { name: 'Bundle review' })
  await expect(review).toContainText('It goes into a new folder called Shared')
  await review.getByRole('button', { name: 'Import', exact: true }).click()
  const panel = libraryPanel(page)
  await expect(treeRow(panel, 'Shared')).toBeVisible()
  await expect(treeRow(panel, 'Lead')).toBeVisible()
})
