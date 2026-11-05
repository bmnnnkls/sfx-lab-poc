import { type InstrumentTrack, type Project, duplicateTrack, noteGraphFrom, parseProject, resolveControlTarget, serializeProject } from '../../../src/core'
import { sweepProject, sweepTarget } from '../support/automation-project'
import { test, expect, expectSaved, openView, saveSound, viewRoot } from '../support/fixtures'

const savedProject = async (page: import('@playwright/test').Page): Promise<Project> => {
  await expectSaved(page)
  const saved = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
  if (!saved.ok) throw new Error(saved.error)
  return saved.project
}

test('two snapshots save named in place, recall atomically, undo, morph from their rows and survive reload', async ({ page }, testInfo) => {
  await page.addInitScript(saved => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(sweepProject()))
  await page.goto('/')
  await viewRoot(page, 'Session').getByText('Master', { exact: true }).first().click()
  const sounds = await openView(page, 'Sounds')
  // The master has Effects and Track only.
  await expect(sounds.getByRole('tab')).toHaveText(['Effects', 'Track'])
  await sounds.getByRole('tab', { name: 'Track', exact: true }).click()
  // A new sound is named after its owner, and its name is ready to type over.
  await sounds.getByRole('button', { name: 'Save snapshot', exact: true }).click()
  await expect(sounds.getByRole('textbox', { name: 'Name of Master 1', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sounds.getByRole('button', { name: 'Recall Master 1', exact: true })).toBeVisible()
  await sounds.getByRole('button', { name: 'Recall Master 1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await sounds.getByRole('textbox', { name: 'Name of Master 1', exact: true }).fill('Loud')
  await page.keyboard.press('Enter')
  await openView(page, 'Mixer')
  const fader = page.getByLabel('Master fader', { exact: true })
  await fader.focus(); await fader.press('Home')
  await openView(page, 'Sounds')
  await saveSound(page, sounds, 'snapshot', 'Silent')
  const savedVolume = async () => (await savedProject(page)).master.volume ?? 1
  expect(await savedVolume()).toBe(0)
  await sounds.getByRole('button', { name: 'Recall Loud', exact: true }).click()
  expect(await savedVolume()).toBe(1)
  await expect(sounds.getByRole('status')).toContainText('controls recalled')
  await expect(sounds.getByRole('button', { name: 'Recall Loud', exact: true })).toHaveAttribute('data-recalled', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await savedVolume()).toBe(0)
  // The ● goes with the edit that changed the graph.
  await expect(sounds.getByRole('button', { name: 'Recall Loud', exact: true })).not.toHaveAttribute('data-recalled')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await savedVolume()).toBe(1)
  // Enter recalls the focused row.
  await sounds.getByRole('button', { name: 'Recall Silent', exact: true }).focus()
  await page.keyboard.press('Enter')
  expect(await savedVolume()).toBe(0)

  await page.reload()
  await viewRoot(page, 'Session').getByText('Master', { exact: true }).first().click()
  await openView(page, 'Sounds')
  await sounds.getByRole('tab', { name: 'Track', exact: true }).click()
  await sounds.getByRole('button', { name: 'Recall Loud', exact: true }).click()
  expect(await savedVolume()).toBe(1)
  await sounds.getByRole('button', { name: 'Recall Silent', exact: true }).click()
  expect(await savedVolume()).toBe(0)

  // The morph shows once A and B are set from the rows.
  const morph = sounds.getByLabel('Morph', { exact: true })
  for (const [name, end] of [['Loud', 'Set as A'], ['Silent', 'Set as B']]) {
    await expect(morph).toHaveCount(0)
    await sounds.getByRole('button', { name: `Recall ${name}`, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: end, exact: true }).click()
  }
  await expect(sounds.getByRole('button', { name: 'Recall Loud', exact: true })).toContainText('A')
  await morph.focus(); await morph.press('End')
  expect(await savedVolume()).toBe(0)
  await morph.press('Home')
  expect(await savedVolume()).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('sounds-panel.png') })
  expect(resolveControlTarget(await savedProject(page), { kind: 'mixer', owner: { kind: 'master' }, control: 'volume' })).toMatchObject({ baseValue: 1 })
})

test("a preset saved on one track lists and recalls onto another whose graph matches, and not on one whose graph doesn't", async ({ page }) => {
  // Sweep, a copy of it with its filter at 500 Hz, and Other, whose instrument is another graph.
  const base = sweepProject()
  const copied = duplicateTrack(base, 'sweep')
  const copyId = copied.trackId!
  const sweep = base.tracks[0] as InstrumentTrack
  const project: Project = {
    ...copied.project,
    tracks: [
      ...copied.project.tracks.map((track) => (track.id === copyId && track.kind === 'instrument' ? { ...track, patch: { ...track.patch, nodes: track.patch.nodes.map((node) => (node.id === 'filter' ? { ...node, params: { ...node.params, cutoff: 500 } } : node)) } } : track)),
      { ...sweep, id: 'other', name: 'Other', clips: [null, null, null, null], patch: noteGraphFrom([{ id: 'osc', type: 'oscillator', params: { frequency: 220 } }, { id: 'out', type: 'output' }], ['osc.out>out.in']) },
    ],
  }
  await page.addInitScript(saved => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(project))
  await page.goto('/')
  const session = viewRoot(page, 'Session')
  const copyName = project.tracks.find((track) => track.id === copyId)!.name
  await session.getByText('Sweep', { exact: true }).first().click()
  const sounds = await openView(page, 'Sounds')
  await expect(sounds.getByRole('tab', { name: 'Instrument', exact: true })).toHaveAttribute('aria-selected', 'true')
  await saveSound(page, sounds, 'preset', 'Bright')

  await session.getByText(copyName, { exact: true }).first().click()
  const row = sounds.getByRole('button', { name: 'Recall Bright', exact: true })
  await expect(row).toContainText('Preset · Sweep')
  await row.click()
  await expect(sounds.getByRole('status')).toContainText('controls recalled')
  const cutoff = (saved: Project, trackId: string) => resolveControlTarget(saved, { ...sweepTarget, owner: { kind: 'track', trackId } })
  const saved = await savedProject(page)
  expect(cutoff(saved, copyId)).toMatchObject({ baseValue: 2000 })
  expect(saved.presets?.map((preset) => preset.name)).toEqual(['Bright'])

  await session.getByText('Other', { exact: true }).first().click()
  await expect(sounds.getByRole('button', { name: 'Recall Bright', exact: true })).toHaveCount(0)
  await expect(sounds.getByText(/^Save a preset to keep this sound/)).toBeVisible()
  // Show all lists it again, under its own owner.
  await sounds.getByRole('button', { name: 'Sounds actions', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Show all in project', exact: true }).click()
  await expect(sounds.getByRole('heading', { name: 'Sweep · Instrument', exact: true })).toBeVisible()
  await expect(sounds.getByRole('button', { name: 'Recall Bright', exact: true })).toBeVisible()
})
