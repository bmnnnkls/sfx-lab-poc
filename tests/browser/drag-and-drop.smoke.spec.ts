import type { Locator, Page } from '@playwright/test'
import { test, expect, dragTo, dragView, openView, viewRoot } from './fixtures'

test('a view tab dragged across the session grid docks as before and changes no slot', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const slots = async () => session.locator('button[aria-label^="Edit "]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  const before = await slots()
  await openView(page, 'Mixer')
  await dragView(page, 'Mixer', 'Session', 'right')
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
  await expect(session).toBeVisible()
  expect(await slots()).toEqual(before)
  await expect(session.locator('[data-drop]')).toHaveCount(0)
})

test("the panel's controls still reorder by dragging their handle in edit mode", async ({ page }) => {
  await page.goto('/?starter')
  const instrument = await openView(page, 'Instrument')
  await instrument.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Panel', exact: true }).click()
  await instrument.getByRole('button', { name: 'Edit panel', exact: true }).click()
  const form = instrument.getByRole('form', { name: 'Add a control' })
  await form.getByLabel('Control type', { exact: true }).selectOption('knob')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await form.getByLabel('Control type', { exact: true }).selectOption('switch')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  const handles = instrument.getByRole('group', { name: 'Front panel' }).locator('[aria-label^="Drag "]')
  const order = () => handles.evaluateAll((spans) => spans.map((span) => span.getAttribute('aria-label')))
  await expect(handles).toHaveCount(2)
  const [first, second] = await order()
  const cells = instrument.locator('[data-testid^="control-"]')
  await handles.nth(1).dragTo(cells.first())
  await expect.poll(order).toEqual([second, first])
})

test('audio files dropped on Samples are still imported', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.evaluate((root) => {
    // A short silent WAV, built in the page: 8 kHz, 16-bit mono, 800 frames.
    const frames = 800, bytes = new DataView(new ArrayBuffer(44 + frames * 2))
    const text = (at: number, value: string) => [...value].forEach((char, i) => bytes.setUint8(at + i, char.charCodeAt(0)))
    text(0, 'RIFF'); bytes.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true); bytes.setUint32(24, 8000, true)
    bytes.setUint32(28, 16000, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); text(36, 'data'); bytes.setUint32(40, frames * 2, true)
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes.buffer], 'Dropped.wav', { type: 'audio/wav' }))
    const target = root.querySelector('ul, p') ?? root
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect(samples.getByText('Dropped', { exact: true })).toBeVisible()
})

/** Session above Arrangement: they share a tab group in the default layout. */
const sideBySide = async (page: Page) => {
  await page.goto('/?starter')
  await openView(page, 'Arrangement')
  await dragView(page, 'Session', 'Arrangement', 'top')
  await expect(viewRoot(page, 'Session')).toBeVisible()
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  return { session: viewRoot(page, 'Session'), arrangement: viewRoot(page, 'Arrangement') }
}

/** A cell of the session grid, by track and scene: a header row comes first, and every row has the tracks, the master's cell and one more. */
const slotOf = (session: Locator, tracks: number, track: number, scene: number) =>
  session.locator('[data-scroll="both"] > div > *').nth((tracks + 2) * (scene + 1) + track)

const BEAT_PX = 24
const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true }).click()

test('a session slot dragged onto a lane makes a region at the beat under the pointer, on lanes of its kind', async ({ page }) => {
  const { session, arrangement } = await sideBySide(page)
  const root = session.getByRole('button', { name: '▶ Root', exact: true })
  const lanes = arrangement.locator('[data-lane]')
  const regions = arrangement.getByTestId('arrangement-region')
  // Bar 3 is beat 8.
  await dragTo(page, root, lanes.nth(0), { position: { x: 8 * BEAT_PX + 1, y: 20 }, whileOver: () => expect(lanes.nth(0).locator('xpath=..')).toHaveAttribute('data-drop', 'accept') })
  await expect(regions).toHaveCount(1)
  expect(await regions.first().evaluate((region) => (region as HTMLElement).style.left)).toBe(`${8 * BEAT_PX}px`)
  // On its own track it keeps its source, so the region opens it.
  await regions.first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Edit clip', exact: true })).not.toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')

  await dragTo(page, root, lanes.nth(1), { position: { x: 4 * BEAT_PX + 1, y: 20 } })
  await expect(lanes.nth(1).locator('xpath=..').getByTestId('arrangement-region')).toHaveCount(1)

  await session.getByRole('button', { name: 'Add track', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Audio track', exact: true }).click()
  await expect(lanes).toHaveCount(4)
  await dragTo(page, root, lanes.nth(3), { position: { x: 40, y: 20 }, whileOver: () => expect(lanes.nth(3).locator('xpath=..')).toHaveAttribute('data-drop', 'refuse') })
  await expect(regions).toHaveCount(2)
  await expect(arrangement.locator('[data-drop]')).toHaveCount(0)
})

test('a session slot dragged onto an empty slot moves it, and copies it with Alt; occupied slots and other kinds refuse', async ({ page }) => {
  const { session } = await sideBySide(page)
  const slot = (track: number, scene: number) => slotOf(session, 3, track, scene)
  const root = session.getByRole('button', { name: '▶ Root', exact: true })
  await expect(slot(0, 0)).toContainText('Root')

  await dragTo(page, root, slot(1, 1))
  await expect(slot(1, 1)).toContainText('Root')
  await expect(slot(0, 0).getByRole('button', { name: 'Create clip', exact: true })).toBeVisible()
  await undo(page)
  await expect(slot(0, 0)).toContainText('Root')
  await expect(slot(1, 1).getByRole('button', { name: 'Create clip', exact: true })).toBeVisible()

  await dragTo(page, root, slot(1, 1), { alt: true })
  await expect(slot(1, 1)).toContainText('Root')
  await expect(slot(0, 0)).toContainText('Root')
  await undo(page)
  await expect(slot(1, 1).getByRole('button', { name: 'Create clip', exact: true })).toBeVisible()

  // Lead's first slot holds Arp.
  await dragTo(page, root, slot(1, 0), { whileOver: () => expect(slot(1, 0)).toHaveAttribute('data-drop', 'refuse') })
  await expect(slot(1, 0)).toContainText('Arp')
  await expect(slot(0, 0)).toContainText('Root')

  await session.getByRole('button', { name: 'Add track', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Audio track', exact: true }).click()
  const audio = slotOf(session, 4, 3, 1)
  await expect(audio.getByRole('button', { name: 'Add audio clip', exact: true })).toBeVisible()
  await dragTo(page, root, audio, { whileOver: () => expect(audio).toHaveAttribute('data-drop', 'refuse') })
  await expect(audio.getByRole('button', { name: 'Add audio clip', exact: true })).toBeVisible()
  await expect(slotOf(session, 4, 0, 0)).toContainText('Root')
  await expect(session.locator('[data-drop]')).toHaveCount(0)
})

test('in the default layout, a slot held on the Arrangement tab shows Arrangement and lands on a lane, though Session is hidden', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const arrangement = viewRoot(page, 'Arrangement')
  await expect(arrangement).toBeHidden()
  // The source's view is hidden mid-drag; the drag goes on.
  await dragTo(page, session.getByRole('button', { name: '▶ Root', exact: true }), arrangement.locator('[data-lane]').first(), {
    hold: page.getByRole('tab', { name: 'Arrangement', exact: true }),
    position: { x: 4 * BEAT_PX + 1, y: 20 },
    whileOver: () => expect(session).toBeHidden(),
  })
  await expect(arrangement.getByTestId('arrangement-region')).toHaveCount(1)
  await expect(page.locator('[data-drop]')).toHaveCount(0)

  // The activity bar's buttons spring-load too.
  await openView(page, 'Session')
  await dragTo(page, session.getByRole('button', { name: '▶ Walk', exact: true }), arrangement.locator('[data-lane]').first(), {
    hold: page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Arrangement', exact: true }),
    position: { x: 12 * BEAT_PX + 1, y: 20 },
  })
  await expect(arrangement.getByTestId('arrangement-region')).toHaveCount(2)
})

test('a slot passing over a tab without resting there leaves the view as it was', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const tab = (await page.getByRole('tab', { name: 'Arrangement', exact: true }).boundingBox())!
  const from = (await session.getByRole('button', { name: '▶ Root', exact: true }).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2, { steps: 10 })
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 40, { steps: 5 })
  await page.waitForTimeout(700)
  await page.mouse.up()
  await expect(session).toBeVisible()
  await expect(viewRoot(page, 'Arrangement')).toBeHidden()
})

test('a sample row drags onto an empty audio slot, an audio lane and an instrument canvas', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5)
  const row = samples.getByRole('listitem').first()
  const name = (await row.locator('strong').textContent())!
  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Add track', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Audio track', exact: true }).click()

  // A clip of it in the slot, opened in Clip, as the slot's Add audio clip does.
  const audio = slotOf(session, 4, 3, 0)
  await dragTo(page, row, audio)
  await expect(audio).toContainText(name)
  await expect(viewRoot(page, 'Clip')).toBeVisible()
  await expect(slotOf(session, 4, 0, 2).getByRole('button', { name: 'Create clip', exact: true })).toBeVisible()
  await dragTo(page, row, slotOf(session, 4, 0, 2), { whileOver: () => expect(slotOf(session, 4, 0, 2)).toHaveAttribute('data-drop', 'refuse') })

  const arrangement = viewRoot(page, 'Arrangement')
  const lane = arrangement.locator('[data-lane]').nth(3)
  await dragTo(page, row, lane, { hold: page.getByRole('tab', { name: 'Arrangement', exact: true }), position: { x: 4 * BEAT_PX + 1, y: 20 } })
  await expect(lane.locator('xpath=..').getByTestId('arrangement-region')).toContainText(name)

  // A sampler playing it, on the selected track's instrument where it was dropped.
  // The audio clip selected its track; Bass has an instrument.
  await (await openView(page, 'Session')).getByRole('button', { name: 'Bass', exact: true }).click()
  const instrument = await openView(page, 'Instrument')
  const samplers = instrument.locator('[data-node]', { hasText: 'Sampler' })
  await expect(samplers).toHaveCount(0)
  const viewport = instrument.getByTestId('graph-viewport')
  const box = (await viewport.boundingBox())!
  await dragTo(page, row, viewport, { position: { x: box.width - 120, y: box.height - 80 } })
  await expect(samplers).toHaveCount(1)
  await samplers.locator('[data-header]').dblclick()
  await expect(instrument.getByLabel('Sample', { exact: true }).locator('option:checked')).toHaveText(name)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(samplers).toHaveCount(0)
})
