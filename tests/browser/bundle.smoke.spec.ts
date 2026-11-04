import { readFile } from 'node:fs/promises'
import { captureLibraryAsset, emptyLibrary, saveLibraryFolder, parseProject } from '../../src/core'
import { stageLibraryBundle, exportLibraryBundle, importProject } from '../../src/storage'
import { samplePresetProject } from './preset-project'
import { test, expect, expectSaved, libraryMenu, libraryPanel, openView, openFileMenu, treeRow } from './fixtures'

test('bundle review/cancel/export/import into fresh and conflicting libraries survives reload and independent project package export', async ({ page, browser }, testInfo) => {
  const fixture = samplePresetProject(), scope = { owner: { kind: 'track' as const, trackId: 'sweep' }, domain: 'patch' as const }
  const catalog = captureLibraryAsset(saveLibraryFolder(emptyLibrary(), 'Nested', null, 'nested'), fixture.project, scope, 'Exchange instrument', 'nested')
  const file = await exportLibraryBundle(catalog, { folderIds: ['nested'] }, 'Exchange', async id => fixture.samples.find(s => s.info.id === id)?.bytes)
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  const upload = async () => panel.getByLabel('Import library bundle', { exact: true }).setInputFiles({ name: file.fileName, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) })
  // ⋯ ▸ Import .sfxlib… opens the file picker; the review is a dialog.
  const chooser = page.waitForEvent('filechooser')
  await libraryMenu(panel, 'Import .sfxlib…')
  await (await chooser).setFiles({ name: file.fileName, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) })
  const review = page.getByRole('dialog', { name: 'Bundle review' })
  await expect(review).toContainText('It holds 3 items, 1 folder, 2 samples')
  await expect(review).toContainText('It goes into a new folder called Exchange; importing it again makes another copy.')
  await expect(review.getByRole('alert')).toHaveCount(0)
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(review).toHaveCount(0)
  await expect(treeRow(panel, 'Exchange')).toHaveCount(0)
  for (let n = 0; n < 2; n++) {
    await upload()
    await review.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(panel.getByRole('status')).toContainText('Library saved')
    await expect(treeRow(panel, 'Exchange')).toHaveCount(n + 1)
  }
  // Fresh IDs make both imported roots coexist with no name-based overwrite.
  await page.reload()
  await openView(page, 'Library')
  await treeRow(panel, 'Exchange').first().click()
  await treeRow(panel, 'Exchange').first().press('ArrowRight')
  await treeRow(panel, 'Nested').first().click()
  await treeRow(panel, 'Nested').first().press('ArrowRight')
  await treeRow(panel, 'Exchange instrument').first().click()
  await expect(panel.getByRole('article')).toContainText('2 presets · 2 samples')
  await panel.getByRole('button', { name: 'Add as new track', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('copied into project')
  await expectSaved(page)
  const saved = await page.evaluate(() => localStorage.getItem('sfxlab:project'))
  const parsed = parseProject(saved!); expect(parsed.ok && parsed.project.presets).toHaveLength(3)
  // A folder exports from its own menu.
  await treeRow(panel, 'Nested').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export as .sfxlib…', exact: true }).click()
  await expect(review).toContainText('Export Nested')
  await expect(review).toContainText('3 items')
  await page.screenshot({ path: testInfo.outputPath('bundle-review.png') })
  const [download] = await Promise.all([page.waitForEvent('download'), review.getByRole('button', { name: 'Download .sfxlib', exact: true }).click()])
  const bundlePath = testInfo.outputPath('nested.sfxlib'); await download.saveAs(bundlePath)
  expect((await stageLibraryBundle(await readFile(bundlePath))).blobs.size).toBe(2)
  await expect(review).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('bundle-panel.png') })
  await treeRow(panel, 'Exchange').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Trash', exact: true }).click()
  await expect(treeRow(panel, 'Exchange')).toHaveCount(1)
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('sfxlab:project'))).toBe(saved)
  await openFileMenu(page)
  const [projectDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export to file…', exact: true }).click()])
  const packagePath = testInfo.outputPath('independent.sfxlab'); await projectDownload.saveAs(packagePath)
  const projectRoundtrip = await importProject(await readFile(packagePath))
  expect(projectRoundtrip.ok && projectRoundtrip.project).toEqual(parsed.ok && parsed.project)
  expect(projectRoundtrip.ok && projectRoundtrip.samples.size).toBe(2)
  const fresh = await browser.newContext()
  try {
    const target = await fresh.newPage(), errors: string[] = []
    target.on('pageerror', error => errors.push(error.message))
    target.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await target.goto(new URL('/?starter', page.url()).href)
    await openView(target, 'Library')
    const targetPanel = libraryPanel(target)
    await targetPanel.getByLabel('Import library bundle', { exact: true }).setInputFiles(bundlePath)
    await target.getByRole('dialog', { name: 'Bundle review' }).getByRole('button', { name: 'Import', exact: true }).click()
    await expect(targetPanel.getByRole('status')).toContainText('Library saved')
    await target.reload()
    await openView(target, 'Library')
    // The import's new folder holds the bundle's folders: open them down to the exported one.
    for (const name of ['Nested', 'Exchange']) {
      await treeRow(targetPanel, name).first().click()
      await treeRow(targetPanel, name).first().press('ArrowRight')
    }
    await treeRow(targetPanel, 'Nested').last().click()
    await treeRow(targetPanel, 'Nested').last().press('ArrowRight')
    await expect(treeRow(targetPanel, 'Nested').last()).toHaveAttribute('aria-label', 'Nested, 1 item')
    await expect(treeRow(targetPanel, 'Exchange instrument')).toHaveCount(1)
    expect(errors).toEqual([])
  } finally { await fresh.close() }
})

test('records production Chromium review latency for a legal near-limit folder chain', async ({ page, browser }, testInfo) => {
  const os = await import('node:os')
  const catalog = { ...emptyLibrary(), folders: Array.from({ length: 1023 }, (_, i) => ({ id: `f${i}`, name: `Folder ${i}`, parentId: i ? `f${i - 1}` : null })) }
  const file = await exportLibraryBundle(catalog, { folderIds: ['f0'] }, 'Folder chain', async () => undefined)
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  const start = performance.now()
  await panel.getByLabel('Import library bundle', { exact: true }).setInputFiles({ name: file.fileName, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) })
  const review = page.getByRole('dialog', { name: 'Bundle review' })
  await expect(review).toContainText('1023 folders')
  await expect(review.getByRole('button', { name: 'Import', exact: true })).toBeEnabled()
  const reviewMs = performance.now() - start
  await testInfo.attach('folder-review-measurement.json', { body: JSON.stringify({ cpu: os.cpus()[0]?.model, platform: os.platform(), arch: os.arch(), browser: browser.version(), folders: 1023, reviewMs, includes: 'upload, stage validation, review rendering and browser polling; no callback deadline measurement' }, null, 2), contentType: 'application/json' })
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
})
