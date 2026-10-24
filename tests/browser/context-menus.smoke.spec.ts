import { test, expect, openView } from './fixtures'

/** The entries of the open menu, by name, with separators as '—'. */
const menuEntries = async (page: import('@playwright/test').Page) =>
  page.getByRole('menu').last().locator('[role="menuitem"], [role="separator"]').evaluateAll((elements) =>
    elements.map((element) => (element.getAttribute('role') === 'separator' ? '—' : (element.textContent ?? '').trim())))

test('a session clip has one menu, the same as its buttons', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: '▶ Root', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Launch', 'Edit notes', 'Edit automation', '—', 'Rename', 'Duplicate to empty slot', 'Place on arrangement', '—', 'Copy', 'Cut', '—', 'Delete'])
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
  await expect(page.getByRole('menuitem', { name: 'Launch', exact: true })).toBeVisible()
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

test('a track renames and duplicates from its menu, in the session grid and the mixer', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Bass', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Stop', 'Open instrument', 'Open effects', 'Open notes', 'Show automation', '—', 'Rename', 'Duplicate', 'Mute', 'Solo', '—', 'Delete'])
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const field = session.getByRole('textbox', { name: 'Name of Bass', exact: true })
  await expect(field).toBeFocused()
  await field.pressSequentially('Low end')
  await page.keyboard.press('Enter')
  await expect(session.getByRole('button', { name: 'Low end', exact: true })).toBeVisible()

  // Renamed from the mixer, the field shows in the mixer only.
  const mixer = await openView(page, 'Mixer')
  await mixer.getByRole('button', { name: 'Lead', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await expect(mixer.getByRole('textbox', { name: 'Name of Lead', exact: true })).toBeFocused()
  await expect(session.getByRole('textbox')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await mixer.getByRole('button', { name: 'Lead', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await expect(mixer.getByRole('region', { name: 'Lead copy channel', exact: true })).toBeVisible()
  await expect(session.getByRole('button', { name: '▶ Arp', exact: true })).toHaveCount(2)

  // × runs the same Delete.
  await session.getByRole('button', { name: 'Remove Lead copy', exact: true }).click()
  await expect(mixer.getByRole('region', { name: 'Lead copy channel', exact: true })).toHaveCount(0)
})

test('the master has a menu in the session grid and the mixer', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Master', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Open effects', 'Show automation'])
  await page.keyboard.press('Escape')
  const mixer = await openView(page, 'Mixer')
  await mixer.getByRole('region', { name: 'Master channel', exact: true }).getByText('Master', { exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Open effects', 'Show automation'])
  // The fader inside the strip keeps its own menu.
  await page.keyboard.press('Escape')
  await mixer.getByRole('slider', { name: 'Master fader', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['MIDI learn', 'Show automation'])
})

test('a scene renames, inserts and deletes from its menu', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const scenes = session.getByRole('button', { name: /^Launch scene \d+/ })
  await expect(scenes).toHaveCount(4)

  // Escape keeps the name.
  await session.getByRole('button', { name: 'Launch scene 2', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Launch', '—', 'Rename', 'Insert scene before', 'Duplicate', '—', 'Delete'])
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const field = session.getByRole('textbox', { name: 'Name of scene 2', exact: true })
  await expect(field).toBeFocused()
  await field.pressSequentially('Verse')
  await page.keyboard.press('Escape')
  await expect(session.getByRole('button', { name: 'Launch scene 2', exact: true })).toBeVisible()

  await session.getByRole('button', { name: 'Launch scene 2', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Insert scene before', exact: true }).click()
  await expect(scenes).toHaveCount(5)
  // The Bass's Walk clip moved down a row with its scene.
  await expect(session.getByRole('button', { name: '▶ Walk', exact: true })).toBeVisible()

  await session.getByRole('button', { name: 'Launch scene 1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await expect(scenes).toHaveCount(4)
  await expect(session.getByRole('button', { name: '▶ Root', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(session.getByRole('button', { name: '▶ Root', exact: true })).toBeVisible()
})

test('a clip copies into an empty slot and onto a lane', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: '▶ Root', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click()
  // The first empty MIDI slot is Lead's in scene 2.
  await session.getByRole('button', { name: 'Create clip', exact: true }).first().click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Create clip', '—', 'Paste'])
  await page.getByRole('menuitem', { name: 'Paste', exact: true }).click()
  await expect(session.getByRole('button', { name: '▶ Root', exact: true })).toHaveCount(2)

  const arrangement = await openView(page, 'Arrangement')
  const lane = arrangement.locator('[data-lane]').nth(1)
  await lane.click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Paste', exact: true }).click()
  await expect(lane.locator('xpath=..').getByTestId('arrangement-region')).toHaveCount(1)
})

test('an empty audio slot offers its samples from the menu, and automation slots copy', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Samples')
  await page.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5)
  await page.getByRole('listitem').filter({ hasText: 'Demo Drum Loop' }).getByRole('button', { name: 'New audio track', exact: true }).click()
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Add audio clip', exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add audio clip', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Demo Drum Loop 120 BPM', exact: true }).click()
  await expect(session.getByRole('button', { name: /▶\s*Demo Drum Loop/ })).toHaveCount(2)

  await session.getByRole('button', { name: 'Create Master automation scene 1', exact: true }).click()
  await openView(page, 'Session')
  await session.getByRole('button', { name: 'Launch Master automation scene 1', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Launch', 'Edit', '—', 'Copy', '—', 'Delete'])
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click()
  await session.getByRole('button', { name: 'Stop Master automation scene 2', exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Create', '—', 'Paste'])
  await page.getByRole('menuitem', { name: 'Paste', exact: true }).click()
  await expect(session.getByRole('button', { name: 'Launch Master automation scene 2', exact: true })).toBeVisible()
})
