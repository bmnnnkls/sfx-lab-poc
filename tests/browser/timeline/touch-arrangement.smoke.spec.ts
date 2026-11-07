import type { Page } from '@playwright/test'
import { test, expect, openView } from '../support/fixtures'

/* Touch recording into the arrangement's timeline lanes (round 12d). */

/** Groups Lead and makes the group sum to a bus, from the Tracks view. */
const leadInBus = async (page: Page) => {
  const tree = (await openView(page, 'Tracks')).getByRole('tree', { name: 'Tracks' })
  for (const [row, entry] of [['Lead', 'Group'], ['Group 1, group of 1 track', 'Sum to a bus']] as const) {
    await tree.getByRole('treeitem', { name: row, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: entry, exact: true }).click()
  }
}

/** Holds a slider and moves it by (dx, dy) of its size, holding long enough to span some beats. */
const drag = async (page: Page, slider: ReturnType<Page['getByRole']>, dx: number, dy: number) => {
  const box = (await slider.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * (0.5 + dx), box.y + box.height * (0.5 + dy), { steps: 8 })
}

/** The box of each locator, to compare before and after. */
const boxes = (locators: ReturnType<Page['locator']>[]) => Promise.all(locators.map((locator) => locator.boundingBox()))

test('arming Touch moves and resizes nothing: a mixer strip, the master, a session track header and their controls stay put', async ({ page }) => {
  await page.goto('/?starter')
  const mixer = await openView(page, 'Mixer')
  const session = await openView(page, 'Session')
  const volume = session.getByRole('slider', { name: 'Lead volume', exact: true })
  const watched = [
    mixer.getByRole('region', { name: 'Lead channel', exact: true }), mixer.getByRole('slider', { name: 'Lead pan', exact: true }), mixer.getByRole('slider', { name: 'Lead fader', exact: true }),
    mixer.getByRole('region', { name: 'Master channel', exact: true }), mixer.getByRole('slider', { name: 'Master fader', exact: true }),
    volume, volume.locator('..'),
  ]
  const before = await boxes(watched)
  expect(before.every(Boolean)).toBe(true)
  const touch = page.getByRole('button', { name: 'Arm Touch automation', exact: true })
  await touch.click()
  // Armed with nothing playing, every automatable control has no destination: its mark is there, the layout is not.
  const marks = page.getByLabel('Touch unavailable: no active destination', { exact: true })
  await expect(mixer.getByLabel('Touch unavailable: no active destination', { exact: true }).first()).toBeAttached()
  await expect(session.getByLabel('Touch unavailable: no active destination', { exact: true }).first()).toBeAttached()
  expect(await boxes(watched)).toEqual(before)
  await touch.click()
  await expect(marks).toHaveCount(0)
  expect(await boxes(watched)).toEqual(before)
})

test("Touch while the arrangement plays records a track's knob and a bus's fader into their timeline lanes, a take an undo step", async ({ page }, info) => {
  await page.goto('/?starter')
  await leadInBus(page)
  const arrangement = await openView(page, 'Arrangement')
  const mixer = await openView(page, 'Mixer')
  const touch = page.getByRole('button', { name: 'Arm Touch automation', exact: true })
  await expect(touch).toHaveAttribute('title', /or into the timeline while the arrangement plays/)
  await touch.click()
  const bus = mixer.getByRole('region', { name: 'Group 1 bus', exact: true })
  const unavailable = bus.getByLabel('Touch unavailable: no active destination', { exact: true })
  await expect(unavailable.first()).toHaveAttribute('title', 'Play a clip, an automation slot or the arrangement to record controls')

  // Playing the arrangement gives every owner a destination: its timeline.
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect(unavailable).toHaveCount(0)

  // A track's pan knob, held: "Touch → timeline" while it records, its lane opened under Lead once saved.
  const pan = mixer.getByRole('slider', { name: 'Lead pan', exact: true })
  await drag(page, pan, 0.4, 0)
  await expect(page.getByText('Touch → timeline', { exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  await page.mouse.up()
  await expect(page.getByText(/^Touch take saved to the timeline/)).toBeVisible()
  const panLane = arrangement.getByRole('application', { name: 'Mixer / pan lane', exact: true })
  await expect(panLane).toHaveAttribute('data-beats', /\d/)
  await expect(arrangement.getByRole('button', { name: 'Hide automation lanes of Lead', exact: true })).toBeVisible()

  // The bus's fader, the same way.
  await drag(page, bus.getByRole('slider', { name: 'Group 1 fader', exact: true }), 0, 0.3)
  await page.waitForTimeout(500)
  await page.mouse.up()
  const faderLane = arrangement.getByRole('application', { name: 'Mixer / volume lane', exact: true })
  await expect(faderLane).toHaveAttribute('data-beats', /\d/)
  await expect(arrangement.getByRole('button', { name: 'Hide automation lanes of Group 1', exact: true })).toBeVisible()

  // A second take on the pan: its lane's header shows ● while it records.
  await drag(page, pan, -0.4, 0)
  const recording = arrangement.locator('[data-timeline-lane]').getByLabel('Touch recording', { exact: true })
  await expect(recording).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('touch-arrangement.png') })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await expect(recording).toHaveCount(0)
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()

  // Each take is one undo step; the lanes stay open.
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await undo.click()
  await expect(panLane).toHaveCount(1)
  await expect(faderLane).toHaveCount(1)
  await undo.click()
  await expect(faderLane).toHaveCount(0)
  await expect(panLane).toHaveCount(1)
  await undo.click()
  await expect(panLane).toHaveCount(0)
  await expect(arrangement.getByRole('button', { name: 'Hide automation lanes of Lead', exact: true })).toBeVisible()
})
