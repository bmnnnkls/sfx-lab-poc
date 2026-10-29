import type { Locator, Page } from '@playwright/test'
import { dragTo, expect, openView, test } from './fixtures'
import { installMidiPorts, sendMidi } from './midi-ports'

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
