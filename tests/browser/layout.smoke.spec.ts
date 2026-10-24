import { test, expect, dragView, dragViewToSidebar, openView, tabStrip, viewRoot } from './fixtures'

test('a view keeps its state while another view is shown', async ({ page }) => {
  await page.goto('/?starter')
  const sounds = await openView(page, 'Sounds')
  await sounds.getByLabel('Sound name', { exact: true }).fill('Kept while hidden')
  await openView(page, 'Mixer')
  await expect(sounds).toBeHidden()
  await openView(page, 'Sounds')
  await expect(sounds.getByLabel('Sound name', { exact: true })).toHaveValue('Kept while hidden')
})

/** Choose an entry in the status bar's Layout menu. */
const layoutMenu = async (page: import('@playwright/test').Page, entry: string) => {
  await page.getByRole('contentinfo').getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByRole('menuitem', { name: entry, exact: true }).click()
  // The menu hands the focus back to its button as it closes.
  await expect(page.getByRole('menu')).toHaveCount(0)
}

/** Session and Mixer side by side: Mixer docked to the right of Session, both showing. */
const expectMixerBesideSession = async (page: import('@playwright/test').Page) => {
  const session = await viewRoot(page, 'Session').boundingBox()
  const mixer = await viewRoot(page, 'Mixer').boundingBox()
  expect(session && mixer && mixer.x).toBeGreaterThan(session!.x + session!.width - 10)
  await expect(viewRoot(page, 'Session')).toBeVisible()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
}

test('a view moved next to Session stays there after a reload, and Reset layout puts it back', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Mixer')
  await dragView(page, 'Mixer', 'Session', 'right')
  await expectMixerBesideSession(page)
  // The panel stays open on Mixer's neighbour.
  await expect(viewRoot(page, 'Samples')).toBeVisible()

  await expect.poll(() => page.evaluate(() => localStorage.getItem('sfxlab:layout'))).toContain('"mixer"')
  await page.reload()
  await expectMixerBesideSession(page)

  await layoutMenu(page, 'Reset layout')
  await expect(viewRoot(page, 'Mixer')).toBeHidden()
  await openView(page, 'Mixer')
  const panel = await viewRoot(page, 'Mixer').boundingBox()
  const session = await viewRoot(page, 'Session').boundingBox()
  expect(panel!.y).toBeGreaterThan(session!.y + session!.height - 10)
  await page.reload()
  await expect(viewRoot(page, 'Session')).toBeVisible()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
})

test('the panel remembers its view and the editor area its view across a reload', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Arrangement')
  await openView(page, 'Library')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sfxlab:layout'))).toContain('library')
  await page.reload()
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  await expect(viewRoot(page, 'Library')).toBeVisible()
})

test('the first layout takes the editor view and the panel height the old keys remembered', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('sfxlab:layout') !== null) return
    localStorage.setItem('sfxlab:main-view', JSON.stringify('arrangement'))
    localStorage.setItem('sfxlab:editor-height', JSON.stringify(300))
  })
  await page.goto('/?starter')
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  // 300 px become the panel's weight against 1000 px: 30 of 100.
  const instrument = await viewRoot(page, 'Instrument').boundingBox()
  expect(Math.round(instrument!.height)).toBeLessThanOrEqual(300)
  expect(Math.round(instrument!.height)).toBeGreaterThan(220)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sfxlab:layout'))).not.toBeNull()
})

for (const [name, saved] of [
  ['not JSON', '{"version":2,'],
  ['an unknown view', JSON.stringify({ version: 2, model: { layout: { type: 'row', children: [{ type: 'tabset', id: 'panel', children: [{ type: 'tab', id: 'tuner', component: 'view' }] }] } } })],
  ['another version', JSON.stringify({ version: 99, model: { layout: { type: 'row', children: [] } } })],
]) test(`a saved layout that is ${name} falls back to the default`, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('sfxlab:layout', value), saved)
  await page.goto('/?starter')
  await expect(viewRoot(page, 'Session')).toBeVisible()
  await expect(viewRoot(page, 'Instrument')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(11)
})

test("the toggles in the panel's strip hide and show the panel and each sidebar", async ({ page }) => {
  await page.goto('/?starter')
  const toggle = (name: string) => tabStrip(page, 'Instrument').getByRole('button', { name, exact: true })

  // Tab moves through the toggles rather than switching views.
  await toggle('Primary sidebar').focus()
  await page.keyboard.press('Tab')
  await expect(toggle('Panel')).toBeFocused()
  await expect(viewRoot(page, 'Session')).toBeVisible()

  await expect(toggle('Panel')).toHaveAttribute('aria-pressed', 'true')
  await toggle('Panel').click()
  await expect(toggle('Panel')).toHaveAttribute('aria-pressed', 'false')
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  // The panel collapses to its tab strip.
  await expect(page.getByRole('tab', { name: 'Instrument', exact: true })).toBeVisible()
  await toggle('Panel').click()
  await expect(viewRoot(page, 'Instrument')).toBeVisible()

  for (const [sidebar, name, view] of [['primary', 'Primary sidebar', 'Sounds'], ['secondary', 'Secondary sidebar', 'Mixer']] as const) {
    await expect(toggle(name)).toHaveAttribute('aria-pressed', 'false')
    await toggle(name).click()
    await expect(toggle(name)).toHaveAttribute('aria-pressed', 'true')
    await dragViewToSidebar(page, view, sidebar)
    await expect(viewRoot(page, view)).toBeVisible()
    await toggle(name).click()
    await expect(viewRoot(page, view)).toBeHidden()
    await toggle(name).click()
    await expect(viewRoot(page, view)).toBeVisible()
  }
  // The status bar's layout menu does the same.
  await layoutMenu(page, 'Hide panel')
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await expect(toggle('Panel')).toHaveAttribute('aria-pressed', 'false')
  await layoutMenu(page, 'Show panel')
  await expect(viewRoot(page, 'Instrument')).toBeVisible()
})

test('the activity bar has no region toggles or Reset layout any more', async ({ page }) => {
  await page.goto('/?starter')
  const bar = page.getByRole('navigation', { name: 'Views' })
  await expect(bar.getByRole('button', { name: 'Session', exact: true })).toBeVisible()
  for (const name of ['Primary sidebar', 'Panel', 'Secondary sidebar', 'Reset layout']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0)
})

test('F6 moves between tab groups, and Tab moves through the chrome without switching views', async ({ page }) => {
  await page.goto('/?starter')
  const session = page.getByRole('tab', { name: 'Session', exact: true })
  const instrument = page.getByRole('tab', { name: 'Instrument', exact: true })
  await viewRoot(page, 'Session').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('F6')
  await expect(instrument).toBeFocused()
  await page.keyboard.press('F6')
  await expect(session).toBeFocused()
  await page.keyboard.press('Shift+F6')
  await expect(instrument).toBeFocused()

  // On a tab, Tab leaves it as usual; elsewhere it still switches Session and Arrangement.
  await session.focus()
  await page.keyboard.press('Tab')
  await expect(session).not.toBeFocused()
  await expect(viewRoot(page, 'Session')).toBeVisible()
  await viewRoot(page, 'Session').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('Tab')
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  await expect(viewRoot(page, 'Session')).toBeHidden()
})

test('the sidebars run the full height, with the panel between them', async ({ page }) => {
  await page.goto('/?starter')
  await tabStrip(page, 'Instrument').getByRole('button', { name: 'Primary sidebar', exact: true }).click()
  await dragViewToSidebar(page, 'Sounds', 'primary')
  const sounds = await viewRoot(page, 'Sounds').boundingBox()
  const session = await viewRoot(page, 'Session').boundingBox()
  const instrument = await viewRoot(page, 'Instrument').boundingBox()
  const status = await page.getByRole('contentinfo').boundingBox()
  expect(sounds!.y).toBeLessThanOrEqual(session!.y)
  expect(sounds!.y + sounds!.height).toBeGreaterThanOrEqual(instrument!.y + instrument!.height - 1)
  expect(sounds!.y + sounds!.height).toBeLessThanOrEqual(status!.y)
  expect(instrument!.x).toBeGreaterThanOrEqual(sounds!.x + sounds!.width)
})

test("clicking the panel's open tab collapses it to its strip, and clicking again expands it", async ({ page }) => {
  await page.goto('/?starter')
  const tab = page.getByRole('tab', { name: 'Instrument', exact: true })
  const session = viewRoot(page, 'Session')
  const before = (await session.boundingBox())!.height
  await tab.click()
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await expect(tab).toBeVisible()
  await expect.poll(async () => (await session.boundingBox())!.height).toBeGreaterThan(before + 300)
  await tab.click()
  await expect(viewRoot(page, 'Instrument')).toBeVisible()
  await expect.poll(async () => Math.round((await session.boundingBox())!.height)).toBe(Math.round(before))

  // Another tab of a collapsed panel expands it on that tab; so does openView.
  await tab.click()
  await page.getByRole('tab', { name: 'Clip', exact: true }).click()
  await expect(viewRoot(page, 'Clip')).toBeVisible()
  await page.getByRole('tab', { name: 'Clip', exact: true }).click()
  await openView(page, 'Clip')
})

/** What round 2 saved: the panel as flexlayout's bottom border. */
const roundTwoLayout = (bottom: Record<string, unknown>) => JSON.stringify({
  version: 1,
  model: {
    global: {},
    borders: [
      {
        type: 'border', location: 'bottom', size: 300, ...bottom,
        children: ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library'].map((id) => ({ type: 'tab', id, component: 'view' })),
      },
      { type: 'border', location: 'left', show: false, selected: -1, children: [] },
      { type: 'border', location: 'right', show: false, selected: -1, children: [] },
    ],
    layout: { type: 'row', children: [{ type: 'tabset', id: 'editor', selected: 1, children: [
      { type: 'tab', id: 'session', component: 'view' }, { type: 'tab', id: 'arrangement', component: 'view' },
    ] }] },
  },
})

test("a round-2 layout loads with the panel's tabs, open tab and height kept, and is saved as version 2", async ({ page }) => {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('sfxlab:layout', value)
    sessionStorage.setItem('seeded', '1')
  }, roundTwoLayout({ show: true, selected: 4 }))
  await page.goto('/?starter')
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
  const tabs = await page.getByRole('tab').allTextContents()
  expect(tabs).toEqual(['Session', 'Arrangement', 'Wave editor', 'Instrument', 'Effects', 'Notes', 'Clip', 'Mixer', 'Samples', 'Sounds', 'Library'])
  const mixer = await viewRoot(page, 'Mixer').boundingBox()
  expect(mixer!.height).toBeGreaterThan(220)
  expect(mixer!.height).toBeLessThanOrEqual(300)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:layout')!).version)).toBe(2)
  await page.reload()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
})

test('a round-2 layout with the panel hidden loads with the panel collapsed', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('sfxlab:layout', value), roundTwoLayout({ show: false, selected: 0 }))
  await page.goto('/?starter')
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Instrument', exact: true })).toBeVisible()
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await openView(page, 'Instrument')
})

test('the editor area and the panel maximize inside the window, and restore', async ({ page }) => {
  await page.goto('/?starter')
  const session = viewRoot(page, 'Session')
  const instrument = viewRoot(page, 'Instrument')
  const panelToggle = tabStrip(page, 'Instrument').getByRole('button', { name: 'Panel', exact: true })
  const before = (await session.boundingBox())!.height

  await tabStrip(page, 'Session').getByRole('button', { name: 'Maximize', exact: true }).click()
  await expect(instrument).toBeHidden()
  await expect.poll(async () => (await session.boundingBox())!.height).toBeGreaterThan(before + 300)
  const restore = tabStrip(page, 'Session').getByRole('button', { name: 'Restore', exact: true })
  await expect(restore).toHaveAttribute('aria-pressed', 'true')
  await restore.click()
  await expect(instrument).toBeVisible()
  await expect(panelToggle).toHaveAttribute('aria-pressed', 'true')

  // With the panel's strip off screen, the layout menu shows the panel, restoring the editor area.
  await tabStrip(page, 'Session').getByRole('button', { name: 'Maximize', exact: true }).click()
  await expect(instrument).toBeHidden()
  await layoutMenu(page, 'Show panel')
  await expect(instrument).toBeVisible()
  await expect(session).toBeVisible()

  await tabStrip(page, 'Instrument').getByRole('button', { name: 'Maximize', exact: true }).click()
  await expect(session).toBeHidden()
  await expect.poll(async () => (await instrument.boundingBox())!.height).toBeGreaterThan(before + 300)
  // Showing a view elsewhere restores the layout.
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Session', exact: true }).click()
  await expect(session).toBeVisible()
  await expect(instrument).toBeVisible()

  // Double-clicking an empty part of a tab strip maximizes too, a collapsed panel included.
  await panelToggle.click()
  const strip = tabStrip(page, 'Instrument')
  const box = (await strip.boundingBox())!
  await strip.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(instrument).toBeVisible()
  await expect(session).toBeHidden()
  await strip.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(session).toBeVisible()
})
