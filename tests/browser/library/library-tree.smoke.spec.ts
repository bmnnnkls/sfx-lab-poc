import { test, expect, dragTo, libraryMenu, libraryPanel, openExample, openView, saveSound, saveToLibrary, treeRow } from '../support/fixtures'
import type { Locator, Page } from '@playwright/test'

/** Makes a folder from a menu (⋯ or a folder's), named in place. */
const newFolder = async (page: Page, panel: Locator, name: string, inside?: string) => {
  if (inside) {
    await treeRow(panel, inside).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'New folder inside', exact: true }).click()
  } else await libraryMenu(panel, 'New folder')
  await panel.getByRole('textbox', { name: 'Name of New folder', exact: true }).fill(name)
  await page.keyboard.press('Enter')
  await expect(treeRow(panel, name)).toBeVisible()
}

test('the library is one tree: saved from a track, organised by dragging, searched, previewed and used from the keyboard', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  // Lead with two presets.
  await session.getByRole('button', { name: 'Lead', exact: true }).click()
  const sounds = await openView(page, 'Sounds')
  for (const name of ['Warm', 'Bright']) await saveSound(page, sounds, 'preset', name)
  await saveToLibrary(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Instrument + notes')
  await page.getByRole('status').filter({ hasText: 'Saved Lead to My library' }).getByRole('button', { name: 'Show', exact: true }).click()
  const panel = libraryPanel(page)
  await expect(panel.getByRole('textbox', { name: 'Name of Lead', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  const lead = treeRow(panel, 'Lead')
  await expect(lead).toHaveAttribute('aria-selected', 'true')

  // Its presets are under it: Right opens it, Left closes it.
  await lead.focus()
  await expect(lead).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(lead).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.getByRole('treeitem', { level: 3 })).toHaveText(['Bright', 'Warm'].map((name) => new RegExp(name)))
  await page.keyboard.press('ArrowLeft')
  await expect(lead).toHaveAttribute('aria-expanded', 'false')

  await newFolder(page, panel, 'Pads')
  await newFolder(page, panel, 'Drums')
  await newFolder(page, panel, 'Kicks', 'Drums')

  // A drag moves the sound with its presets; Alt copies it.
  await dragTo(page, lead, treeRow(panel, 'Pads'))
  await expect(treeRow(panel, 'Pads')).toHaveAttribute('aria-label', 'Pads, 1 item')
  await expect(treeRow(panel, 'My library')).toHaveAttribute('aria-label', 'My library, 1 item')
  await treeRow(panel, 'Pads').click()
  await treeRow(panel, 'Pads').press('ArrowRight')
  await lead.click()
  await lead.press('ArrowRight')
  await expect(panel.getByRole('treeitem', { level: 4 })).toHaveCount(2)
  await dragTo(page, lead, treeRow(panel, 'Drums'), { alt: true })
  // From here on there are two: the copy in Drums first, then Pads's.
  await expect(treeRow(panel, 'Drums')).toHaveAttribute('aria-label', 'Drums, 1 item')
  await expect(treeRow(panel, 'Pads')).toHaveAttribute('aria-label', 'Pads, 1 item')

  // A folder can't go into a folder inside it.
  await dragTo(page, treeRow(panel, 'Drums'), treeRow(panel, 'Kicks'), { whileOver: () => expect(treeRow(panel, 'Kicks')).toHaveAttribute('data-drop', 'refuse') })
  await expect(treeRow(panel, 'Kicks')).toHaveAttribute('aria-level', '3')

  // A closed folder springs open under a resting drag.
  await treeRow(panel, 'Pads').click()
  await treeRow(panel, 'Pads').press('ArrowLeft')
  await expect(treeRow(panel, 'Pads')).toHaveAttribute('aria-expanded', 'false')
  await dragTo(page, treeRow(panel, 'Kicks'), treeRow(panel, 'Pads'), { whileOver: async () => { await page.waitForTimeout(700); await expect(treeRow(panel, 'Pads')).toHaveAttribute('aria-expanded', 'true') } })
  await expect(treeRow(panel, 'Kicks')).toHaveAttribute('aria-level', '3')
  await expect(treeRow(panel, 'Drums')).toHaveAttribute('aria-expanded', 'true')

  // Onto the trash, and back out onto a folder: restored there.
  // Drums comes before Pads, so its copy is the first Lead.
  await dragTo(page, lead.first(), treeRow(panel, 'Trash'))
  await expect(treeRow(panel, 'Trash')).toHaveAttribute('aria-label', 'Trash, 1 item')
  await expect(treeRow(panel, 'Drums')).toHaveAttribute('aria-label', 'Drums')
  await treeRow(panel, 'Trash').click()
  await treeRow(panel, 'Trash').press('ArrowRight')
  await dragTo(page, lead.last(), treeRow(panel, 'Kicks'))
  await expect(treeRow(panel, 'Kicks')).toHaveAttribute('aria-label', 'Kicks, 1 item')
  await expect(treeRow(panel, 'Trash')).toHaveAttribute('aria-label', 'Trash')

  // A search shows the matches under their folders; clearing it brings the tree back.
  await panel.getByLabel('Search library', { exact: true }).fill('warm')
  const labels = () => panel.getByRole('treeitem').evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  await expect.poll(labels).toEqual(['Demo project', 'My library, 2 items', 'Pads, 1 item', 'Kicks, 1 item', 'Lead', 'Warm', 'Lead', 'Warm', 'Factory, 49 items', 'Trash'])
  await panel.getByLabel('Search library', { exact: true }).fill('')
  await expect(treeRow(panel, 'Drums')).toBeVisible()

  // Space previews the focused item, and its ▶ turns into ■.
  await lead.first().click()
  await page.keyboard.press('Space')
  await expect(panel.getByRole('button', { name: 'Stop preview of Lead', exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(panel.getByRole('button', { name: 'Stop preview of Lead', exact: true })).toHaveCount(0)

  // Enter adds a track; one undo removes it.
  const leads = session.getByRole('button', { name: 'Lead', exact: true })
  await expect(leads).toHaveCount(1)
  await lead.first().press('Enter')
  await expect(leads).toHaveCount(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(leads).toHaveCount(1)

  // F2 renames the focused row, Delete trashes it.
  await lead.first().focus()
  await page.keyboard.press('F2')
  await panel.getByRole('textbox', { name: 'Name of Lead', exact: true }).fill('Soft lead')
  await page.keyboard.press('Enter')
  const soft = treeRow(panel, 'Soft lead')
  await expect(soft).toBeVisible()
  await soft.focus()
  await page.keyboard.press('Delete')
  await expect(treeRow(panel, 'Trash')).toHaveAttribute('aria-label', 'Trash, 1 item')
})

test('a session clip and a Tracks row dragged onto the library are saved there, through the Library tab', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await newFolder(page, panel, 'Grooves')
  const session = await openView(page, 'Session')
  // The Library is hidden behind Samples: resting on its tab shows it, and the clip lands in the folder.
  await openView(page, 'Samples')
  const libraryTab = page.getByRole('tab', { name: 'Library', exact: true })
  await dragTo(page, session.getByRole('button', { name: 'Play Root', exact: true }), treeRow(panel, 'Grooves'), { hold: libraryTab })
  await expect(page.getByRole('status').filter({ hasText: 'Saved Root to Grooves' })).toBeVisible()
  await expect(treeRow(panel, 'Grooves')).toHaveAttribute('aria-label', 'Grooves, 1 item')

  // Tracks shares the Library's group: the row's view hides as the Library shows, and the drag goes on.
  const tracks = await openView(page, 'Tracks')
  await dragTo(page, tracks.getByRole('treeitem', { name: 'Lead', exact: true }), treeRow(panel, 'My library'), { hold: libraryTab })
  await page.getByRole('status').filter({ hasText: 'Saved Lead to My library' }).getByRole('button', { name: 'Show', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(treeRow(panel, 'Lead')).toHaveAttribute('aria-selected', 'true')
})

test('a return whose effects read Track audio is refused on the library, with the reason as the tooltip', async ({ page }) => {
  await page.goto('/?starter')
  await openExample(page, 'Low Light')
  const tracks = await openView(page, 'Tracks')
  const panel = libraryPanel(page)
  const mine = treeRow(panel, 'My library')
  await dragTo(page, tracks.getByRole('treeitem', { name: 'Echo, return', exact: true }), mine, {
    hold: page.getByRole('tab', { name: 'Library', exact: true }),
    whileOver: async () => {
      await expect(mine).toHaveAttribute('data-drop', 'refuse')
      await expect(mine).toHaveAttribute('title', 'Uses Track audio from Kick')
    },
  })
  await expect(mine).not.toHaveAttribute('title', /Track audio/)
  await expect(page.getByRole('status').filter({ hasText: /^Saved / })).toHaveCount(0)
  await expect(treeRow(panel, 'Echo effects')).toHaveCount(0)
})

test('records production Chromium timings for a near-limit library: the collapsed tree, a search and opening a folder', async ({ page, browser }, testInfo) => {
  const os = await import('node:os')
  await page.goto('/?starter')
  await openView(page, 'Library')
  await libraryPanel(page).getByRole('tree').waitFor()
  await page.evaluate(async () => {
    const folders: unknown[] = []; for (let a = 0; a < 32; a++) { folders.push({ id: `t${a}`, name: `Folder ${a}`, parentId: null }); for (let b = 0; b < 31; b++) folders.push({ id: `t${a}-${b}`, name: `Folder ${a}.${b}`, parentId: `t${a}` }) }
    const items: unknown[] = []; for (let i = 0; i < 3072; i++) items.push({ id: `i${i}`, name: `Sound ${i}`, folderId: (folders[i % 1024] as { id: string }).id, content: { kind: 'sample', sampleId: 's' } })
    for (let i = 0; i < 1024; i++) items.push({ id: `p${i}`, name: `Preset ${i}`, folderId: (folders[i] as { id: string }).id, content: { kind: 'preset', assetId: `i${i}`, revisionId: 'r', state: {} } })
    const catalog = { version: 2, folders, items, revisions: [], samples: [{ id: 's', name: 'S', extension: 'wav', sampleRate: 48000, channels: 1, bytes: 10, durationSeconds: 1 }] }
    await new Promise<void>((resolve, reject) => { const r = indexedDB.open('sfxlab'); r.onsuccess = () => { const tx = r.result.transaction('catalog', 'readwrite'); tx.objectStore('catalog').put(catalog, 'current'); tx.oncomplete = () => { r.result.close(); resolve() }; tx.onerror = () => reject(tx.error) }; r.onerror = () => reject(r.error) })
  })
  await page.reload()
  await page.evaluate(() => { (window as unknown as { __t: number }).__t = performance.now() })
  await openView(page, 'Library')
  const tree = libraryPanel(page).getByRole('treeitem', { name: 'My library, 3072 items' })
  await tree.waitFor()
  const open = await page.evaluate(() => performance.now() - (window as unknown as { __t: number }).__t)
  const measure = () => page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
    const input = document.querySelector('input[aria-label="Search library"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const type = async (value: string) => { const t = performance.now(); setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await frame(); return performance.now() - t }
    const runs = { search: [] as number[], clear: [] as number[], expand: [] as number[] }
    for (let n = 0; n < 5; n++) {
      runs.search.push(await type('sound 12'))
      runs.clear.push(await type(''))
    }
    const rows = document.querySelectorAll('[role=treeitem]').length
    for (let n = 0; n < 5; n++) {
      const row = [...document.querySelectorAll('[role=treeitem]')].find((r) => r.getAttribute('aria-label')?.startsWith('Folder 1,'))!
      const t = performance.now(); (row.querySelector('[aria-hidden]') as HTMLElement).click(); await frame(); runs.expand.push(performance.now() - t)
    }
    return { rows, runs }
  })
  const timings = await measure()
  // Again with This project and the Factory open too: four roots, searched together.
  const panel = libraryPanel(page)
  await expect(panel.getByRole('treeitem', { name: 'Factory, 49 items' })).toBeVisible()
  for (const root of ['Demo project', 'Factory, 49 items']) {
    await panel.getByRole('treeitem', { name: root, exact: true }).click()
    await page.keyboard.press('ArrowRight')
  }
  const allRoots = await measure()
  // `clear` re-renders the whole collapsed tree from the catalog; `openLibraryMs` includes loading the view's chunk and reading storage.
  const out = { cpu: os.cpus()[0]?.model, platform: os.platform(), browser: browser.version(), folders: 1024, items: 4096, openLibraryMs: Math.round(open), ...timings, allRootsOpen: allRoots }
  await testInfo.attach('library-tree-near-limit.json', { body: JSON.stringify(out, null, 2), contentType: 'application/json' })
  if (process.env.TREE_TIMINGS) (await import('node:fs')).writeFileSync(process.env.TREE_TIMINGS, JSON.stringify(out, null, 2))
})

test('the first-run hint shows in the empty Library and under a selected item until it is dismissed, once per browser', async ({ page }) => {
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  const hint = panel.getByRole('complementary', { name: 'Hint', exact: true })
  await expect(hint).toHaveText(/Drag onto a track, a slot or a graph to use it\./)
  // A Factory sound selected: the hint is under its details too.
  const factory = treeRow(panel, 'Factory')
  await expect(factory).toHaveAttribute('aria-label', 'Factory, 49 items')
  await factory.click()
  await factory.press('ArrowRight')
  await treeRow(panel, 'Drums').click()
  await treeRow(panel, 'Drums').press('ArrowRight')
  await panel.getByRole('treeitem', { name: 'Kick', exact: true }).click()
  await expect(panel.getByLabel('Library details', { exact: true }).getByRole('complementary', { name: 'Hint' })).toBeVisible()
  await hint.getByRole('button', { name: 'Dismiss hint', exact: true }).click()
  await expect(hint).toHaveCount(0)
  await page.reload()
  await openView(page, 'Library')
  await expect(libraryPanel(page).getByLabel('Library details', { exact: true })).toBeVisible()
  await expect(libraryPanel(page).getByRole('complementary', { name: 'Hint' })).toHaveCount(0)
})
