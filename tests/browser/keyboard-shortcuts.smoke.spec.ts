import type { Page } from '@playwright/test'
import { test, expect, tabStrip, viewRoot } from './fixtures'

const apple = process.platform === 'darwin'
/** The panel's default key: ⌃⌘J on macOS, Ctrl+Alt+J elsewhere. */
const PANEL_KEY = apple ? 'Control+Meta+j' : 'Control+Alt+j'
const PANEL_LABEL = apple ? '⌃⌘J' : 'Ctrl+Alt+J'

const openShortcuts = async (page: Page) => {
  await page.getByRole('banner').getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Clicks an empty spot of Session, so the focus is in a view but on nothing of its own. */
const focusSession = (page: Page) => viewRoot(page, 'Session').click({ position: { x: 5, y: 300 } })

test('a key changed in the dialog works, shows in the tooltip, is kept after a reload, and resets', async ({ page }) => {
  await page.goto('/?starter')
  const toggle = tabStrip(page, 'Instrument').getByRole('button', { name: 'Panel', exact: true })
  let dialog = await openShortcuts(page)
  const row = dialog.getByRole('group', { name: 'Toggle panel', exact: true })
  await expect(row.locator('kbd')).toHaveText([PANEL_LABEL])

  await row.getByRole('button', { name: 'Change', exact: true }).click()
  await expect(row).toContainText('Press a key')
  await page.keyboard.press('Alt+p')
  await expect(row.locator('kbd')).toHaveText([apple ? '⌥P' : 'Alt+P'])
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()

  // The new key toggles the panel; the old one does nothing now.
  await focusSession(page)
  await page.keyboard.press('Alt+p')
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await page.keyboard.press(PANEL_KEY)
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await page.keyboard.press('Alt+p')
  await expect(viewRoot(page, 'Instrument')).toBeVisible()
  await expect(toggle).toHaveAttribute('title', `Toggle panel (${apple ? '⌥P' : 'Alt+P'})`)

  await page.reload()
  await expect(toggle).toHaveAttribute('title', `Toggle panel (${apple ? '⌥P' : 'Alt+P'})`)
  dialog = await openShortcuts(page)
  await dialog.getByRole('group', { name: 'Toggle panel', exact: true }).getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(dialog.getByRole('group', { name: 'Toggle panel', exact: true }).locator('kbd')).toHaveText([PANEL_LABEL])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(toggle).toHaveAttribute('title', `Toggle panel (${PANEL_LABEL})`)
})

test('the dialog refuses a key the browser keeps, says which command loses a key, and resets all', async ({ page }) => {
  await page.goto('/?starter')
  const dialog = await openShortcuts(page)
  const panel = dialog.getByRole('group', { name: 'Toggle panel', exact: true })
  await panel.getByRole('button', { name: 'Change', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+t')
  await expect(panel.getByRole('alert')).toHaveText(`The browser keeps ${apple ? '⌘T' : 'Ctrl+T'}: it opens a new tab.`)
  await expect(panel.locator('kbd')).toHaveText([PANEL_LABEL])

  // The primary sidebar's key moves to the panel.
  await panel.getByRole('button', { name: 'Change', exact: true }).click()
  await page.keyboard.press(apple ? 'Control+Meta+b' : 'Control+Alt+b')
  await expect(panel.getByRole('status')).toHaveText(`${apple ? '⌃⌘B' : 'Ctrl+Alt+B'} was Toggle primary sidebar's.`)
  await expect(dialog.getByRole('group', { name: 'Toggle primary sidebar', exact: true }).locator('kbd')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Reset all', exact: true }).click()
  await expect(panel.locator('kbd')).toHaveText([PANEL_LABEL])
  await expect(dialog.getByRole('group', { name: 'Toggle primary sidebar', exact: true }).locator('kbd')).toHaveText([apple ? '⌃⌘B' : 'Ctrl+Alt+B'])
  // The view-local keys are listed, read only.
  await expect(dialog.getByRole('region', { name: 'In the views', exact: true })).toContainText('Piano roll')
})
