import type { Page } from '@playwright/test'
import { test, expect, openView, viewRoot } from './fixtures'

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
  await session.getByRole('button', { name: '▶ Root', exact: true }).focus()
  await page.keyboard.press('F2')
  const field = session.getByRole('textbox', { name: 'Name of Root', exact: true })
  await expect(field).toBeFocused()
  await page.keyboard.press('Escape')
  await session.getByRole('button', { name: '▶ Walk', exact: true }).focus()
  await page.keyboard.press('Delete')
  await expect(session.getByRole('button', { name: '▶ Walk', exact: true })).toHaveCount(0)
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
  await session.getByRole('button', { name: '▶ Walk', exact: true }).focus()
  await page.keyboard.press('Delete')
  await expect(session.getByRole('button', { name: '▶ Walk', exact: true })).toHaveCount(0)
  const name = page.getByLabel('Project name', { exact: true })
  await name.click()
  await page.keyboard.type('x')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(session.getByRole('button', { name: '▶ Walk', exact: true })).toHaveCount(0)
})
