import { test as base, expect, type Locator, type Page } from '@playwright/test'

/** Every test gets a fresh browser context, including localStorage and IndexedDB. */
export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await use(errors)
    expect(errors, 'uncaught page errors and console errors').toEqual([])
  }, { auto: true }],
})

export { expect }

/** The views' titles. Specs import no `src/`, so keep this in sync by hand with `src/ui/layout/view-titles.ts`. */
export type ViewTitle =
  | 'Session' | 'Arrangement'
  | 'Instrument' | 'Effects' | 'Notes' | 'Clip' | 'Mixer' | 'Samples' | 'Sounds' | 'Library'

/** Each view's id, its `data-view` attribute. Kept in sync by hand with `ViewId` in `src/state/layout-store.ts`. */
const VIEW_IDS: Readonly<Record<ViewTitle, string>> = {
  Session: 'session',
  Arrangement: 'arrangement',
  Instrument: 'instrument',
  Effects: 'effects',
  Notes: 'notes',
  Clip: 'clip',
  Mixer: 'mixer',
  Samples: 'samples',
  Sounds: 'sounds',
  Library: 'library',
}

/** A view's root, wherever it is docked and whether or not it is showing. */
export const viewRoot = (page: Page, title: ViewTitle): Locator => page.locator(`[data-view="${VIEW_IDS[title]}"]`)

/**
 * Show a view wherever it is docked and return its root, once it is visible. The only place specs know how views are
 * opened. Look inside the returned locator rather than the page: a hidden view stays in the DOM.
 */
export const openView = async (page: Page, title: ViewTitle): Promise<Locator> => {
  const tab = page.getByRole('tab', { name: title, exact: true })
  const root = viewRoot(page, title)
  // Clicking the open tab of the panel or a sidebar would collapse it; on a collapsed panel it expands it.
  if (await tab.getAttribute('aria-selected') !== 'true' || !await root.isVisible()) await tab.click()
  await expect(root).toBeVisible()
  return root
}

/** The tab strip of the group a view's tab is in, with the group's buttons (maximize; the panel's toggles). */
export const tabStrip = (page: Page, title: ViewTitle): Locator =>
  page.locator('[data-layout-path$="/tabstrip"]', { has: page.getByRole('tab', { name: title, exact: true }) })

/** Drag a view's tab to a point. flexlayout starts a drag only from real pointer movement, so the mouse moves in steps. */
const dragTab = async (page: Page, title: ViewTitle, x: number, y: number) => {
  const from = await page.getByRole('tab', { name: title, exact: true }).boundingBox()
  if (!from) throw new Error(`the ${title} tab isn't showing`)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(x, y, { steps: 20 })
  await page.mouse.up()
}

/** Drag a view's tab onto an edge of another view, to dock it there (`center` joins that view's tab group). `dragTo` doesn't start a drag. */
export const dragView = async (page: Page, title: ViewTitle, target: ViewTitle, side: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
  const to = await viewRoot(page, target).boundingBox()
  if (!to) throw new Error(`cannot drag ${title} onto ${target}: it isn't showing`)
  await dragTab(page, title,
    to.x + to.width * (side === 'left' ? 0.1 : side === 'right' ? 0.9 : 0.5),
    to.y + to.height * (side === 'top' ? 0.1 : side === 'bottom' ? 0.9 : 0.5))
}

/** Drag a view's tab into a sidebar that is showing. An empty sidebar is only flexlayout's strip, found by its layout path. */
export const dragViewToSidebar = async (page: Page, title: ViewTitle, sidebar: 'primary' | 'secondary') => {
  const strip = await page.locator(`[data-layout-path="/border/${sidebar === 'primary' ? 'left' : 'right'}"]`).boundingBox()
  if (!strip) throw new Error(`the ${sidebar} sidebar isn't showing`)
  await dragTab(page, title, strip.x + strip.width / 2, strip.y + strip.height / 2)
}

export const openExample = async (page: Page, name: string) => {
  await page.getByText('File', { exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByLabel('Project name')).toHaveValue(name === 'Starter' ? 'Demo project' : name)
}

/** Poll a real worklet output meter; never substitute a mocked engine for playback. */
export const expectSound = async (page: Page) => {
  await expect.poll(async () => Number(await page.locator('[data-peak]').first().getAttribute('data-peak')),
    { message: 'the AudioWorklet produces audible output', timeout: 10_000 }).toBeGreaterThan(0.02)
}

export const expectSaved = async (page: Page) => {
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
}
