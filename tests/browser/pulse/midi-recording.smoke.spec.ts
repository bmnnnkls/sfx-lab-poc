import { createDemoProject, serializeProject } from '../../../src/core'
import { test, expect, expectSaved, openView, viewRoot } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'

/** One instrument track with every slot empty, and another so the first isn't the only one to follow. */
const project = () => {
  const demo = createDemoProject()
  const [synth, other] = demo.tracks.filter((t) => t.kind === 'instrument')
  return { ...demo, tracks: [{ ...synth!, name: 'Keys synth', clips: synth!.clips.map(() => null) }, { ...other!, name: 'Other' }] }
}

test('arm, record into a slot, end, undo, redo and reload', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(project()))
  await installMidiPorts(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()

  const session = viewRoot(page, 'Session')
  const arm = session.getByRole('button', { name: 'Arm Keys synth for recording', exact: true })
  const record = session.getByRole('button', { name: 'Record a clip here', exact: true })
  // The header's ● arms and disarms; an armed track's empty slots show ● instead of +.
  await expect(record).toHaveCount(0)
  const creates = await session.getByRole('button', { name: 'Create clip', exact: true }).count()
  await arm.click()
  await expect(arm).toHaveAttribute('aria-pressed', 'true')
  await expect(record).toHaveCount(4)
  await arm.click()
  await expect(arm).toHaveAttribute('aria-pressed', 'false')
  await expect(record).toHaveCount(0)
  // And the track's menu does too.
  await session.getByRole('button', { name: 'Keys synth', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Arm for recording', exact: true }).click()
  await expect(arm).toHaveAttribute('aria-pressed', 'true')

  await record.first().click()
  const recording = session.locator('[data-recording]')
  await expect(recording).toHaveAttribute('data-recording', 'recording')
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText('Recording Keys synth')
  await sendMidi(page, [0x90, 60, 100]); await page.waitForTimeout(150); await sendMidi(page, [0x80, 60, 0])
  await sendMidi(page, [0x90, 64, 90]); await page.waitForTimeout(150); await sendMidi(page, [0x80, 64, 0])

  // The notes are in the clip as soon as they end.
  await session.getByRole('button', { name: 'Edit Clip 1', exact: true }).click()
  const clip = await openView(page, 'Clip')
  await expect(clip.locator('[data-note-id]')).toHaveCount(2)
  await expect(clip.getByLabel('Clip length in beats')).toHaveValue('256')

  await session.getByRole('button', { name: 'Stop recording Clip 1', exact: true }).click()
  await expect(recording).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText(/^Recorded \d+ bars? into Clip 1$/)
  const length = Number(await clip.getByLabel('Clip length in beats').inputValue())
  expect(length % 4).toBe(0)
  expect(length).toBeGreaterThanOrEqual(4)
  expect(length).toBeLessThanOrEqual(12)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  // The take is one undo step: undo removes the clip, redo brings it back with its notes.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(session.getByRole('button', { name: /Clip 1/ })).toHaveCount(0)
  await expect(record).toHaveCount(4)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await session.getByRole('button', { name: 'Edit Clip 1', exact: true }).click()
  await expect(clip.locator('[data-note-id]')).toHaveCount(2)

  // Disarming brings + back; the take is saved like any clip, and the arm is not.
  await arm.click()
  await expect(record).toHaveCount(0)
  await expect(session.getByRole('button', { name: 'Create clip', exact: true })).toHaveCount(creates - 1)
  await expectSaved(page)
  await page.reload()
  await expect(session.getByRole('button', { name: 'Arm Keys synth for recording', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await session.getByRole('button', { name: 'Edit Clip 1', exact: true }).click()
  await expect((await openView(page, 'Clip')).locator('[data-note-id]')).toHaveCount(2)
  await expect(viewRoot(page, 'Clip').getByLabel('Clip length in beats')).toHaveValue(String(length))
})

test('the metronome, its menu and the latency offset are kept per browser', async ({ page }) => {
  await page.goto('/')
  const metronome = page.getByRole('button', { name: 'Metronome', exact: true })
  await expect(metronome).toHaveAttribute('aria-pressed', 'false')
  await metronome.click()
  await expect(metronome).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Metronome and recording settings', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Fixed recording length', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: '2 bars', exact: true }).click()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByLabel('Latency offset (ms)', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Metronome', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Metronome and recording settings', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Fixed recording length', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: '2 bars', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await expect(page.getByLabel('Latency offset (ms)', { exact: true })).toHaveValue('12')
})
