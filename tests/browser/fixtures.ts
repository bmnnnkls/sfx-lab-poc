import { test as base, expect, type Page } from '@playwright/test'

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

/** The views' titles. Specs import no `src/`, so keep this in sync by hand with `src/ui/layout/views.ts`. */
export type ViewTitle =
  | 'Session' | 'Arrangement'
  | 'Instrument' | 'Effects' | 'Notes' | 'Clip' | 'Mixer' | 'Samples' | 'Sounds' | 'Library'

/** The main views are switched from the transport bar, whose buttons say which view they show. */
const MAIN_VIEWS: ReadonlySet<ViewTitle> = new Set(['Session', 'Arrangement'])

/** Show a view wherever it is docked. The only place specs know how views are opened. */
export const openView = async (page: Page, title: ViewTitle) => {
  const name = MAIN_VIEWS.has(title) ? `${title} view` : title
  await page.getByRole('button', { name, exact: true }).click()
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
