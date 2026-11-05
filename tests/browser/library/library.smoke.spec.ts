import { serializeProject, parseProject } from '../../../src/core'
import { samplePresetProject } from '../support/preset-project'
import { test, expect, expectSaved, libraryMenu, libraryPanel, openExample, openView, saveToLibrary, treeRow, viewRoot } from '../support/fixtures'

test('library folders, associated presets, independent insert/undo/reload and trash survive production storage', async ({ page }, testInfo) => {
  const fixture = samplePresetProject()
  await page.addInitScript(saved => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(fixture.project))
  await page.goto('/')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles(fixture.samples.map(s => ({ name: `${s.info.name}.wav`, mimeType: 'audio/wav', buffer: Buffer.from(s.bytes) })))
  for (const sample of fixture.samples) await expect(page.getByRole('button', { name: `Preview ${sample.info.name}`, exact: true })).toBeEnabled()
  const session = viewRoot(page, 'Session')
  await session.getByText('Sweep', { exact: true }).first().click()
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await libraryMenu(panel, 'New folder')
  await panel.getByRole('textbox', { name: 'Name of New folder', exact: true }).fill('Collection')
  await page.keyboard.press('Enter')
  await expect(treeRow(panel, 'Collection')).toHaveAttribute('aria-selected', 'true')
  // Saved into the open folder, and shown from the toast.
  await saveToLibrary(page, session.getByRole('button', { name: 'Sweep', exact: true }), 'Instrument + notes')
  const toast = page.getByRole('status').filter({ hasText: 'Saved Sweep to Collection' })
  await toast.getByRole('button', { name: 'Show', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(treeRow(panel, 'Collection')).toHaveAttribute('aria-label', 'Collection, 1 item')
  const sweep = treeRow(panel, 'Sweep')
  await expect(sweep).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('article')).toContainText('2 presets · 2 samples')
  // The presets show under their sound.
  await sweep.press('ArrowRight')
  await expect(sweep).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.getByRole('treeitem', { level: 4 })).toHaveCount(2)
  await panel.getByRole('button', { name: 'Add as new track', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('copied into project')
  await expectSaved(page)
  const read = async () => {
    const r = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
    if (!r.ok) throw new Error(r.error)
    return r.project
  }
  const inserted = await read()
  expect(inserted.tracks).toHaveLength(3)
  expect(inserted.presets).toHaveLength(5)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expectSaved(page); expect((await read()).tracks).toHaveLength(2)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expectSaved(page); expect((await read()).tracks).toHaveLength(3)
  await sweep.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Trash', exact: true }).click()
  await expect(sweep).toHaveCount(0)
  await expectSaved(page); expect((await read()).tracks).toHaveLength(3)
  await page.reload()
  await openView(page, 'Library')
  await expect(treeRow(panel, 'Trash')).toHaveAttribute('aria-label', 'Trash, 1 item')
  await treeRow(panel, 'Trash').click()
  await treeRow(panel, 'Trash').press('ArrowRight')
  expect((await read()).presets).toHaveLength(5)
  await sweep.click()
  await expect(panel.getByRole('article')).toContainText('in the trash')
  await panel.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Restored')
  await expect(treeRow(panel, 'Trash')).toHaveAttribute('aria-label', 'Trash')
  await treeRow(panel, 'Collection').click()
  await treeRow(panel, 'Collection').press('ArrowRight')
  await sweep.click()
  await expect(panel.getByRole('article')).toContainText('2 presets · 2 samples')
  await page.screenshot({ path: testInfo.outputPath('library-panel.png') })
})

test('isolated previews close their audio context on navigation, including cancellation during rendering', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext
    Object.assign(window, { __libraryContexts: [] as AudioContext[], __libraryStarted: false })
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) {
      const data = this.buffer?.getChannelData(0)
      if (data && data.every(Number.isFinite) && data.some(v => Math.abs(v) > 0.01)) Object.assign(window, { __libraryStarted: true })
      start.apply(this, args)
    }
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) { super(options); (window as unknown as { __libraryContexts: AudioContext[] }).__libraryContexts.push(this) }
    }
  })
  await page.goto('/')
  await openExample(page, 'Starter')
  const session = await openView(page, 'Session')
  await saveToLibrary(page, session.getByRole('button', { name: 'Bass', exact: true }), 'Instrument + notes')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await treeRow(panel, 'Bass').click()
  const baseline = await page.evaluate(() => (window as unknown as { __libraryContexts: AudioContext[] }).__libraryContexts.length)
  const saved = await page.evaluate(() => localStorage.getItem('sfxlab:project'))
  await panel.getByRole('button', { name: 'Preview Bass', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __libraryStarted: boolean }).__libraryStarted)).toBe(true)
  await openView(page, 'Sounds')
  await expect.poll(() => page.evaluate(before => { const contexts = (window as unknown as { __libraryContexts: AudioContext[] }).__libraryContexts.slice(before); return contexts.length > 0 && contexts.every(c => c.state === 'closed') }, baseline)).toBe(true)
  await openView(page, 'Library')
  // Space previews the focused row.
  await treeRow(panel, 'Bass').click()
  await page.keyboard.press('Space')
  await expect(panel.getByRole('button', { name: 'Stop preview of Bass', exact: true })).toBeVisible()
  await viewRoot(page, 'Session').getByText('Master', { exact: true }).first().click()
  await expect.poll(() => page.evaluate(before => { const contexts = (window as unknown as { __libraryContexts: AudioContext[] }).__libraryContexts.slice(before); return contexts.length >= 2 && contexts.every(c => c.state === 'closed') }, baseline)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('sfxlab:project'))).toBe(saved)
})

test('an older open database connection blocks upgrade visibly, then preserves its sample bytes after retry', async ({ page, context }) => {
  const legacyPage = await context.newPage()
  await legacyPage.goto('/')
  await legacyPage.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('sfxlab', 1)
      r.onupgradeneeded = () => r.result.createObjectStore('samples')
      r.onsuccess = () => {
        Object.assign(window, { __legacyLibrary: r.result })
        const tx = r.result.transaction('samples', 'readwrite'); tx.objectStore('samples').put(Uint8Array.of(7, 8, 9), 'retained')
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
      }
      r.onerror = () => reject(r.error)
    })
  })
  await page.goto('/')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await expect(panel.getByRole('status')).toContainText('Close older SFX Lab tabs')
  await legacyPage.close()
  await panel.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Library saved')
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
  const bytes = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const r = indexedDB.open('sfxlab', 3)
    r.onsuccess = () => { const q = r.result.transaction('samples').objectStore('samples').get('retained'); q.onsuccess = () => { resolve(Array.from(q.result as Uint8Array)); r.result.close() }; q.onerror = () => reject(q.error) }
    r.onerror = () => reject(r.error)
  }))
  expect(bytes).toEqual([7, 8, 9])
})

test('canceled preview completions cannot clear a newer busy state or overwrite its status', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await saveToLibrary(page, session.getByRole('button', { name: 'Bass', exact: true }), 'Instrument + notes')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await treeRow(panel, 'Bass').click()
  await page.evaluate(() => {
    const resume = AudioContext.prototype.resume
    const pending: { resolve(): void; reject(): void }[] = []
    Object.assign(window, { __previewPending: pending })
    AudioContext.prototype.resume = function () {
      return new Promise<void>((resolve, reject) => pending.push({ resolve: () => { void resume.call(this).then(resolve, reject) }, reject: () => reject(new Error('Obsolete preview failure')) }))
    }
  })
  const preview = panel.getByRole('button', { name: 'Preview Bass', exact: true })
  const stop = panel.getByRole('button', { name: 'Stop preview of Bass', exact: true })
  // The details' button is disabled while an operation runs.
  const busy = panel.getByRole('button', { name: 'Add as new track', exact: true })
  for (const reject of [true, false]) {
    await preview.click()
    await stop.click()
    await preview.click()
    await page.evaluate(reject => {
      const pending = (window as unknown as { __previewPending: { resolve(): void; reject(): void }[] }).__previewPending
      const old = pending.shift()!; if (reject) old.reject(); else old.resolve()
    }, reject)
    await expect(busy).toBeDisabled()
    await expect(stop).toBeVisible()
    await expect(panel.getByText(/Obsolete/)).toHaveCount(0)
    await page.evaluate(() => (window as unknown as { __previewPending: { resolve(): void }[] }).__previewPending.shift()!.resolve())
    await expect(panel.getByRole('status')).toContainText('Preview in isolated engine')
    await expect(panel.getByRole('status')).not.toContainText('Obsolete')
    await expect(busy).toBeEnabled()
    await stop.click()
  }
})

test("a clip's scenes: Insert into lists every scene and disables the occupied ones; the main button says when no slot is empty; the selection survives a search and leaves with the trash", async ({ page }) => {
  const { sweepProject } = await import('../support/automation-project')
  await page.addInitScript(saved => localStorage.setItem('sfxlab:project', saved), serializeProject(sweepProject(true)))
  await page.goto('/')
  const session = await openView(page, 'Session')
  await saveToLibrary(page, session.getByRole('button', { name: '▶ Sweep clip', exact: true }))
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  const clip = treeRow(panel, 'Sweep clip')
  await clip.click()
  await clip.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Insert into Sweep', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  const scenes = page.getByRole('menu').last().getByRole('menuitem')
  await expect(scenes).toHaveText(['Scene 1', 'Scene 2', 'Scene 3', 'Scene 4'])
  await expect(scenes.first()).toHaveAttribute('data-disabled', '')
  await expect(scenes.first()).toHaveAttribute('title', 'Sweep has a clip there')
  await expect(scenes.nth(1)).not.toHaveAttribute('data-disabled', '')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  for (const scene of [2, 3, 4]) {
    await panel.getByRole('button', { name: `Insert into scene ${scene} of Sweep`, exact: true }).click()
    await expect(panel.getByRole('status')).toContainText('Clip inserted')
  }
  await expect(panel.getByRole('button', { name: 'Insert into Sweep', exact: true })).toBeDisabled()
  await expect(panel.getByRole('article')).toContainText('No empty slot')
  // A search that hides the item keeps it selected.
  await panel.getByLabel('Search library', { exact: true }).fill('hidden')
  await expect(clip).toHaveCount(0)
  await panel.getByLabel('Search library', { exact: true }).fill('')
  await expect(clip).toHaveAttribute('aria-selected', 'true')
  await panel.getByRole('button', { name: 'Library actions', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Export selection…', exact: true })).not.toHaveAttribute('data-disabled', '')
  await page.keyboard.press('Escape')
  await clip.focus()
  await page.keyboard.press('Delete')
  await expect(clip).toHaveCount(0)
  await panel.getByRole('button', { name: 'Library actions', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Export selection…', exact: true })).toHaveAttribute('data-disabled', '')
})

test('library items and folders rename in place', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await libraryMenu(panel, 'New folder')
  await panel.getByRole('textbox', { name: 'Name of New folder', exact: true }).fill('Collection')
  await page.keyboard.press('Enter')
  await treeRow(panel, 'Collection').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Name of Collection', exact: true }).fill('Leads')
  await page.keyboard.press('Enter')
  await expect(treeRow(panel, 'Leads')).toBeVisible()

  await saveToLibrary(page, session.getByRole('button', { name: 'Lead', exact: true }), 'Instrument + notes')
  await page.getByRole('status').filter({ hasText: 'Saved Lead to Leads' }).getByRole('button', { name: 'Show', exact: true }).click()
  // Show starts renaming; Escape keeps the name.
  await page.keyboard.press('Escape')
  await treeRow(panel, 'Lead').focus()
  await page.keyboard.press('F2')
  await panel.getByRole('textbox', { name: 'Name of Lead', exact: true }).fill('Bright lead')
  await page.keyboard.press('Enter')
  await expect(treeRow(panel, 'Bright lead')).toBeVisible()
})
