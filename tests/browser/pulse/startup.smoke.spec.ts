import { readFile } from 'node:fs/promises'
import { importProject } from '../../../src/storage'
import { test, expect, openFileMenu } from '../support/fixtures'

test('audio startup failure stays visible while editing, undo/autosave and project export remain available', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __audioUnhandledRejections?: string[]; __audioBootFailureInjected?: boolean }
    state.__audioUnhandledRejections = []
    window.addEventListener('unhandledrejection', (event) => {
      state.__audioUnhandledRejections!.push(String(event.reason))
    })

    const workletPrototype = (globalThis as typeof globalThis & { AudioWorklet?: { prototype: object } }).AudioWorklet?.prototype
    if (!workletPrototype) throw new Error('AudioWorklet prototype is unavailable in Chromium')
    Object.defineProperty(workletPrototype, 'addModule', {
      configurable: true,
      writable: true,
      value: () => {
        state.__audioBootFailureInjected = true
        return Promise.reject(new Error('injected AudioWorklet module failure'))
      },
    })
  })

  await page.goto('/')
  const originalName = await page.getByLabel('Project name').inputValue()
  await page.getByRole('button', { name: 'Play', exact: true }).click()

  // It sits in the status bar.
  const failure = page.getByRole('contentinfo').getByRole('alert')
  await expect(failure).toContainText('Audio failed to start—reload to retry')
  await expect(failure).toContainText('save or export your work before reloading')
  expect(await page.evaluate(() => (window as typeof window & { __audioBootFailureInjected?: boolean }).__audioBootFailureInjected)).toBe(true)

  const name = page.getByLabel('Project name')
  await name.fill('CR2 recovery edit')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:project') ?? 'null')?.project.name)).toBe('CR2 recovery edit')
  await expect(failure).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(name).toHaveValue(originalName)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:project') ?? 'null')?.project.name)).toBe(originalName)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(name).toHaveValue('CR2 recovery edit')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sfxlab:project') ?? 'null')?.project.name)).toBe('CR2 recovery edit')

  await openFileMenu(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export to file…', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.sfxlab(?:\.json)?$/)
  const exportPath = await download.path()
  if (!exportPath) throw new Error('Project export did not produce a downloadable file')
  const exported = await importProject(await readFile(exportPath))
  expect(exported.ok).toBe(true)
  if (!exported.ok) throw new Error(exported.error)
  expect(exported.project.name).toBe('CR2 recovery edit')
  await expect(failure).toBeVisible()
  expect(await page.evaluate(() => (window as typeof window & { __audioUnhandledRejections?: string[] }).__audioUnhandledRejections)).toEqual([])
})
