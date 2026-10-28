import { test, expect, openView, viewRoot } from './fixtures'

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
  expect(await menuEntries(page)).toEqual(['Stop', 'Open instrument', 'Open effects', 'Open notes', 'Show automation', '—', 'Rename', 'Duplicate', 'Group', 'Move to group▸', 'Move up', 'Move down', 'Hide', 'Mute', 'Solo', '—', 'Delete'])
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

  // An audio lane adds a clip of a sample, and an instrument's canvas a sampler, from the same kind of submenu.
  const arrangement = await openView(page, 'Arrangement')
  const audioLane = arrangement.locator('[data-lane]').nth(3)
  await audioLane.click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add audio clip', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Demo Drum Loop 120 BPM', exact: true }).click()
  await expect(audioLane.locator('xpath=..').getByTestId('arrangement-region')).toHaveCount(1)
  // The new audio track is selected; Bass has an instrument.
  await (await openView(page, 'Session')).getByRole('button', { name: 'Bass', exact: true }).click()
  const instrument = await openView(page, 'Instrument')
  const viewport = instrument.getByTestId('graph-viewport')
  const box = (await viewport.boundingBox())!
  await viewport.click({ button: 'right', position: { x: box.width - 120, y: box.height - 80 } })
  expect(await menuEntries(page)).toEqual(['Add node…', '—', 'Add sampler▸', '—', 'Paste'])
  await page.getByRole('menuitem', { name: 'Add sampler', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Demo Drum Loop 120 BPM', exact: true }).click()
  await expect(instrument.locator('[data-node]', { hasText: 'Sampler' })).toHaveCount(1)
})

test('a library item trashes and restores from its menu, and a folder makes one inside', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = page.getByRole('region', { name: 'Personal library' })
  await panel.getByLabel('Library name', { exact: true }).fill('Synth')
  await panel.getByRole('button', { name: 'Save asset + presets', exact: true }).first().click()
  const items = panel.getByLabel('Library items', { exact: true })
  const synth = items.getByRole('button', { name: /^Synth/ })
  await synth.click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Preview', '—', 'Rename', 'Duplicate', 'Insert new instrument track', 'Replace selected graph', '—', 'Trash'])
  await page.getByRole('menuitem', { name: 'Trash', exact: true }).click()
  await expect(page.getByText('Moved to the trash', { exact: true })).toBeVisible()
  await expect(synth).toHaveCount(0)

  await panel.getByRole('button', { name: 'Trash', exact: true }).click()
  await synth.click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Restore'])
  await page.getByRole('menuitem', { name: 'Restore', exact: true }).click()
  await panel.getByRole('button', { name: 'Back to library', exact: true }).click()
  await expect(synth).toBeVisible()

  await panel.getByLabel('Library name', { exact: true }).fill('Leads')
  await panel.getByRole('button', { name: 'New folder', exact: true }).click()
  await panel.getByRole('treeitem', { name: 'Leads', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'New folder inside', exact: true }).click()
  const field = panel.getByRole('textbox', { name: 'Name of New folder', exact: true })
  await expect(field).toBeFocused()
  await field.pressSequentially('Bright')
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('treeitem', { name: 'Bright', exact: true })).toHaveAttribute('aria-selected', 'true')
})

test('samples and sounds have menus', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  await samples.getByText('Demo Kick', { exact: true }).click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Preview', 'Open in wave editor', '—', 'Rename', 'New sampler track', 'New audio track', '—', 'Remove from project'])
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const field = samples.getByRole('textbox', { name: 'Name of Demo Kick', exact: true })
  await expect(field).toBeFocused()
  await field.pressSequentially('Deep kick')
  await page.keyboard.press('Enter')
  await expect(samples.getByText('Deep kick', { exact: true })).toBeVisible()

  await viewRoot(page, 'Session').getByText('Master', { exact: true }).first().click()
  const sounds = await openView(page, 'Sounds')
  await sounds.getByLabel('Sound scope').selectOption('track')
  await sounds.getByLabel('Sound name').fill('Loud')
  await sounds.getByRole('button', { name: 'Save snapshot', exact: true }).click()
  // The row's label; the morph's two lists name the snapshot too.
  await sounds.getByText(/^Loud · Master/).first().click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Recall', '—', 'Update', 'Rename', 'Duplicate', '—', 'Delete'])
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await expect(sounds.getByRole('button', { name: 'Recall Loud copy', exact: true })).toBeVisible()
})

test("nodes copy into another track's instrument, and the canvas adds nodes where it was clicked", async ({ page }) => {
  await page.goto('/?starter')
  const session = viewRoot(page, 'Session')
  const instrument = await openView(page, 'Instrument')
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  const cards = instrument.locator('[data-node]')
  const before = await cards.count()
  const filter = instrument.locator('[data-node]', { hasText: 'Filter' }).first()
  await filter.locator('[data-header]').click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Group into module', '—', 'Copy', 'Cut', 'Duplicate', '—', 'Delete'])
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click()

  const viewport = instrument.getByTestId('graph-viewport')
  const box = await viewport.boundingBox()
  if (!box) throw new Error('No graph viewport')
  const empty = { x: box.width - 60, y: box.height - 60 }

  await session.getByRole('button', { name: 'Lead', exact: true }).click()
  await expect(instrument.getByText('Lead', { exact: true })).toBeVisible()
  await viewport.click({ button: 'right', position: empty })
  expect(await menuEntries(page)).toEqual(['Add node…', '—', 'Paste'])
  await page.getByRole('menuitem', { name: 'Paste', exact: true }).click()
  await expect(cards).toHaveCount(before + 1)

  await viewport.click({ button: 'right', position: empty })
  await page.getByRole('menuitem', { name: 'Add node…', exact: true }).click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')

  // Into effects it doesn't go.
  const effects = await openView(page, 'Effects')
  const fxViewport = effects.getByTestId('graph-viewport')
  await fxViewport.click({ button: 'right', position: { x: 20, y: 200 } })
  await expect(page.getByRole('menuitem', { name: 'Paste', exact: true })).toBeDisabled()
})

test("a region's menu edits its own copy, or its session source", async ({ page }) => {
  await page.goto('/?starter')
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.locator('[data-lane]').first().click({ button: 'right', position: { x: 120, y: 20 } })
  await page.getByRole('menuitem', { name: 'Add clip', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Root', exact: true }).click()
  const region = arrangement.getByTestId('arrangement-region')
  await region.click({ button: 'right' })
  expect(await menuEntries(page)).toEqual(['Edit', 'Edit session clip', '—', 'Duplicate', 'Loop until next region', '—', 'Copy', '—', 'Delete'])
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  const clip = viewRoot(page, 'Clip')
  await expect(clip.getByText(/^Bass \/ Root · arrangement, bar \d+$/)).toBeVisible()
  await region.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit session clip', exact: true }).click()
  await expect(clip.getByText('Bass / Root', { exact: true })).toBeVisible()
})
