import { test, expect, dragView, dragViewToSidebar, openView, tabStrip, viewRoot } from './fixtures'

test('a view keeps its state while it is hidden', async ({ page }) => {
  await page.goto('/?starter')
  const sounds = await openView(page, 'Sounds')
  // The status line is the view's own state.
  await sounds.getByRole('button', { name: 'Save snapshot', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(sounds.getByRole('status')).toHaveText('Saved Bass 1')
  // Clicking its open tab collapses the sidebar it is in.
  await page.getByRole('tab', { name: 'Sounds', exact: true }).click()
  await expect(sounds).toBeHidden()
  await openView(page, 'Sounds')
  await expect(sounds.getByRole('status')).toHaveText('Saved Bass 1')
})

test('Sounds starts in the secondary sidebar, collapsed, and opens 300 px wide', async ({ page }) => {
  await page.goto('/?starter')
  const toggle = tabStrip(page, 'Instrument').getByRole('button', { name: 'Secondary sidebar', exact: true })
  await expect(page.getByRole('tab', { name: 'Sounds', exact: true })).toBeVisible()
  await expect(viewRoot(page, 'Sounds')).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  const session = (await viewRoot(page, 'Session').boundingBox())!
  const sounds = (await (await openView(page, 'Sounds')).boundingBox())!
  expect(Math.round(sounds.width)).toBe(300)
  expect(sounds.x).toBeGreaterThan(session.x + session.width / 2)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
})

test('Pinned starts beside Sounds, and a layout saved without it gets it there', async ({ page }) => {
  await page.goto('/?starter')
  await expect(page.getByRole('tab', { name: 'Pinned', exact: true })).toBeVisible()
  await openView(page, 'Sounds')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sfxlab:layout'))).toContain('"pinned"')
  // As a layout saved before round 9 has it: no Pinned anywhere.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('sfxlab:layout')!)
    for (const border of stored.model.borders) border.children = border.children.filter((tab: { id: string }) => tab.id !== 'pinned')
    localStorage.setItem('sfxlab:layout', JSON.stringify(stored))
  })
  await page.reload()
  const session = (await viewRoot(page, 'Session').boundingBox())!
  const pinned = (await (await openView(page, 'Pinned')).boundingBox())!
  expect(pinned.x).toBeGreaterThan(session.x + session.width / 2)
  await expect(viewRoot(page, 'Pinned').getByText(/Nothing is pinned/)).toBeVisible()
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
  await expect(viewRoot(page, 'Clip')).toBeVisible()

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
  await expect(page.getByRole('tab')).toHaveCount(13)
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

  // The primary sidebar starts off and empty, the secondary collapsed on Sounds.
  for (const [sidebar, name, view] of [['primary', 'Primary sidebar', 'Library'], ['secondary', 'Secondary sidebar', 'Mixer']] as const) {
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
  // All the way to the strip, although the panel's views have minimum heights.
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
  // The round-2 layout kept Sounds in the panel; only the Wave editor is new here. Tracks went to the hidden primary
  // sidebar, which draws no tabs.
  expect(tabs).toEqual(['Session', 'Arrangement', 'Wave editor', 'Instrument', 'Effects', 'Notes', 'Clip', 'Mixer', 'Samples', 'Sounds', 'Library'])
  const mixer = await viewRoot(page, 'Mixer').boundingBox()
  expect(mixer!.height).toBeGreaterThan(220)
  expect(mixer!.height).toBeLessThanOrEqual(300)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:layout')!).version)).toBe(2)
  expect(await page.evaluate(() => localStorage.getItem('sfxlab:layout'))).toContain('"id":"tracks"')
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

  await tabStrip(page, 'Session').getByRole('button', { name: /^Maximize/ }).click()
  await expect(instrument).toBeHidden()
  await expect.poll(async () => (await session.boundingBox())!.height).toBeGreaterThan(before + 300)
  const restore = tabStrip(page, 'Session').getByRole('button', { name: /^Restore/ })
  await expect(restore).toHaveAttribute('aria-pressed', 'true')
  await restore.click()
  await expect(instrument).toBeVisible()
  await expect(panelToggle).toHaveAttribute('aria-pressed', 'true')

  // With the panel's strip off screen, the layout menu shows the panel, restoring the editor area.
  await tabStrip(page, 'Session').getByRole('button', { name: /^Maximize/ }).click()
  await expect(instrument).toBeHidden()
  await layoutMenu(page, 'Show panel')
  await expect(instrument).toBeVisible()
  await expect(session).toBeVisible()

  await tabStrip(page, 'Instrument').getByRole('button', { name: /^Maximize/ }).click()
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
  await strip.getByRole('button', { name: /^Restore/ }).click()
  await expect(session).toBeVisible()
})

test('the activity bar shows Session, Arrangement, the Wave editor, Library and Tracks wherever they are docked', async ({ page }) => {
  await page.goto('/?starter')
  const bar = page.getByRole('navigation', { name: 'Views' })
  const button = (name: string) => bar.getByRole('button', { name, exact: true })
  await expect(bar.getByRole('button')).toHaveText(['▦', '▤', '∿', '▥', '☰'])

  for (const [name, title] of [['Wave editor', 'Wave editor'], ['Tracks', 'Tracks'], ['Library', 'Library'], ['Arrangement', 'Arrangement']] as const) {
    await button(name).click()
    await expect(viewRoot(page, title)).toBeVisible()
  }
  // A view showing in the editor area or the panel stays on a second click.
  await button('Arrangement').click()
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()

  // Library starts in the primary sidebar: its button shows the sidebar, and hides it while the view shows.
  const primary = tabStrip(page, 'Instrument').getByRole('button', { name: 'Primary sidebar', exact: true })
  await expect(viewRoot(page, 'Library')).toBeVisible()
  await button('Library').click()
  await expect(viewRoot(page, 'Library')).toBeHidden()
  await expect(primary).toHaveAttribute('aria-pressed', 'false')
  await button('Library').click()
  await expect(viewRoot(page, 'Library')).toBeVisible()
  await expect(primary).toHaveAttribute('aria-pressed', 'true')

  // Docked in the panel, it stays on a second click.
  await dragView(page, 'Library', 'Instrument', 'center')
  await button('Library').click()
  await expect(viewRoot(page, 'Library')).toBeVisible()
  await button('Library').click()
  await expect(viewRoot(page, 'Library')).toBeVisible()
})

test('Samples and Library start in the primary sidebar, collapsed, and open 300 px wide', async ({ page }) => {
  await page.goto('/?starter')
  const primary = tabStrip(page, 'Instrument').getByRole('button', { name: 'Primary sidebar', exact: true })
  await expect(page.getByRole('tab', { name: 'Samples', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Library', exact: true })).toBeVisible()
  await expect(viewRoot(page, 'Samples')).toBeHidden()
  await expect(primary).toHaveAttribute('aria-pressed', 'false')
  const samples = (await (await openView(page, 'Samples')).boundingBox())!
  const session = (await viewRoot(page, 'Session').boundingBox())!
  expect(Math.round(samples.width)).toBe(300)
  expect(samples.x + samples.width).toBeLessThanOrEqual(session.x)
  await expect(primary).toHaveAttribute('aria-pressed', 'true')
  // The panel holds the editors and the Mixer.
  const panelTabs = tabStrip(page, 'Instrument').getByRole('tab')
  await expect(panelTabs).toHaveText(['Instrument', 'Effects', 'Notes', 'Clip', 'Mixer'])
})

test('a layout saved under a name loads again after changes and a reload, and can be deleted', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Mixer')
  await dragView(page, 'Mixer', 'Session', 'right')
  await expectMixerBesideSession(page)

  await layoutMenu(page, 'Save layout as…')
  const dialog = page.getByRole('dialog', { name: 'Save layout' })
  await dialog.getByLabel('Layout name', { exact: true }).fill('Mixing')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await layoutMenu(page, 'Reset layout')
  await openView(page, 'Mixer')
  expect((await viewRoot(page, 'Mixer').boundingBox())!.y).toBeGreaterThan((await viewRoot(page, 'Session').boundingBox())!.y + 100)
  await page.reload()
  await layoutMenu(page, 'Mixing')
  await expectMixerBesideSession(page)

  // The same name asks before replacing.
  await layoutMenu(page, 'Reset layout')
  await layoutMenu(page, 'Save layout as…')
  await dialog.getByLabel('Layout name', { exact: true }).fill('Mixing')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Replace it?')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await layoutMenu(page, 'Mixing')
  await expectMixerBesideSession(page)

  // Into the Delete… submenu with the keyboard (a jump of the mouse closes a submenu).
  await page.getByRole('contentinfo').getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete…', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menu').last().getByRole('menuitem', { name: 'Mixing', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('contentinfo').getByRole('button', { name: 'Layout', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Save layout as…', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Mixing', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Delete…', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sfxlab:layouts')!).layouts))).toEqual([])
})

test('the transport bar wraps at 1024 px instead of making the page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/?starter')
  await expect(viewRoot(page, 'Session')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024)
  for (const name of ['Play', 'Panic']) {
    const box = (await page.getByRole('button', { name, exact: true }).first().boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(1024)
  }
  expect((await page.getByLabel('Project name').boundingBox())!.width).toBeGreaterThanOrEqual(120)
})

test("a splitter stops at the views' minimum sizes, from the keyboard too", async ({ page }) => {
  await page.goto('/?starter')
  const splitter = page.getByRole('separator')
  await expect(splitter).toHaveCount(1)
  await splitter.focus()
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowUp')
  await expect.poll(async () => Math.round((await viewRoot(page, 'Session').boundingBox())!.height)).toBeGreaterThanOrEqual(240)
  for (let i = 0; i < 120; i++) await page.keyboard.press('ArrowDown')
  await expect.poll(async () => Math.round((await viewRoot(page, 'Instrument').boundingBox())!.height)).toBeGreaterThanOrEqual(240)
  expect(Math.round((await viewRoot(page, 'Session').boundingBox())!.height)).toBeGreaterThan(400)
})

test('in a window smaller than the minimums, the groups shrink beside open sidebars instead of sliding under them', async ({ page }) => {
  const tab = (id: string) => ({ type: 'tab', id, component: 'view' })
  await page.addInitScript((value) => localStorage.setItem('sfxlab:layout', value), JSON.stringify({ version: 2, model: {
    global: {},
    borders: [
      { type: 'border', location: 'left', show: true, selected: 0, size: 280, children: ['samples', 'library'].map(tab) },
      { type: 'border', location: 'right', show: true, selected: 0, size: 280, children: ['sounds'].map(tab) },
    ],
    layout: { type: 'row', children: [{ type: 'row', children: [
      { type: 'row', weight: 50, children: [
        { type: 'tabset', id: 'editor', weight: 50, children: ['session', 'wave'].map(tab) },
        { type: 'tabset', id: 'right', weight: 50, children: ['arrangement'].map(tab) },
      ] },
      { type: 'tabset', id: 'panel', weight: 50, children: ['instrument', 'effects', 'notes', 'clip', 'mixer'].map(tab) },
    ] }] },
  } }))
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.goto('/?starter')
  const box = async (title: Parameters<typeof viewRoot>[1]) => (await viewRoot(page, title).boundingBox())!
  await expect(viewRoot(page, 'Arrangement')).toBeVisible()
  const samples = await box('Samples')
  const sounds = await box('Sounds')
  expect(Math.round(samples.width)).toBe(280)
  expect(Math.round(sounds.width)).toBe(280)
  for (const title of ['Session', 'Arrangement', 'Instrument'] as const) {
    const view = await box(title)
    expect(view.x, title).toBeGreaterThanOrEqual(samples.x + samples.width)
    expect(view.x + view.width, title).toBeLessThanOrEqual(sounds.x)
  }
  // Below its minimum a view scrolls inside its own root.
  const session = viewRoot(page, 'Session')
  expect(await session.evaluate((root) => root.scrollWidth > root.clientWidth)).toBe(true)
})

test('View ▸ Show ▸ Mixer shows the Mixer, and the View menu and the tooltips name the keys', async ({ page }) => {
  await page.goto('/?starter')
  const apple = process.platform === 'darwin'
  await expect(tabStrip(page, 'Session').getByRole('button', { name: /^Maximize/ })).toHaveAttribute('title', `Maximize (${apple ? '⌃⌘M' : 'Ctrl+Alt+M'})`)
  await expect(tabStrip(page, 'Instrument').getByRole('button', { name: 'Panel', exact: true })).toHaveAttribute('title', `Toggle panel (${apple ? '⌃⌘J' : 'Ctrl+Alt+J'})`)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('title', `Undo (${apple ? '⌘Z' : 'Ctrl+Z'})`)
  await expect(viewRoot(page, 'Mixer')).toBeHidden()
  await page.getByRole('banner').getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Hide panel', exact: true })).toContainText(apple ? '⌃⌘J' : 'Ctrl+Alt+J')
  // Into the submenu with the keyboard (a jump of the mouse closes a submenu).
  await page.getByRole('menuitem', { name: 'Show', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('menu').last().getByRole('menuitem', { name: 'Mixer', exact: true }).click()
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
})

test('the built-in layouts load from the status bar: Mix fills the editor area with the Mixer, Sound design splits it', async ({ page }) => {
  await page.goto('/?starter')
  await layoutMenu(page, 'Mix')
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
  await expect(viewRoot(page, 'Instrument')).toBeHidden()
  await expect(tabStrip(page, 'Mixer').getByRole('tab', { name: 'Session', exact: true })).toBeVisible()
  await layoutMenu(page, 'Sound design')
  await expect(viewRoot(page, 'Wave editor')).toBeVisible()
  await expect(viewRoot(page, 'Instrument')).toBeVisible()
  await expect(viewRoot(page, 'Effects')).toBeVisible()
  await expect(viewRoot(page, 'Sounds')).toBeVisible()
  // A loaded preset is the layout from then on: a reload keeps it.
  await page.reload()
  await expect(viewRoot(page, 'Sounds')).toBeVisible()
})
