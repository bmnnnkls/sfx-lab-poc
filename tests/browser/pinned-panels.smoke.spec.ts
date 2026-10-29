import type { Locator, Page } from '@playwright/test'
import { expect, expectSaved, openView, test, viewRoot } from './fixtures'

/** Runs a menu entry on what `target` is, through a submenu when given more than one entry. */
const fromMenu = async (page: Page, target: Locator, ...entries: string[]) => {
  await target.click({ button: 'right' })
  for (const entry of entries) await page.getByRole('menuitem', { name: entry, exact: true }).click()
}

const pinnedView = (page: Page) => viewRoot(page, 'Pinned')
const pin = (page: Page, title: string) => pinnedView(page).getByRole('region', { name: title, exact: true })
/** The pins' titles, top to bottom. */
const pinTitles = (page: Page) => pinnedView(page).locator('section[aria-label]').evaluateAll((sections) => sections.map((section) => section.getAttribute('aria-label')))

const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true }).click()

/**
 * The starter with Lead selected and an L knob and a switch added to its instrument panel with *Edit panel*. Returns
 * the Session view and the new knob's cell id.
 */
const leadWithControls = async (page: Page) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Lead', exact: true }).click()
  const instrument = await openView(page, 'Instrument')
  await instrument.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Panel', exact: true }).click()
  await instrument.getByRole('button', { name: 'Edit panel', exact: true }).click()
  const cells = instrument.locator('[data-testid^="control-"]')
  const ids = () => cells.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')!))
  const before = await ids()
  const form = instrument.getByRole('form', { name: 'Add a control' })
  await form.getByLabel('Control type', { exact: true }).selectOption('knob')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(cells).toHaveCount(before.length + 1)
  const knob = (await ids()).find((id) => !before.includes(id))!
  // S, then M, then L.
  const resize = instrument.getByTestId(knob).locator('[aria-label^="Resize "]')
  await resize.click()
  await resize.click()
  await expect(resize).toHaveText('L')
  await form.getByLabel('Control type', { exact: true }).selectOption('switch')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(cells).toHaveCount(before.length + 2)
  await instrument.getByRole('button', { name: 'Done', exact: true }).click()
  return { session, instrument, knob }
}

test("a pinned panel is the editor's panel: same knob, one undo, MIDI learn, and wide controls fit", async ({ page }) => {
  const { session, instrument, knob } = await leadWithControls(page)
  await fromMenu(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Pin panel', 'Instrument')
  const lead = pin(page, 'Lead instrument')
  await expect(lead).toBeVisible()
  await expect(lead.getByRole('slider')).not.toHaveCount(0)
  await expect(lead.getByRole('switch')).toHaveCount(1)
  await expect(pinnedView(page).getByRole('button', { name: 'Edit panel', exact: true })).toHaveCount(0)

  const pinnedKnob = lead.getByTestId(knob).getByRole('slider')
  const editorKnob = instrument.getByTestId(knob).getByRole('slider')
  const initial = await editorKnob.getAttribute('aria-valuetext')
  // One key press is one gesture, so one undo step.
  await pinnedKnob.focus()
  await page.keyboard.press('ArrowUp')
  await expect(editorKnob).not.toHaveAttribute('aria-valuetext', initial!)
  await expect(pinnedKnob).toHaveAttribute('aria-valuetext', (await editorKnob.getAttribute('aria-valuetext'))!)
  await undo(page)
  await expect(editorKnob).toHaveAttribute('aria-valuetext', initial!)
  await expect(pinnedKnob).toHaveAttribute('aria-valuetext', initial!)

  // The L knob takes the two columns a 300 px sidebar has: nothing scrolls sideways.
  const board = lead.getByRole('group', { name: 'Front panel', exact: true })
  expect(await board.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  await pinnedKnob.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'MIDI learn', exact: true })).toBeVisible()
})

test("the editor's Pin toggle pins and unpins; pins move, collapse and survive a reload", async ({ page }) => {
  const { session } = await leadWithControls(page)
  await fromMenu(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Pin panel', 'Instrument')
  const effects = await openView(page, 'Effects')
  const toggle = effects.getByRole('button', { name: 'Pin', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => pinTitles(page)).toEqual(['Lead instrument', 'Lead effects'])
  await pinnedView(page).getByRole('button', { name: 'Unpin Lead effects', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => pinTitles(page)).toEqual(['Lead instrument'])

  await toggle.click()
  await fromMenu(page, pin(page, 'Lead effects').locator('header'), 'Move up')
  await expect.poll(() => pinTitles(page)).toEqual(['Lead effects', 'Lead instrument'])
  await fromMenu(page, pin(page, 'Lead instrument').locator('header'), 'Collapse')
  await expect(pin(page, 'Lead instrument').getByRole('group', { name: 'Front panel', exact: true })).toHaveCount(0)
  await expect(pin(page, 'Lead instrument').getByRole('button', { name: 'Expand Lead instrument', exact: true })).toBeVisible()

  await expectSaved(page)
  await page.reload()
  await openView(page, 'Pinned')
  await expect.poll(() => pinTitles(page)).toEqual(['Lead effects', 'Lead instrument'])
  await expect(pin(page, 'Lead instrument').getByRole('group', { name: 'Front panel', exact: true })).toHaveCount(0)
})

test("a removed track's pins go and come back with undo; Open shows the editor", async ({ page }) => {
  const { session } = await leadWithControls(page)
  await fromMenu(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Pin panel', 'Instrument')
  await fromMenu(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Pin panel', 'Notes')
  await expect.poll(() => pinTitles(page)).toEqual(['Lead instrument', 'Lead notes'])

  await fromMenu(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Delete')
  await expect.poll(() => pinTitles(page)).toEqual([])
  await undo(page)
  await expect.poll(() => pinTitles(page)).toEqual(['Lead instrument', 'Lead notes'])

  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  await pin(page, 'Lead instrument').getByRole('button', { name: 'Open', exact: true }).click()
  const instrument = viewRoot(page, 'Instrument')
  await expect(instrument).toBeVisible()
  await expect(instrument.getByText('Lead', { exact: true })).toBeVisible()
})

test("a bus's and the master's effects pin from their menus; Remove bus hides the bus's pin until undo", async ({ page }) => {
  await page.goto('/?starter')
  const tree = (await openView(page, 'Tracks')).getByRole('tree', { name: 'Tracks' })
  await fromMenu(page, tree.getByRole('treeitem', { name: 'Lead', exact: true }), 'Group')
  const group = tree.getByRole('treeitem', { name: 'Group 1, group of 1 track', exact: true })
  await fromMenu(page, group, 'Sum to a bus')
  await fromMenu(page, group, 'Pin effects panel')
  await expect(pin(page, 'Group 1 effects')).toBeVisible()
  await fromMenu(page, group, 'Remove bus')
  await expect(pin(page, 'Group 1 effects')).toHaveCount(0)
  await undo(page)
  await expect(pin(page, 'Group 1 effects')).toBeVisible()

  const mixer = await openView(page, 'Mixer')
  await fromMenu(page, mixer.getByRole('region', { name: 'Master channel', exact: true }).getByText('Master', { exact: true }), 'Pin effects panel')
  await expect.poll(() => pinTitles(page)).toEqual(['Group 1 effects', 'Master effects'])
})

test("Pinned's empty state pins the selected track's panels", async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Bass', exact: true }).click()
  const pinned = await openView(page, 'Pinned')
  await expect(pinned.getByText(/Nothing is pinned/)).toBeVisible()
  for (const name of ['Pin Bass instrument', 'Pin Bass effects', 'Pin Bass notes']) await expect(pinned.getByRole('button', { name, exact: true })).toBeVisible()
  await pinned.getByRole('button', { name: 'Pin Bass effects', exact: true }).click()
  await expect(pin(page, 'Bass effects')).toBeVisible()
  await expect(pinned.getByText(/Nothing is pinned/)).toHaveCount(0)
})
