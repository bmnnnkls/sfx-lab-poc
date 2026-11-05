import type { Locator, Page } from '@playwright/test'
import { test, expect, dockAtSize, openView, viewRoot, type ViewTitle } from './fixtures'

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
  /** Anything else the case checks once the view fits. */
  readonly check?: (root: Locator) => Promise<void>
}

/** A graph editor's canvas: what scrolls its surface. */
const canvas = (root: Locator) => root.getByTestId('patch-surface').locator('..')

/** Instrument, Effects and Notes in Graph mode, with a canvas at least 200 px wide, and in Panel mode. */
const graphEditorCases = (title: ViewTitle): Case[] => [
  {
    title,
    state: 'graph',
    min: EDITOR,
    controls: (root) => [root.getByRole('button', { name: 'Add', exact: true }), canvas(root)],
    check: async (root) => expect((await canvas(root).boundingBox())!.width).toBeGreaterThanOrEqual(200),
  },
  {
    title,
    state: 'panel',
    min: EDITOR,
    prepare: async (_page, root) => {
      await root.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Panel', exact: true }).click()
    },
    controls: (root) => [root.getByRole('button', { name: 'Graph', exact: true }), root.getByRole('button', { name: 'Edit panel', exact: true })],
  },
]

/** Opens the starter's first MIDI clip from Session, which shows in the editor group beside the docked view. */
const openFirstClip = async (page: Page, root: Locator) => {
  await viewRoot(page, 'Session').locator('button[aria-label^="Edit "]:not([aria-label*="automation"])').first().click()
  await expect(root.getByLabel('Clip length in beats', { exact: true })).toBeVisible()
}

/** Removes the starter's tracks in Session, which shows in the editor group beside the docked view. */
const removeEveryTrack = async (page: Page) => {
  const session = await openView(page, 'Session')
  for (const name of ['Bass', 'Lead', 'Pad']) await session.getByRole('button', { name: `Remove ${name}`, exact: true }).click()
  await expect(session.getByRole('button', { name: /^Remove / })).toHaveCount(0)
}

/** ✎ on each sample in Samples. */
const editButtons = (root: Locator) => root.locator('button[title^="Open in the wave editor"]')

/** Adds the demo samples in Samples and opens the first in the Wave editor. */
const openDemoSample = async (page: Page, root: Locator) => {
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(editButtons(samples).first()).toBeEnabled()
  await root.getByRole('button', { name: /^Demo / }).first().click()
}

const CASES: readonly Case[] = [
  {
    title: 'Session',
    min: EDITOR,
    // The scene column stays at the right and the track headers at the top while the grid scrolls.
    controls: (root) => [root.getByRole('button', { name: 'Launch scene 1', exact: true }), root.getByRole('button', { name: 'Bass', exact: true })],
  },
  {
    title: 'Arrangement',
    min: EDITOR,
    // The mark lane stays under the ruler, and its toolbar buttons show.
    controls: (root) => [
      root.getByRole('button', { name: 'Play arrangement', exact: true }),
      root.getByRole('button', { name: '⟳ Loop', exact: true }),
      root.getByText('Markers', { exact: true }),
      root.getByText('Bass', { exact: true }),
    ],
  },
  {
    title: 'Sounds',
    min: TOOL_VIEW,
    controls: (root) => [root.getByRole('tab', { name: 'Track', exact: true }), root.getByRole('button', { name: 'Sounds actions', exact: true }), root.getByRole('button', { name: 'Save snapshot', exact: true })],
  },
  {
    title: 'Clip',
    state: 'notes',
    min: EDITOR,
    prepare: openFirstClip,
    controls: (root) => [root.getByLabel('Clip length in beats', { exact: true }), root.getByTestId('note-surface').locator('xpath=ancestor::*[@data-scroll][1]')],
    // The roll keeps more height than its velocity lane.
    check: async (root) => {
      const lane = (await root.getByTestId('velocity-lane').boundingBox())!
      expect(lane.height).toBeLessThanOrEqual(72)
    },
  },
  {
    title: 'Clip',
    state: 'automation',
    min: EDITOR,
    prepare: async (page, root) => {
      await openFirstClip(page, root)
      await root.getByRole('group', { name: 'Clip view' }).getByRole('button', { name: 'Automation', exact: true }).click()
    },
    controls: (root) => [root.getByLabel('Search automation targets', { exact: true }), root.getByLabel('Add automation lane', { exact: true })],
  },
  {
    title: 'Clip',
    state: 'empty',
    min: EDITOR,
    // The empty state's action.
    controls: (root) => [root.getByRole('button', { name: 'Show session' })],
  },
  {
    title: 'Samples',
    min: TOOL_VIEW,
    prepare: async (_page, root) => {
      await root.getByRole('button', { name: 'Add demo samples', exact: true }).click()
      await expect(editButtons(root).first()).toBeEnabled()
    },
    controls: (root) => [root.getByRole('button', { name: 'Import sample…', exact: true }), editButtons(root).first()],
  },
  {
    title: 'Wave editor',
    state: 'a sample open',
    min: EDITOR,
    prepare: openDemoSample,
    // The overview is the waveform's scrollbar: the detail view doesn't scroll natively.
    // The toolbar wraps a whole group at a time: every group shows, the last one too.
    controls: (root) => [
      root.getByRole('button', { name: 'Close sample', exact: true }),
      root.getByRole('button', { name: 'Process', exact: true }),
      root.getByRole('button', { name: 'Crop', exact: true }),
      root.getByRole('scrollbar', { name: 'Waveform position' }),
      root.getByTestId('mark-lane'),
    ],
    // Under 300 px of height the mark lane folds to a strip of ticks.
    check: async (root) => {
      const height = (await root.boundingBox())!.height
      const lane = (await root.getByTestId('mark-lane').boundingBox())!.height
      if (height < 300) expect(lane).toBeLessThan(10)
      else expect(lane).toBeGreaterThanOrEqual(20)
    },
  },
  {
    title: 'Wave editor',
    state: 'two panes, split lanes',
    min: EDITOR,
    prepare: async (page, root) => {
      await openDemoSample(page, root)
      await root.getByRole('button', { name: 'View', exact: true }).click()
      await page.getByRole('menuitemcheckbox', { name: 'Second pane', exact: true }).click()
      await expect(root.getByTestId('wave-pane-second')).toBeVisible()
      await root.getByRole('button', { name: 'View', exact: true }).click()
      await page.getByRole('menuitemcheckbox', { name: 'Split', exact: true }).click()
      await expect(root.getByTestId('wave-pane-second').getByTestId('wave-detail')).toHaveAttribute('data-spectrum', /levels|stretched|pending/)
    },
    // Both panes keep their scrollbar, mark lane and lanes (the waveform over the spectrogram); under 300 px of height they fold to fit.
    controls: (root) => [
      root.getByRole('button', { name: 'Close sample', exact: true }),
      root.getByRole('button', { name: 'Crop', exact: true }),
      ...['main', 'second'].flatMap((pane) => {
        const inPane = root.getByTestId(`wave-pane-${pane}`)
        return [inPane.getByRole('scrollbar', { name: 'Waveform position' }), inPane.getByTestId('mark-lane'), inPane.getByTestId('wave-detail')]
      }),
      root.getByRole('separator', { name: 'Resize the panes', exact: true }),
      root.getByRole('button', { name: 'Close the second pane', exact: true }),
    ],
  },
  {
    title: 'Mixer',
    min: TOOL_VIEW,
    // The master strip stays at the right edge while the strips scroll.
    controls: (root) => [root.getByLabel('Master fader', { exact: true }), root.getByRole('button', { name: 'Bass', exact: true })],
  },
  ...graphEditorCases('Instrument'),
  ...graphEditorCases('Effects'),
  ...graphEditorCases('Notes'),
  {
    title: 'Instrument',
    state: 'no tracks',
    min: EDITOR,
    prepare: removeEveryTrack,
    controls: (root) => [root.getByRole('button', { name: 'Add instrument track', exact: true })],
    // The action fills the empty state.
    check: async (root) => {
      await root.getByRole('button', { name: 'Add instrument track', exact: true }).click()
      await expect(root.getByRole('button', { name: 'Add', exact: true })).toBeVisible()
    },
  },
  {
    title: 'Effects',
    state: 'no tracks',
    min: EDITOR,
    prepare: removeEveryTrack,
    controls: (root) => [root.getByRole('button', { name: 'Add instrument track', exact: true }), root.getByRole('button', { name: 'Add audio track', exact: true })],
  },
  {
    title: 'Notes',
    state: 'the master',
    min: EDITOR,
    prepare: async (page) => {
      await viewRoot(page, 'Session').getByRole('button', { name: 'Master', exact: true }).click()
    },
    controls: (root) => [root.getByRole('button', { name: 'Open effects', exact: true })],
    check: async (root) => {
      await root.getByRole('button', { name: 'Open effects', exact: true }).click()
      await expect(viewRoot(root.page(), 'Effects')).toBeVisible()
    },
  },
  {
    title: 'Library',
    state: 'empty',
    min: TOOL_VIEW,
    controls: (root) => [root.getByLabel('Library details', { exact: true }).getByRole('button', { name: 'Save Bass to library', exact: true })],
  },
  {
    title: 'Library',
    min: TOOL_VIEW,
    prepare: async (_page, root) => {
      await root.getByRole('button', { name: 'Save Bass to library', exact: true }).click()
      await expect(root.getByRole('treeitem', { name: 'Bass', exact: true })).toBeVisible()
    },
    controls: (root) => [
      root.getByLabel('Search library', { exact: true }),
      root.getByRole('button', { name: 'Library actions', exact: true }),
      root.getByRole('treeitem', { name: 'Bass', exact: true }),
    ],
  },
  {
    title: 'Pinned',
    state: 'empty',
    min: TOOL_VIEW,
    controls: (root) => [root.getByText(/Nothing is pinned/)],
  },
  {
    title: 'Pinned',
    min: TOOL_VIEW,
    prepare: async (page, root) => {
      await viewRoot(page, 'Session').getByRole('button', { name: 'Master', exact: true }).click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Pin effects panel', exact: true }).click()
      await expect(root.getByRole('region', { name: 'Master effects', exact: true })).toBeVisible()
    },
    controls: (root) => [root.getByRole('button', { name: 'Open', exact: true }).first(), root.getByRole('button', { name: 'Unpin Master effects', exact: true })],
  },
  {
    title: 'Tracks',
    min: TOOL_VIEW,
    prepare: async (_page, root) => {
      await root.getByRole('treeitem', { name: 'Lead', exact: true }).click({ button: 'right' })
      await root.page().getByRole('menuitem', { name: 'Group', exact: true }).click()
    },
    controls: (root) => [root.getByRole('treeitem', { name: 'Group 1, group of 1 track', exact: true }), root.getByRole('button', { name: 'Collapse all', exact: true })],
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

for (const { title, state, min, prepare, controls, check } of CASES) {
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
      await check?.(root)
    })
  }
}

test('a narrow graph editor shows the properties as a drawer over the canvas, from the toolbar or a double-click', async ({ page }) => {
  const root = await dockAtSize(page, 'Instrument', { width: 480 })
  const properties = root.getByRole('complementary', { name: 'Properties' })
  const toggle = root.getByRole('button', { name: 'Properties', exact: true })
  const width = (await canvas(root).boundingBox())!.width
  await expect(properties).toBeHidden()
  // Selecting a node doesn't open it; the canvas keeps the whole width.
  await root.getByTestId(/^node-/).first().locator('[data-header]').click()
  await expect(properties).toBeHidden()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(properties).toBeVisible()
  expect((await canvas(root).boundingBox())!.width).toBe(width)
  await toggle.click()
  await expect(properties).toBeHidden()
  await root.getByTestId(/^node-/).first().locator('[data-header]').dblclick()
  await expect(properties).toBeVisible()
})

test('a wide graph editor keeps the properties beside the canvas, with no drawer to toggle', async ({ page }) => {
  const root = await dockAtSize(page, 'Instrument', { height: 400 })
  await expect(root.getByRole('complementary', { name: 'Properties' })).toBeVisible()
  await expect(root.getByRole('button', { name: 'Properties', exact: true })).toBeHidden()
})
