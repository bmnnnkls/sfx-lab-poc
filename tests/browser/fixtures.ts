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

/** The main views are switched from the transport bar, whose buttons say which view they show. */
const MAIN_VIEWS: ReadonlySet<ViewTitle> = new Set(['Session', 'Arrangement'])

/** A view's root, wherever it is docked and whether or not it is showing. */
export const viewRoot = (page: Page, title: ViewTitle): Locator => page.locator(`[data-view="${VIEW_IDS[title]}"]`)

/**
 * Show a view wherever it is docked and return its root, once it is visible. The only place specs know how views are
 * opened. Look inside the returned locator rather than the page: a hidden view can stay in the DOM.
 */
export const openView = async (page: Page, title: ViewTitle): Promise<Locator> => {
  const name = MAIN_VIEWS.has(title) ? `${title} view` : title
  await page.getByRole('button', { name, exact: true }).click()
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
