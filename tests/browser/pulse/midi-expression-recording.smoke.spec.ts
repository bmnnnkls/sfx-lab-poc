import { createDemoProject, parseProject, serializeProject } from '../../../src/core'
import { test, expect, expectSaved, openView, viewRoot } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'

/* Recording pitch bend, pressure and CCs with the notes (MIDI expression, part 3), with fake ports. */

/** One instrument track with every slot empty, and another so the first isn't the only one to follow. */
const project = () => {
  const demo = createDemoProject()
  const [synth, other] = demo.tracks.filter((t) => t.kind === 'instrument')
  return { ...demo, tracks: [{ ...synth!, name: 'Keys synth', clips: synth!.clips.map(() => null) }, { ...other!, name: 'Other' }] }
}
/** The lanes of Keys synth's first clip in the saved project, as `pitchBend`, `cc1`, `cc74`… */
const savedLanes = async (page: import('@playwright/test').Page) => {
  const saved = parseProject((await page.evaluate(() => localStorage.getItem('sfxlab:project')))!)
  if (!saved.ok) throw new Error(saved.error)
  const track = saved.project.tracks[0]!
  const clip = track.kind === 'instrument' ? track.clips[0] : null
  return (clip?.automation ?? []).map((lane) => (lane.target.kind === 'expression' ? (lane.target.control === 'cc' ? `cc${lane.target.cc}` : lane.target.control) : 'other')).sort()
}

test('● records the wheel, the mod wheel and a ticked CC as lanes with the notes; undo, redo and reload keep them together', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(project()))
  await installMidiPorts(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  const settings = page.getByRole('region', { name: 'MIDI settings', exact: true })
  await expect(settings).toContainText('MIDI: enabled')
  // Tick CC 74 under Recorded CCs; 1 and 64 can't be ticked.
  const recorded = settings.getByRole('group', { name: 'Recorded CCs', exact: true })
  await expect(recorded).toContainText('none')
  await recorded.getByLabel('CC to record', { exact: true }).fill('64')
  await expect(recorded.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  await recorded.getByLabel('CC to record', { exact: true }).fill('74')
  await recorded.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(recorded).toContainText('74 Brightness')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()

  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Arm Keys synth for recording', exact: true }).click()
  await session.getByRole('button', { name: 'Record a clip here', exact: true }).first().click()
  await expect(session.locator('[data-recording]')).toHaveAttribute('data-recording', 'recording')
  await sendMidi(page, [0x90, 60, 100])
  // The wheel up and back, the mod wheel, CC 74 (ticked) and CC 73 (not).
  for (const msb of [72, 88, 104, 120, 127, 96, 64]) { await sendMidi(page, [0xe0, 0, msb]); await page.waitForTimeout(20) }
  for (const value of [10, 40, 80, 120]) { await sendMidi(page, [0xb0, 1, value]); await page.waitForTimeout(20) }
  for (const value of [20, 60, 100]) { await sendMidi(page, [0xb0, 74, value]); await sendMidi(page, [0xb0, 73, value]); await page.waitForTimeout(20) }
  await page.waitForTimeout(150)
  await sendMidi(page, [0x80, 60, 0])

  await session.getByRole('button', { name: 'Stop recording Clip 1', exact: true }).click()
  await expect(session.locator('[data-recording]')).toHaveCount(0, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await session.getByRole('button', { name: 'Edit Clip 1', exact: true }).click()
  const clip = await openView(page, 'Clip')
  await expect(clip.locator('[data-note-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  for (const name of ['MIDI / Pitch bend', 'MIDI / CC 1 Mod wheel', 'MIDI / CC 74 Brightness']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  await expectSaved(page)
  expect(await savedLanes(page)).toEqual(['cc1', 'cc74', 'pitchBend'])

  // One undo step: notes and lanes go together, and come back together.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(session.getByRole('button', { name: /Clip 1/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expectSaved(page)
  expect(await savedLanes(page)).toEqual(['cc1', 'cc74', 'pitchBend'])

  // The take is saved like any clip; the ticked CC is kept per browser.
  await page.reload()
  await session.getByRole('button', { name: 'Edit Clip 1', exact: true }).click()
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'MIDI / Pitch bend', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Recorded CCs', exact: true })).toContainText('74 Brightness')
})
