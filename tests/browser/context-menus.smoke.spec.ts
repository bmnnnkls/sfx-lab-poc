import { test, expect, openView } from './fixtures'

/** The entries of the open menu, by name, with separators as '—'. */
const menuEntries = async (page: import('@playwright/test').Page) =>
  page.getByRole('menu').last().locator('[role="menuitem"], [role="separator"]').evaluateAll((elements) =>
    elements.map((element) => (element.getAttribute('role') === 'separator' ? '—' : (element.textContent ?? '').trim())))

test('a session clip has one menu, the same as its buttons', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: '▶ Root', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Launch clip', 'Edit notes', 'Edit automation', '—', 'Rename', 'Duplicate to empty slot', 'Place on arrangement', '—', 'Delete clip'])
  await page.keyboard.press('Escape')
  // × runs the same Delete as the menu.
  await session.getByRole('button', { name: 'Delete Walk', exact: true }).click()
  await expect(session.getByRole('button', { name: '▶ Walk', exact: true })).toHaveCount(0)
})

test('Shift+F10 opens the menu of the focused element', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: '▶ Root', exact: true }).focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menuitem', { name: 'Launch clip', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('Rename turns a clip name into a field: Enter keeps the new name, Escape and an empty name the old one', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const rename = async (name: string) => {
    await session.getByRole('button', { name: `▶ ${name}`, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const field = session.getByRole('textbox', { name: `Name of ${name}`, exact: true })
    await expect(field).toBeFocused()
    // The whole name is selected, so typing replaces it.
    expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, name.length])
    return field
  }
  await (await rename('Root')).pressSequentially('Low root')
  await page.keyboard.press('Enter')
  await expect(session.getByRole('button', { name: '▶ Low root', exact: true })).toBeVisible()

  await (await rename('Low root')).pressSequentially('Gone')
  await page.keyboard.press('Escape')
  await expect(session.getByRole('button', { name: '▶ Low root', exact: true })).toBeVisible()

  await (await rename('Low root')).fill('')
  await page.keyboard.press('Enter')
  await expect(session.getByRole('button', { name: '▶ Low root', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(session.getByRole('button', { name: '▶ Root', exact: true })).toBeVisible()
})
