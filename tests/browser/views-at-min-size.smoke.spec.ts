import type { Locator, Page } from '@playwright/test'
import { test, expect, dockAtSize, type ViewTitle } from './fixtures'

/** The views' minimum sizes. Specs import no `src/`, so keep these in sync by hand with `viewMinSizes`. */
const TOOL_VIEW = { width: 280, height: 200 }
const EDITOR = { width: 480, height: 240 }

interface Case {
  readonly title: ViewTitle
  /** What the case shows, when a view is checked in more than one state. */
  readonly state?: string
  readonly min: { readonly width: number; readonly height: number }
  /** Brings the view into the state the case checks. */
  readonly prepare?: (page: Page, root: Locator) => Promise<void>
  /** The controls that must show inside the view's box without scrolling, at a size the case is docked at. */
  readonly controls: (root: Locator, size: { width?: number; height?: number }) => Locator[]
}

const CASES: readonly Case[] = [
  {
    title: 'Sounds',
    min: TOOL_VIEW,
    controls: (root) => [root.getByLabel('Sound name', { exact: true }), root.getByRole('button', { name: 'Save snapshot' })],
  },
  {
    title: 'Clip',
    state: 'empty',
    min: EDITOR,
    // The empty state's action.
    controls: (root) => [root.getByRole('button', { name: 'Show session' })],
  },
  {
    title: 'Library',
    min: TOOL_VIEW,
    prepare: async (_page, root) => {
      await root.getByRole('button', { name: 'Save asset + presets', exact: true }).click()
      await expect(root.getByLabel('Library items', { exact: true }).getByRole('button')).not.toHaveCount(0)
    },
    // At 280 × 200 the toolbars fill the height, and the items are a scroll away.
    controls: (root, { width, height }) => [
      root.getByLabel('Search library', { exact: true }),
      ...(width && height ? [] : [root.getByLabel('Library items', { exact: true }).getByRole('button').first()]),
    ],
  },
]

/**
 * At its minimum a view lays itself out without scrolling sideways, except in the scrollers it marks with
 * `data-scroll` (grids, strips, timelines, canvases and waveforms), and its main controls show inside its box.
 */
const expectFits = async (root: Locator, controls: Locator[]) => {
  const sideways = await root.evaluate((element) => {
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`
    const scrolls = (el: Element) => {
      const { overflowX } = getComputedStyle(el)
      return el.scrollWidth > el.clientWidth + 1 && (el === element || overflowX === 'auto' || overflowX === 'scroll')
    }
    return [element, ...element.querySelectorAll('*')]
      .filter((el) => scrolls(el) && !el.hasAttribute('data-scroll'))
      .map((el) => `${el === element ? 'the root' : name(el)}: ${el.scrollWidth} > ${el.clientWidth}`)
  })
  expect(sideways, 'elements that scroll sideways without data-scroll').toEqual([])
  // Where the view starts: everything in it scrolled back to the top left.
  await root.evaluate((element) => [element, ...element.querySelectorAll('*')].forEach((el) => el.scrollTo(0, 0)))
  const box = (await root.boundingBox())!
  for (const control of controls) {
    await expect(control).toBeVisible()
    const inner = (await control.boundingBox())!
    expect(inner.x, `${control}`).toBeGreaterThanOrEqual(box.x - 1)
    expect(inner.y, `${control}`).toBeGreaterThanOrEqual(box.y - 1)
    expect(inner.x + inner.width, `${control}`).toBeLessThanOrEqual(box.x + box.width + 1)
    expect(inner.y + inner.height, `${control}`).toBeLessThanOrEqual(box.y + box.height + 1)
  }
}

for (const { title, state, min, prepare, controls } of CASES) {
  const sizes = [
    { name: `${min.width} px wide in a sidebar`, size: { width: min.width } },
    { name: `${min.height} px high in the panel`, size: { height: min.height } },
    { name: `${min.width} × ${min.height}`, size: min },
  ]
  for (const { name, size } of sizes) {
    test(`${title}${state ? ` (${state})` : ''} fits at ${name}`, async ({ page }) => {
      const root = await dockAtSize(page, title, size)
      const box = (await root.boundingBox())!
      if ('width' in size) expect(Math.abs(box.width - min.width)).toBeLessThanOrEqual(2)
      if ('height' in size) expect(Math.abs(box.height - min.height)).toBeLessThanOrEqual(2)
      await prepare?.(page, root)
      await expectFits(root, controls(root, size))
    })
  }
}
