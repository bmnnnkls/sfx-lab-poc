import { readFile } from 'node:fs/promises'
import { captureLibraryAsset, emptyLibrary, saveLibraryFolder, parseProject } from '../../src/core'
import { stageLibraryBundle, exportLibraryBundle, importProject } from '../../src/storage'
import { samplePresetProject } from './preset-project'
import { test, expect, expectSaved, openView } from './fixtures'

test('bundle review/cancel/export/import into fresh and conflicting libraries survives reload and independent project package export', async ({ page, browser }, testInfo) => {
  const fixture = samplePresetProject(), scope = { owner: { kind: 'track' as const, trackId: 'sweep' }, domain: 'patch' as const }
  const catalog = captureLibraryAsset(saveLibraryFolder(emptyLibrary(), 'Nested', null, 'nested'), fixture.project, scope, 'Exchange instrument', 'nested')
  const file = await exportLibraryBundle(catalog, { folderIds: ['nested'] }, 'Exchange', async id => fixture.samples.find(s => s.info.id === id)?.bytes)
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = page.getByRole('region', { name: 'Personal library' }), items = panel.getByLabel('Library items', { exact: true })
  const upload = async () => panel.getByLabel('Import library bundle', { exact: true }).setInputFiles({ name: file.fileName, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) })
  await upload()
  const review = panel.getByRole('region', { name: 'Bundle review' })
  await expect(review).toContainText('3 items · 1 folders · 1 immutable revisions · 2 samples')
  await expect(review).toContainText('0 missing sample files')
  await expect(items.getByRole('button')).toHaveCount(0)
  await review.getByRole('button', { name: 'Cancel bundle', exact: true }).click()
  await expect(items.getByRole('button')).toHaveCount(0)
  for (let n = 0; n < 2; n++) {
    await upload()
    await review.getByRole('button', { name: 'Import into new folder', exact: true }).click()
    await expect(panel.getByRole('status')).toContainText('Library saved')
    await expect(panel.getByRole('button', { name: 'Exchange', exact: true })).toHaveCount(n + 1)
  }
  // Fresh IDs make both imported roots coexist with no name-based overwrite.
  await page.reload()
  await openView(page, 'Library')
  await panel.getByRole('button', { name: 'Exchange', exact: true }).first().click()
  await panel.getByRole('button', { name: 'Nested', exact: true }).first().click()
  await expect(items.getByRole('button')).toHaveCount(3)
  await items.getByRole('button', { name: /^Exchange instrument/ }).click()
  await panel.getByRole('button', { name: 'Insert new instrument track', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('copied into project')
  await expectSaved(page)
  const saved = await page.evaluate(() => localStorage.getItem('sfxlab:project'))
  const parsed = parseProject(saved!); expect(parsed.ok && parsed.project.presets).toHaveLength(3)
  await panel.getByRole('button', { name: 'Review folder export', exact: true }).click()
  await expect(review).toContainText('3 items')
  await review.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('bundle-review.png') })
  const [download] = await Promise.all([page.waitForEvent('download'), review.getByRole('button', { name: 'Download .sfxlib', exact: true }).click()])
  const bundlePath = testInfo.outputPath('nested.sfxlib'); await download.saveAs(bundlePath)
  expect((await stageLibraryBundle(await readFile(bundlePath))).blobs.size).toBe(2)
  await page.screenshot({ path: testInfo.outputPath('bundle-panel.png') })
  await panel.getByRole('button', { name: 'Trash folder and contents', exact: true }).click()
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('sfxlab:project'))).toBe(saved)
  await page.getByText('File', { exact: true }).click()
  const [projectDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to file…', exact: true }).click()])
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
    const targetPanel = target.getByRole('region', { name: 'Personal library' })
    await targetPanel.getByLabel('Import library bundle', { exact: true }).setInputFiles(bundlePath)
    await targetPanel.getByRole('button', { name: 'Import into new folder', exact: true }).click()
    await expect(targetPanel.getByRole('status')).toContainText('Library saved')
    await target.reload()
    await openView(target, 'Library')
    await targetPanel.getByRole('button', { name: 'Nested', exact: true }).last().click()
    await expect(targetPanel.getByLabel('Library items', { exact: true }).getByRole('button')).toHaveCount(3)
    expect(errors).toEqual([])
  } finally { await fresh.close() }
})

test('records production Chromium review latency for a legal near-limit folder chain', async ({ page, browser }, testInfo) => {
  const os = await import('node:os')
  const catalog = { ...emptyLibrary(), folders: Array.from({ length: 1023 }, (_, i) => ({ id: `f${i}`, name: `Folder ${i}`, parentId: i ? `f${i - 1}` : null })) }
  const file = await exportLibraryBundle(catalog, { folderIds: ['f0'] }, 'Folder chain', async () => undefined)
  await page.goto('/?starter')
  await openView(page, 'Library')
  const panel = page.getByRole('region', { name: 'Personal library' })
  const start = performance.now()
  await panel.getByLabel('Import library bundle', { exact: true }).setInputFiles({ name: file.fileName, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) })
  await expect(panel.getByRole('region', { name: 'Bundle review' })).toContainText('1023 folders')
  await expect(panel.getByRole('button', { name: 'Import into new folder', exact: true })).toBeEnabled()
  const reviewMs = performance.now() - start
  await testInfo.attach('folder-review-measurement.json', { body: JSON.stringify({ cpu: os.cpus()[0]?.model, platform: os.platform(), arch: os.arch(), browser: browser.version(), folders: 1023, reviewMs, includes: 'upload, stage validation, review rendering and browser polling; no callback deadline measurement' }, null, 2), contentType: 'application/json' })
  await panel.getByRole('button', { name: 'Cancel bundle', exact: true }).click()
})
