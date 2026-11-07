import type { Locator, Page } from '@playwright/test'
import { test, expect, openView, viewRoot } from '../support/fixtures'
import { at, drag, openMarked } from '../support/marked-sample'

/*
 * The Wave editor's second pane (round 11c, part 3): the same sample at its own place, or another sample, with copy in
 * one and paste in the other. Tall enough that the panes keep their status bars.
 */
test.use({ viewport: { width: 1400, height: 1200 } })

/** Turns the second pane on from *View ▾*; returns both panes. */
const split = async (page: Page, wave: Locator) => {
  await wave.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Second pane', exact: true }).click()
  const first = wave.getByTestId('wave-pane-main')
  const second = wave.getByTestId('wave-pane-second')
  await expect(second.getByRole('img', { name: 'Left', exact: true })).toBeVisible()
  return { first, second }
}

/** The view's box in a pane's overview: its width is how much of the sample the pane shows. */
const shown = async (pane: Locator) => (await pane.getByRole('scrollbar', { name: 'Waveform position' }).locator('div').boundingBox())!.width

/** Picks a sample in a pane's title menu. */
const pick = async (page: Page, pane: Locator, name: string) => {
  await pane.getByRole('button', { name: /pane's sample:/ }).click()
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click()
}

const addDemoSamples = async (page: Page) => {
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.getByRole('listitem').filter({ hasText: 'Demo Kick' }).locator('[data-status="ready"]')).toHaveCount(1)
}

test('the second pane shows the first pane\'s sample at its own zoom; another sample copies from it into the first, with one undo', async ({ page }) => {
  const { wave, saved } = await openMarked(page)
  const { first, second } = await split(page, wave)
  await expect(second.getByRole('button', { name: "Second pane's sample: Marked", exact: true })).toBeVisible()

  // Zooming in the second leaves the first as it was.
  const before = await shown(first)
  const point = await at(second.getByTestId('wave-detail'), 0.5)
  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -600)
  await page.keyboard.up('Control')
  await expect.poll(() => shown(second)).toBeLessThan(before / 2)
  expect(await shown(first)).toBeCloseTo(before, 0)

  // Another sample in the second pane: copy a part of it, paste it at the first pane's cursor.
  await addDemoSamples(page)
  await pick(page, second, 'Demo Pluck C4')
  await expect(second.getByRole('button', { name: "Second pane's sample: Demo Pluck C4", exact: true })).toBeVisible()
  const source = second.getByTestId('wave-detail')
  await drag(page, source, 0.2, 0.6)
  await expect(second.getByTestId('wave-status')).toContainText('Selection')
  await page.keyboard.press('ControlOrMeta+c')
  const target = await at(first.getByTestId('wave-detail'), 0.5)
  await page.mouse.click(target.x, target.y)
  await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(async () => (await saved())?.durationSeconds).toBeGreaterThan(4)
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(async () => (await saved())?.durationSeconds).toBe(4)
})

test('a delete in the first pane moves the second along on the same sample, and ▶ plays the active pane\'s sample', async ({ page }) => {
  const { wave, saved } = await openMarked(page)
  const { first, second } = await split(page, wave)
  const later = await at(second.getByTestId('wave-detail'), 0.8)
  await page.mouse.click(later.x, later.y)
  await expect(second.getByTestId('wave-status')).toHaveText(/^Cursor 0:03\./)
  const cursorOf = async () => Number((await second.getByTestId('wave-status').textContent())!.match(/0:(\d+\.\d+)/)![1])
  const was = await cursorOf()

  // A second deleted before it moves the second pane's cursor a second left.
  await drag(page, first.getByTestId('wave-detail'), 0.1, 0.35)
  await first.getByTestId('wave-detail').press('Delete')
  await expect.poll(async () => (await saved())?.durationSeconds).toBeLessThan(4)
  const removed = 4 - (await saved())!.durationSeconds
  await expect.poll(cursorOf).toBeCloseTo(was - removed, 2)

  // ▶ plays what the active pane shows: the second, on another sample, then the first.
  await addDemoSamples(page)
  await pick(page, second, 'Demo Drum Loop 120 BPM')
  const inSecond = await at(second.getByTestId('wave-detail'), 0.1)
  await page.mouse.click(inSecond.x, inSecond.y)
  const play = wave.getByRole('group', { name: 'Preview' }).getByRole('button').first()
  await play.click()
  await expect(second.getByTestId('wave-playhead')).toBeVisible()
  await expect(first.getByTestId('wave-playhead')).toHaveCount(0)
  await play.click()
  const inFirst = await at(first.getByTestId('wave-detail'), 0.1)
  await page.mouse.click(inFirst.x, inFirst.y)
  await play.click()
  await expect(first.getByTestId('wave-playhead')).toBeVisible()
  await expect(second.getByTestId('wave-playhead')).toHaveCount(0)
  await play.click()
})

test('the splitter drags, takes ↑ and ↓ and a double-click; the pane, its sample and its share come back after a reload', async ({ page }) => {
  const { wave } = await openMarked(page)
  const { second } = await split(page, wave)
  const splitter = wave.getByRole('separator', { name: 'Resize the panes', exact: true })
  await expect(splitter).toHaveAttribute('aria-valuenow', '50')
  await splitter.focus()
  await page.keyboard.press('ArrowUp')
  await expect(splitter).toHaveAttribute('aria-valuenow', '45')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(splitter).toHaveAttribute('aria-valuenow', '55')
  await splitter.dblclick()
  await expect(splitter).toHaveAttribute('aria-valuenow', '50')

  // Dragged down, the first pane grows.
  const firstHeight = (await wave.getByTestId('wave-pane-main').boundingBox())!.height
  const bar = (await splitter.boundingBox())!
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 2)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 82, { steps: 5 })
  await page.mouse.up()
  expect((await wave.getByTestId('wave-pane-main').boundingBox())!.height).toBeGreaterThan(firstHeight + 60)
  const share = await splitter.getAttribute('aria-valuenow')

  await addDemoSamples(page)
  await pick(page, second, 'Demo Kick')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sfxlab:wave-second-pane'))).toContain('"open":true')
  // The project is saved by then; open it again rather than the starter, and the same sample from Samples.
  await page.goto('/')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('listitem').filter({ hasText: 'Marked' }).getByRole('button', { name: 'Edit Marked', exact: true }).click()
  const again = viewRoot(page, 'Wave editor')
  await expect(again.getByTestId('wave-pane-second').getByRole('button', { name: "Second pane's sample: Demo Kick", exact: true })).toBeVisible()
  await expect(again.getByRole('separator', { name: 'Resize the panes', exact: true })).toHaveAttribute('aria-valuenow', share!)

  // × closes it, and it stays closed.
  await again.getByRole('button', { name: 'Close the second pane', exact: true }).click()
  await expect(again.getByTestId('wave-pane-second')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sfxlab:wave-second-pane'))).toContain('"open":false')
})
