import { parseProject, serializeProject } from '../../../src/core'
import { test, expect, expectSaved, libraryPanel, openView, saveToLibrary, treeRow } from '../support/fixtures'
import { bendLane, expressionProject } from '../support/expression-project'

/* Pitch bend, pressure and CC lanes (MIDI expression, part 2): drawn in the clip editor, added on the timeline by
 * number, and carried by a library clip to another track. */

const savedProject = async (page: import('@playwright/test').Page) => {
  const saved = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
  if (!saved.ok) throw new Error(saved.error)
  return saved.project
}

test('a pitch bend lane is drawn in the clip editor in semitones, undone, redone and kept by a reload', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(expressionProject()))
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit Held', exact: true }).click()
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  const picker = page.getByRole('combobox', { name: 'Add automation lane', exact: true })
  // The MIDI group: bend, pressure and the mod wheel.
  await expect(picker.locator('optgroup[label="MIDI"] option')).toHaveText(['MIDI / Pitch bend', 'MIDI / Pressure', 'MIDI / CC 1 Mod wheel'])
  await picker.selectOption({ label: 'MIDI / Pitch bend' })
  const area = page.getByRole('application', { name: 'Automation drawing area' })
  const box = (await area.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5)
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.1)
  await expect(page.locator('[data-point-id]')).toHaveCount(2)
  // The value reads in semitones at the track's range (±2): near the top is near +2.
  await expect(page.getByText('Value st', { exact: true })).toBeVisible()
  const value = Number(await page.getByLabel('Point value', { exact: true }).inputValue())
  expect(value).toBeGreaterThan(1.4)
  expect(value).toBeLessThanOrEqual(2)
  await expect(page.locator('[data-point-id]').last().locator('title')).toHaveText(/ beats · \+\d\.\d\d st$/)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[data-point-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('[data-point-id]')).toHaveCount(2)
  await expectSaved(page)
  await page.reload()
  await page.getByRole('button', { name: 'Edit Held', exact: true }).click()
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'MIDI / Pitch bend', exact: true })).toBeVisible()
  await expect(page.locator('[data-point-id]')).toHaveCount(2)
})

test('CC… adds a lane for any CC on the timeline, once', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(expressionProject()))
  await page.goto('/')
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByRole('button', { name: 'Show automation lanes of Bender', exact: true }).click()
  const add = async () => arrangement.getByRole('button', { name: 'Add an automation lane to Bender', exact: true }).click()
  await add()
  const picker = arrangement.getByRole('group', { name: 'Automation targets of Bender', exact: true })
  await expect(picker.getByRole('combobox').locator('optgroup[label="MIDI"] option')).toHaveCount(3)
  await picker.getByLabel('CC number', { exact: true }).fill('64')
  await expect(picker.getByRole('button', { name: 'Add CC', exact: true })).toBeDisabled()
  await picker.getByLabel('CC number', { exact: true }).fill('74')
  await picker.getByRole('button', { name: 'Add CC 74 Brightness', exact: true }).click()
  await expect(arrangement.locator('[data-timeline-lane]')).toHaveCount(1)
  await expect(arrangement.locator('[data-timeline-lane]')).toContainText('MIDI / CC 74 Brightness')
  await add()
  await picker.getByLabel('CC number', { exact: true }).fill('74')
  await expect(picker.getByRole('button', { name: 'Add CC 74 Brightness', exact: true })).toBeDisabled()
  await expectSaved(page)
  const project = await savedProject(page)
  expect(project.arrangementAutomation?.[0]?.lanes[0]?.target).toEqual({ kind: 'expression', owner: { kind: 'track', trackId: 'bender' }, control: 'cc', cc: 74 })
})

test('a library clip keeps its bend lane, and inserted on another track bends that track', async ({ page }) => {
  await page.addInitScript((saved) => localStorage.setItem('sfxlab:project', saved), serializeProject(expressionProject([bendLane(1)])))
  await page.goto('/')
  const session = await openView(page, 'Session')
  await saveToLibrary(page, session.getByRole('button', { name: '▶ Held', exact: true }))
  await session.getByText('Other', { exact: true }).first().click()
  await openView(page, 'Library')
  const panel = libraryPanel(page)
  await treeRow(panel, 'Held').click()
  await panel.getByRole('button', { name: 'Insert into scene 1 of Other', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Clip inserted')
  await expectSaved(page)
  const project = await savedProject(page)
  const other = project.tracks.find((track) => track.id === 'other')!
  const inserted = other.kind === 'instrument' ? other.clips[0] : undefined
  expect(inserted?.automation?.map((lane) => lane.target)).toEqual([{ kind: 'expression', owner: { kind: 'track', trackId: 'other' }, control: 'pitchBend' }])
})
