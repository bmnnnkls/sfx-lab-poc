import { test, expect } from '../support/fixtures'

const htmlTheme = (page: import('@playwright/test').Page) => page.locator('html')

test('View ▸ Theme switches the theme, and a reload keeps it from the first paint', async ({ page }) => {
  await page.goto('/?starter')
  await expect(htmlTheme(page)).toHaveAttribute('data-theme', 'dark')
  const darkBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  await page.getByRole('banner').getByRole('button', { name: 'View', exact: true }).click()
  // Into the submenu with the keyboard (a jump of the mouse closes a submenu).
  await page.getByRole('menuitem', { name: 'Theme', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('menu').last().getByRole('menuitemcheckbox', { name: 'Light', exact: true }).click()
  await expect(htmlTheme(page)).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).not.toBe(darkBackground)
  // The inline script in index.html sets it before the app's script runs.
  await page.reload({ waitUntil: 'commit' })
  await expect(htmlTheme(page)).toHaveAttribute('data-theme', 'light')
  await page.getByRole('banner').getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Theme', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menu').last().getByRole('menuitemcheckbox', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true')
})

test('the gallery shows every icon and token in each theme', async ({ page }, testInfo) => {
  await page.goto('/?gallery')
  await expect(page.getByRole('heading', { name: 'Theme gallery' })).toBeVisible()
  const icons = page.locator('[data-icon]')
  expect(await icons.count()).toBeGreaterThan(50)
  // Every icon draws something at both sizes.
  const empty = await icons.evaluateAll((items) => items.filter((item) => [...item.querySelectorAll('svg')].some((svg) => {
    const box = svg.getBBox()
    return svg.childElementCount === 0 || box.width === 0 || box.height === 0
  })).map((item) => item.getAttribute('data-icon')))
  expect(empty).toEqual([])
  for (const [name, theme] of [['Dark', 'dark'], ['Light', 'light'], ['High contrast', 'contrast']] as const) {
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name, exact: true }).click()
    await expect(htmlTheme(page)).toHaveAttribute('data-theme', theme)
    // Every token resolves under this theme.
    const missing = await page.locator('[data-token]').evaluateAll((items) => items
      .map((item) => item.getAttribute('data-token')!)
      .filter((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim() === ''))
    expect(missing).toEqual([])
    // For review, not compared: one screenshot per theme.
    await page.screenshot({ path: testInfo.outputPath(`gallery-${theme}.png`), fullPage: true })
  }
})
