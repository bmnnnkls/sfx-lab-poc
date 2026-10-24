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
  | 'Session' | 'Arrangement' | 'Wave editor'
  | 'Instrument' | 'Effects' | 'Notes' | 'Clip' | 'Mixer' | 'Samples' | 'Sounds' | 'Library'

/** Each view's id, its `data-view` attribute. Kept in sync by hand with `ViewId` in `src/state/layout-store.ts`. */
const VIEW_IDS: Readonly<Record<ViewTitle, string>> = {
  Session: 'session',
  Arrangement: 'arrangement',
  'Wave editor': 'wave',
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

/**
 * An HTML5 drag from one element onto another: Chromium's Playwright drives native drag and drop from mouse events, so
 * the mouse moves in steps. `hold` rests on an element for 600 ms on the way (a tab, to spring-load it), `alt` holds
 * Alt over the target, `position` is where on the target to drop, from its top left (its centre by default), and
 * `whileOver` runs over the target before the button is released. The target is found after the hold, since it may
 * only show then.
 */
export const dragTo = async (page: Page, source: Locator, target: Locator, { hold, alt, position, whileOver }: { hold?: Locator; alt?: boolean; position?: { x: number; y: number }; whileOver?: () => Promise<void> } = {}) => {
  const centre = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const from = await source.boundingBox()
  if (!from) throw new Error('the drag source isn\'t showing')
  const start = centre(from)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 })
  if (hold) {
    const over = await hold.boundingBox()
    if (!over) throw new Error('the element to hold over isn\'t showing')
    await page.mouse.move(centre(over).x, centre(over).y, { steps: 10 })
    await page.mouse.move(centre(over).x + 1, centre(over).y, { steps: 2 })
    await page.waitForTimeout(600)
  }
  const to = await target.boundingBox()
  if (!to) throw new Error('the drop target isn\'t showing')
  const end = position ? { x: to.x + position.x, y: to.y + position.y } : centre(to)
  if (alt) await page.keyboard.down('Alt')
  await page.mouse.move(end.x, end.y, { steps: 10 })
  await whileOver?.()
  await page.mouse.up()
  if (alt) await page.keyboard.up('Alt')
}

/**
 * Load the page with a view docked alone at a size, and return its root once visible. Specs that need a specific
 * arrangement use this; it writes the stored layout itself, so it imports no `src/`.
 * * a width: the view alone in the primary sidebar at that width (a border's size is exact);
 * * a height: the view alone in the panel, held at that height by the group's maximum;
 * * both: the view alone in a group at the top left of the main layout, held at that size by its maximums.
 * Every other view goes into one editor group.
 */
export const dockAtSize = async (page: Page, title: ViewTitle, size: { width?: number; height?: number }, url = '/?starter'): Promise<Locator> => {
  const id = VIEW_IDS[title]
  const tab = (view: string) => ({ type: 'tab', id: view, component: 'view' })
  const editor = { type: 'tabset', id: 'editor', weight: 50, children: Object.values(VIEW_IDS).filter((view) => view !== id).map(tab) }
  const panel = (children: unknown[], extra = {}) => ({ type: 'tabset', id: 'panel', weight: 50, ...extra, children })
  const column = (children: unknown[]) => ({ type: 'row', weight: 50, children })
  const { width, height } = size
  const inSidebar = width !== undefined && height === undefined
  const borders = inSidebar ? [{ type: 'border', location: 'left', show: true, selected: 0, size: width, children: [tab(id)] }] : []
  // A tab group's maximum height doesn't count its tab strip.
  const rows = inSidebar
    ? [column([editor, panel([], { maxHeight: 0 })])]
    : width === undefined
      ? [column([editor, panel([tab(id)], { maxHeight: height })])]
      : [column([{ type: 'tabset', id: 'box', weight: 50, maxWidth: width, maxHeight: height, children: [tab(id)] }, panel([])]), editor]
  const layout = JSON.stringify({ version: 2, model: { global: {}, borders, layout: { type: 'row', children: rows } } })
  // Written before the app reads it, on every load from now on: the page saves its own layout as it unloads.
  await page.addInitScript((value) => localStorage.setItem('sfxlab:layout', value), layout)
  await page.goto(url)
  const root = viewRoot(page, title)
  await expect(root).toBeVisible()
  return root
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
