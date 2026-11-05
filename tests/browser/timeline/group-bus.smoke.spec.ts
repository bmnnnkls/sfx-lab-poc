import type { Locator, Page } from '@playwright/test'
import { dragTo, expect, openView, test } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'

const openTracks = async (page: Page) => (await openView(page, 'Tracks')).getByRole('tree', { name: 'Tracks' })

const row = (tree: Locator, name: string) => tree.getByRole('treeitem', { name, exact: true })

/** Runs an entry of a row's menu in the Tracks view. */
const fromMenu = async (page: Page, tree: Locator, name: string, entry: string) => {
  await row(tree, name).click({ button: 'right' })
  await page.getByRole('menuitem', { name: entry, exact: true }).click()
}

/** Groups Lead (Group 1) and makes the group sum to a bus; returns the Tracks tree. */
const leadInBus = async (page: Page) => {
  const tree = await openTracks(page)
  await fromMenu(page, tree, 'Lead', 'Group')
  await fromMenu(page, tree, 'Group 1, group of 1 track', 'Sum to a bus')
  return tree
}

const strip = (mixer: Locator, name: string) => mixer.getByRole('region', { name, exact: true })

test('Sum to a bus draws a bus strip before the members, and undo takes it away', async ({ page }) => {
  await page.goto('/?starter')
  await leadInBus(page)
  const mixer = await openView(page, 'Mixer')
  const bus = strip(mixer, 'Group 1 bus')
  await expect(bus).toBeVisible()
  for (const control of ['Group 1 fader', 'Group 1 pan']) await expect(bus.getByRole('slider', { name: control, exact: true })).toBeVisible()
  for (const button of ['Group 1 mute', 'Group 1 solo']) await expect(bus.getByRole('button', { name: button, exact: true })).toBeVisible()
  await expect(bus.getByLabel('Group 1 level', { exact: true })).toBeAttached()
  await expect(bus).toContainText('→ Master')
  const lead = strip(mixer, 'Lead channel')
  await expect(lead).toContainText('→ Group 1')
  await expect(strip(mixer, 'Bass channel')).not.toContainText('→')
  expect((await bus.boundingBox())!.x).toBeLessThan((await lead.boundingBox())!.x)

  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect(bus).toHaveCount(0)
  await expect(lead).not.toContainText('→')
  await page.getByRole('button', { name: 'Redo', exact: true }).first().click()
  await expect(bus).toBeVisible()
})

test('a nested bus sums into its parent, and into the master once moved out', async ({ page }) => {
  await page.goto('/?starter')
  const tree = await leadInBus(page)
  await fromMenu(page, tree, 'Lead', 'Group')
  await fromMenu(page, tree, 'Group 2, group of 1 track', 'Sum to a bus')
  const mixer = await openView(page, 'Mixer')
  await expect(strip(mixer, 'Group 2 bus')).toContainText('→ Group 1')
  await expect(strip(mixer, 'Lead channel')).toContainText('→ Group 2')

  await openTracks(page)
  await dragTo(page, row(tree, 'Group 2, group of 1 track'), row(tree, 'Bass'), { position: { x: 40, y: 3 } })
  await openView(page, 'Mixer')
  await expect(strip(mixer, 'Group 2 bus')).toContainText('→ Master')
  await expect(strip(mixer, 'Group 1 bus')).toHaveCount(0)
})

test("a folder's M in the mixer mutes its members, whose M lights halfway", async ({ page }) => {
  await page.goto('/?starter')
  const tree = await openTracks(page)
  await fromMenu(page, tree, 'Lead', 'Group')
  const mixer = await openView(page, 'Mixer')
  const band = mixer.getByRole('group', { name: 'Group Group 1', exact: true })
  await band.getByRole('button', { name: 'Group 1 mute', exact: true }).click()
  await expect(band.getByRole('button', { name: 'Group 1 mute', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const leadMute = strip(mixer, 'Lead channel').getByRole('button', { name: 'Lead mute', exact: true })
  await expect(leadMute).toHaveAttribute('data-through-group', 'true')
  await expect(leadMute).toHaveAttribute('aria-pressed', 'false')
  await expect(strip(mixer, 'Bass channel').getByRole('button', { name: 'Bass mute', exact: true })).not.toHaveAttribute('data-through-group')
})

test("a bus fader learns a MIDI controller from its menu", async ({ page }) => {
  await installMidiPorts(page)
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('Test keyboard — connected')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()
  await leadInBus(page)
  const mixer = await openView(page, 'Mixer')
  const fader = mixer.getByRole('slider', { name: 'Group 1 fader', exact: true })
  await expect(fader).toHaveValue('1')
  await fader.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'MIDI learn', exact: true }).click()
  await sendMidi(page, [0xb0, 21, 127])
  await expect(page.getByRole('button', { name: 'Cancel MIDI learn' })).toHaveCount(0)
  await sendMidi(page, [0xb0, 21, 127])
  await sendMidi(page, [0xb0, 21, 64])
  await expect(fader).not.toHaveValue('1')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await expect(page.getByTestId('midi-mapping')).toContainText('Group 1 / volume')
})

/** Adds a node to the graph open in a view by searching the picker for it. */
const addNode = async (page: Page, view: Locator, name: string) => {
  await view.getByRole('button', { name: 'Add', exact: true }).click()
  const search = page.getByRole('combobox', { name: 'Add a node', exact: true })
  await search.fill(name)
  await search.press('Enter')
  await expect(view.locator('[data-node]', { hasText: name })).toHaveCount(1)
}

test("clicking a group's name selects it: Effects edits the bus, or offers one to a folder", async ({ page }) => {
  await page.goto('/?starter')
  const tree = await openTracks(page)
  await fromMenu(page, tree, 'Lead', 'Group')
  const session = await openView(page, 'Session')
  await session.getByRole('group', { name: 'Group Group 1', exact: true }).getByText('Group 1', { exact: true }).click()
  let effects = await openView(page, 'Effects')
  await expect(effects).toContainText('is a folder')
  await effects.getByRole('button', { name: 'Sum to a bus', exact: true }).click()
  const cards = effects.locator('[data-node]')
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: 'Group in' })).toHaveCount(1)
  await expect(cards.filter({ hasText: 'Track out' })).toHaveCount(1)
  await addNode(page, effects, 'Reverb')

  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await (await openView(page, 'Session')).getByRole('group', { name: 'Group Group 1', exact: true }).getByText('Group 1', { exact: true }).click()
  effects = await openView(page, 'Effects')
  await expect(effects.locator('[data-node]', { hasText: 'Reverb' })).toHaveCount(1)
  for (const view of ['Instrument', 'Notes', 'Clip'] as const) await expect(await openView(page, view)).toContainText('is a group')
})

test("the band's slider moves the bus fader, and a folder's M strikes its members through in the grid", async ({ page }) => {
  await page.goto('/?starter')
  const tree = await leadInBus(page)
  const session = await openView(page, 'Session')
  await session.getByRole('slider', { name: 'Group 1 volume', exact: true }).fill('0.5')
  const mixer = await openView(page, 'Mixer')
  await expect(mixer.getByRole('slider', { name: 'Group 1 fader', exact: true })).toHaveValue('0.5')

  await fromMenu(page, tree, 'Pad', 'Group')
  await openView(page, 'Mixer')
  await mixer.getByRole('group', { name: 'Group Group 2', exact: true }).getByRole('button', { name: 'Group 2 mute', exact: true }).click()
  await openView(page, 'Session')
  await expect(session.getByRole('button', { name: 'Pad', exact: true })).toHaveCSS('text-decoration-line', 'line-through')
  await expect(session.getByRole('group', { name: 'Group Group 2', exact: true }).getByText('Group 2', { exact: true })).toHaveCSS('text-decoration-line', 'line-through')
  await expect(session.getByRole('button', { name: 'Lead', exact: true })).not.toHaveCSS('text-decoration-line', 'line-through')
})

test('the Tracks view tags a bus, and refuses a move that would make the mix loop', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Add track', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Return track', exact: true }).click()
  // Bass takes audio from the return, and Lead's bus sends to it: Bass in that bus would loop.
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  const effects = await openView(page, 'Effects')
  await addNode(page, effects, 'Track audio')
  await effects.locator('[data-node]', { hasText: 'Track audio' }).click()
  await effects.getByLabel('Take audio from track', { exact: true }).selectOption({ label: 'Return A' })
  const tree = await leadInBus(page)
  await expect(row(tree, 'Group 1, group of 1 track')).toContainText('bus')
  await expect(row(tree, 'Lead')).not.toContainText('bus')
  await openView(page, 'Mixer')
  await page.getByRole('slider', { name: 'Group 1 send to Return A', exact: true }).fill('0.5')

  await openTracks(page)
  await dragTo(page, row(tree, 'Bass'), row(tree, 'Group 1, group of 1 track'), {
    whileOver: async () => expect(row(tree, 'Group 1, group of 1 track')).toHaveAttribute('data-drop', 'refuse'),
  })
  await expect(row(tree, 'Group 1, group of 1 track')).toBeVisible()
  await row(tree, 'Bass').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to group', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Group 1', exact: true })).toBeDisabled()
})
