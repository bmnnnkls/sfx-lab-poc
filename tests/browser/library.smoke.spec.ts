import { serializeProject, parseProject } from '../../src/core'
import { samplePresetProject } from './preset-project'
import { test, expect, expectSaved } from './fixtures'

test('library folders, associated presets, independent insert/undo/reload and trash survive production storage', async ({ page }, testInfo) => {
  const fixture = samplePresetProject()
  await page.addInitScript(saved => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(fixture.project))
  await page.goto('/')
  await page.getByRole('button', { name: 'Samples', exact: true }).click()
  await page.getByTestId('sample-input').setInputFiles(fixture.samples.map(s => ({ name: `${s.info.name}.wav`, mimeType: 'audio/wav', buffer: Buffer.from(s.bytes) })))
  for (const sample of fixture.samples) await expect(page.getByRole('button', { name: `Preview ${sample.info.name}`, exact: true })).toBeEnabled()
  await page.getByText('Sweep', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Personal library' })
  await panel.getByLabel('Library name', { exact: true }).fill('Collection')
  await panel.getByRole('button', { name: 'New folder', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Collection', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Collection', exact: true }).click()
  await panel.getByLabel('Library name', { exact: true }).fill('Two samples')
  await panel.getByRole('button', { name: 'Save asset + presets', exact: true }).click()
  const items = panel.getByLabel('Library items', { exact: true })
  await expect(items.getByRole('button')).toHaveCount(3)
  await items.getByRole('button', { name: /^Two samples/ }).click()
  await expect(panel.getByRole('article')).toContainText('2 presets · 2 samples')
  await panel.getByRole('button', { name: 'Insert new instrument track', exact: true }).click()
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
  await panel.getByRole('button', { name: 'Trash item + associated presets', exact: true }).click()
  await expect(items.getByRole('button')).toHaveCount(0)
  await expectSaved(page); expect((await read()).tracks).toHaveLength(3)
  await page.reload()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await panel.getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(items.getByRole('button')).toHaveCount(3)
  expect((await read()).presets).toHaveLength(5)
  await items.getByRole('button', { name: /^Two samples/ }).click()
  await panel.getByRole('button', { name: 'Restore item', exact: true }).click()
  await panel.getByRole('button', { name: 'Back to library', exact: true }).click()
  await panel.getByRole('button', { name: 'Collection', exact: true }).click()
  await expect(items.getByRole('button')).toHaveCount(3)
  await items.getByRole('button', { name: /^Two samples/ }).click()
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
  await page.getByText('File', { exact: true }).click()
  await page.getByRole('button', { name: /^Starter/ }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Personal library' })
  await panel.getByLabel('Library name', { exact: true }).fill('Preview synth')
  await panel.getByRole('button', { name: 'Save asset + presets', exact: true }).click()
  await panel.getByLabel('Library items', { exact: true }).getByRole('button', { name: /^Preview synth/ }).click()
  const baseline = await page.evaluate(() => (window as unknown as { __libraryContexts: AudioContext[] }).__libraryContexts.length)
  const saved = await page.evaluate(() => localStorage.getItem('sfxlab:project'))
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __libraryStarted: boolean }).__libraryStarted)).toBe(true)
  await page.getByRole('button', { name: 'Sounds', exact: true }).click()
  await expect.poll(() => page.evaluate(before => { const contexts = (window as unknown as { __libraryContexts: AudioContext[] }).__libraryContexts.slice(before); return contexts.length > 0 && contexts.every(c => c.state === 'closed') }, baseline)).toBe(true)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await panel.getByLabel('Library items', { exact: true }).getByRole('button', { name: /^Preview synth/ }).click()
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.getByText('Master', { exact: true }).first().click()
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
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Personal library' })
  await expect(panel.getByRole('status')).toContainText('Close older SFX Lab tabs')
  await legacyPage.close()
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Library saved')
  const bytes = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const r = indexedDB.open('sfxlab', 2)
    r.onsuccess = () => { const q = r.result.transaction('samples').objectStore('samples').get('retained'); q.onsuccess = () => { resolve(Array.from(q.result as Uint8Array)); r.result.close() }; q.onerror = () => reject(q.error) }
    r.onerror = () => reject(r.error)
  }))
  expect(bytes).toEqual([7, 8, 9])
})
