import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { test, expect, openExample, expectSound, expectSaved, openView } from './fixtures'

test('both examples play through the production AudioWorklet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Project name')).toHaveValue('Low Light')
  await page.getByRole('button', { name: 'Launch scene 7, Drop', exact: true }).click()
  await expectSound(page)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await openExample(page, 'Glass Rain')
  await page.getByRole('button', { name: 'Launch scene 4' }).click()
  await expectSound(page)
})

test('a panel gesture undoes once and persists after reload', async ({ page }) => {
  await page.goto('/')
  const showFilter = async () => {
    await page.getByText('Master', { exact: true }).first().click()
    await openView(page, 'Effects')
    await page.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Panel', exact: true }).click()
    return page.getByRole('slider', { name: 'DJ filter', exact: true })
  }
  const filter = await showFilter()
  const initial = await filter.getAttribute('aria-valuenow')
  expect(initial).not.toBeNull()
  const bounds = await filter.boundingBox()
  if (!bounds) throw new Error('DJ filter has no bounds')
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await expect(filter).not.toHaveAttribute('aria-valuenow', initial!)
  const edited = await filter.getAttribute('aria-valuenow')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(filter).toHaveAttribute('aria-valuenow', initial!)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(filter).toHaveAttribute('aria-valuenow', edited!)
  await expectSaved(page)
  await page.reload()
  await expect(await showFilter()).toHaveAttribute('aria-valuenow', edited!)
})

test('a sample package restores project and audio bytes into a fresh browser', async ({ page, browser }, testInfo) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await page.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  await page.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: 'New sampler track', exact: true }).click()
  await page.getByLabel('Project name').fill('Smoke package')
  await expectSaved(page)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:project')!))

  await page.getByText('File', { exact: true }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export to file…', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toBe('smoke-package.sfxlab')
  const packagePath = testInfo.outputPath('smoke-package.sfxlab')
  await download.saveAs(packagePath)
  const entries = unzipSync(await readFile(packagePath))
  expect(JSON.parse(strFromU8(entries['project.json']!))).toEqual(saved)
  const packaged = Object.entries(entries).filter(([name]) => name.startsWith('samples/'))
  expect(packaged).toHaveLength(5)
  for (const [, bytes] of packaged) expect(bytes.length).toBeGreaterThan(44)

  // An independent context proves the import brings its bytes, rather than reusing the source database.
  const destination = await browser.newContext()
  try {
    const imported = await destination.newPage()
    const errors: string[] = []
    imported.on('pageerror', (error) => errors.push(error.message))
    imported.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await imported.goto(new URL('/?starter', page.url()).href)
    await openView(imported, 'Samples')
    await expect(imported.getByRole('listitem')).toHaveCount(0)
    await imported.getByText('File', { exact: true }).click()
    const [chooser] = await Promise.all([
      imported.waitForEvent('filechooser'),
      imported.getByRole('button', { name: 'Import from file…', exact: true }).click(),
    ])
    await chooser.setFiles(packagePath)
    await expect(imported.getByLabel('Project name')).toHaveValue('Smoke package')
    await expect((await openView(imported, 'Samples')).locator('[data-status="ready"]')).toHaveCount(5)
    await expectSaved(imported)
    expect(await imported.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:project')!))).toEqual(saved)
    await imported.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
    await expectSound(imported)
    await imported.getByRole('button', { name: 'Stop', exact: true }).first().click()
    await imported.reload()
    await expect((await openView(imported, 'Samples')).locator('[data-status="ready"]')).toHaveCount(5)
    expect(errors).toEqual([])
  } finally {
    await destination.close()
  }
})

test('shared module uses retain independent base values through separate gestures, undo and reload', async ({ page }) => {
  const text = await readFile(new URL('../../src/core/persistence/fixtures/v2-instance-values.sfxlab.json', import.meta.url), 'utf8')
  await page.addInitScript((fixture) => {
    if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', fixture)
  }, text)
  await page.goto('/')
  const panel = async () => {
    const instrument = await openView(page, 'Instrument')
    await instrument.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Panel', exact: true }).click()
    return instrument
  }
  const instrument = await panel()
  const a = page.getByRole('slider', { name: 'A: Amount', exact: true })
  const b = page.getByRole('slider', { name: 'B: Amount', exact: true })
  await expect(a).toHaveAttribute('aria-valuenow', '0.7')
  await expect(b).toHaveAttribute('aria-valuenow', '0.2')
  await a.focus()
  await page.keyboard.press('ArrowUp')
  await expect(a).toHaveAttribute('aria-valuenow', '0.71')
  await page.keyboard.press('ArrowUp')
  await expect(a).toHaveAttribute('aria-valuenow', '0.72')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(a).toHaveAttribute('aria-valuenow', '0.71')
  await expect(b).toHaveAttribute('aria-valuenow', '0.2')
  await instrument.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Graph', exact: true }).click()
  await instrument.getByTestId('node-a').locator('[data-header]').click()
  const property = instrument.getByTestId('properties').getByRole('slider', { name: 'Amount', exact: true })
  await expect(property).toHaveValue('710')
  await property.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(property).toHaveValue('709')
  await panel()
  await expect(a).toHaveAttribute('aria-valuenow', '0.709')
  await expectSaved(page)
  await page.reload()
  await panel()
  await expect(a).toHaveAttribute('aria-valuenow', '0.709')
  await expect(b).toHaveAttribute('aria-valuenow', '0.2')
})
