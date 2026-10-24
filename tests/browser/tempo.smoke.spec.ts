import { readFileSync } from 'node:fs'
import { test, expect, expectSaved, openView } from './fixtures'

test('delay divisions report limits at project tempo and survive undo/reload', async ({ page }, testInfo) => {
  const fixture = readFileSync(new URL('../../src/core/persistence/fixtures/v8-delay-timing.sfxlab.json', import.meta.url), 'utf8')
  await page.addInitScript(saved => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, fixture)
  await page.goto('/')
  const selectEcho = async () => {
    await openView(page, 'Effects')
    await page.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Graph', exact: true }).click()
    await page.getByTestId('node-echo').locator('[data-header]').click()
  }
  await selectEcho()
  const timing = page.getByLabel('Delay timing', { exact: true })
  await expect(timing).toContainText('1/8 dotted · 0.450 s at 100 BPM')
  const division = page.getByRole('combobox', { name: 'Beat division', exact: true })
  await division.selectOption({ label: '4 bars dotted' })
  await expect(timing).toContainText('Requested 14.400 s exceeds capacity; capped at 8 s')
  await page.screenshot({ path: testInfo.outputPath('delay-limit.png') })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(division).toHaveValue('8')
  await division.selectOption({ label: '1/4 triplet' })
  await expect(timing).toContainText('1/4 triplet · 0.400 s')
  await expectSaved(page)
  await page.reload(); await selectEcho()
  await expect(division).toHaveValue('12')
  await expect(timing).toContainText('1/4 triplet · 0.400 s')
})
