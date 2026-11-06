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

test('the metronome, the ● Rec menu and the latency offset are kept per browser', async ({ page }) => {
  await page.goto('/')
  const metronome = page.getByRole('button', { name: 'Metronome', exact: true })
  await expect(metronome).toHaveAttribute('aria-pressed', 'false')
  await metronome.click()
  await expect(metronome).toHaveAttribute('aria-pressed', 'true')
  // ♩ is only a toggle now: its settings are in ● Rec's menu, with the count-in.
  await expect(page.getByRole('button', { name: 'Metronome and recording settings', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Recording settings', exact: true }).click()
  await expect(page.getByRole('menuitem')).toHaveText([/^Fixed recording length/, /^Count-in/, /^Metronome level/])
  await page.getByRole('menuitem', { name: 'Fixed recording length', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: '2 bars', exact: true }).click()
  await page.getByRole('button', { name: 'Recording settings', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Count-in', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: '1 bar', exact: true }).click()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByLabel('Latency offset (ms)', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Metronome', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Recording settings', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Fixed recording length', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: '2 bars', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Recording settings', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Count-in', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: '1 bar', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await expect(page.getByLabel('Latency offset (ms)', { exact: true })).toHaveValue('12')
})

/** MIDI on, from the settings panel. */
const enableMidi = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()
}

test('● Rec overdubs a playing clip on an armed track, pass after pass, as one undo step', async ({ page }) => {
  // A one-bar clip, so a second pass comes quickly.
  const demo = project()
  const [keys] = demo.tracks
  const withLoop = { ...demo, tempo: 240, tracks: [{ ...keys!, clips: keys!.clips.map((_, i) => (i === 0 ? { id: 'loop', name: 'Loop', lengthBeats: 4, notes: [] } : null)) }, demo.tracks[1]!] }
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject(withLoop))
  await installMidiPorts(page)
  await page.goto('/')
  await enableMidi(page)
  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Arm Keys synth for recording', exact: true }).click()

  // F9 and the button both toggle ● Rec; nothing plays yet, so it says what to do.
  const rec = page.getByRole('button', { name: 'Record', exact: true })
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('F9')
  await expect(rec).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText('Launch a clip on an armed track, or press ▶ on the Arrangement, to record')
  await rec.click()
  await expect(rec).toHaveAttribute('aria-pressed', 'false')

  await session.getByRole('button', { name: '▶ Loop' }).click()
  await expect(session.getByRole('button', { name: /■ Loop/ })).toBeVisible()
  await rec.click()
  await expect(session.getByRole('img', { name: 'overdubbing' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText('Overdubbing Keys synth')
  await session.getByRole('button', { name: 'Edit Loop', exact: true }).click()
  const clip = await openView(page, 'Clip')
  await sendMidi(page, [0x90, 60, 100]); await page.waitForTimeout(100); await sendMidi(page, [0x80, 60, 0])
  await expect(clip.locator('[data-note-id]')).toHaveCount(1)
  // A second pass (a bar is a second at 240 BPM) adds to the first.
  await page.waitForTimeout(1100)
  await sendMidi(page, [0x90, 67, 100]); await page.waitForTimeout(100); await sendMidi(page, [0x80, 67, 0])
  await expect(clip.locator('[data-note-id]')).toHaveCount(2)
  await expect(clip.getByLabel('Clip length in beats')).toHaveValue('4')
  await page.keyboard.press('F9')
  await expect(rec).toHaveAttribute('aria-pressed', 'false')
  await expect(session.getByRole('img', { name: 'overdubbing' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  // The overdub is one undo step.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(clip.locator('[data-note-id]')).toHaveCount(0)
})

test('a count-in clicks a bar before a take from a stopped transport, and ■ during it records nothing', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject({ ...project(), tempo: 120 }))
  await page.addInitScript(() => localStorage.setItem('sfxlab:record', JSON.stringify({ countInBars: 1 })))
  await installMidiPorts(page)
  await page.goto('/')
  await enableMidi(page)
  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Arm Keys synth for recording', exact: true }).click()
  const record = session.getByRole('button', { name: 'Record a clip here', exact: true })
  const countIn = page.getByRole('status', { name: 'Count-in' })

  // ■ during the count-in: no take, and no empty clip left behind.
  await record.first().click()
  await expect(countIn).toHaveText('Count-in 1')
  await expect(session.locator('[data-recording]')).toHaveAttribute('data-recording', 'queued')
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  await expect(countIn).toHaveCount(0)
  await expect(session.locator('[data-recording]')).toHaveCount(0)
  await expect(record).toHaveCount(4)

  // Let it run: after a bar (2 s at 120 BPM) the take starts, and a note played then lands near its first beat.
  await record.first().click()
  await expect(countIn).toHaveText('Count-in 1')
  await expect(session.locator('[data-recording]')).toHaveAttribute('data-recording', 'recording', { timeout: 4000 })
  await expect(countIn).toHaveCount(0)
  await sendMidi(page, [0x90, 60, 100]); await page.waitForTimeout(100); await sendMidi(page, [0x80, 60, 0])
  await session.getByRole('button', { name: 'Edit Clip 1', exact: true }).click()
  const clip = await openView(page, 'Clip')
  await expect(clip.locator('[data-note-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})

test('with ● Rec on, ▶ on the arrangement records an armed track into a new region, as one undo step', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) }, serializeProject({ ...project(), tempo: 240 }))
  await installMidiPorts(page)
  await page.goto('/')
  await enableMidi(page)
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByRole('button', { name: 'Arm Keys synth for recording', exact: true }).click()
  const rec = page.getByRole('button', { name: 'Record', exact: true })
  await rec.click()
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText('Launch a clip on an armed track, or press ▶ on the Arrangement, to record')
  const regions = arrangement.getByTestId('arrangement-region')
  await expect(regions).toHaveCount(0)

  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText('Recording Keys synth')
  // Before the first note, an outline shows what records; the region appears red with the note, and grows.
  await expect(arrangement.getByTestId('arrangement-recording-outline')).toBeVisible()
  await sendMidi(page, [0x90, 60, 100]); await page.waitForTimeout(150); await sendMidi(page, [0x80, 60, 0])
  await expect(regions).toHaveCount(1)
  await expect(regions.first()).toHaveAttribute('data-recording', 'true')
  const width = (await regions.first().boundingBox())!.width
  await page.waitForTimeout(1200) // more than a bar at 240 BPM
  await sendMidi(page, [0x90, 64, 100]); await page.waitForTimeout(150); await sendMidi(page, [0x80, 64, 0])
  await expect.poll(async () => (await regions.first().boundingBox())!.width).toBeGreaterThan(width)
  await expect(regions.first().locator('[class*="noteRect"]')).toHaveCount(2)

  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(regions.first()).not.toHaveAttribute('data-recording')
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText(/^Recorded \d+ bars? on Keys synth$/)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(regions).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(regions).toHaveCount(1)
  await expectSaved(page)
  await page.reload()
  await expect((await openView(page, 'Arrangement')).getByTestId('arrangement-region').locator('[class*="noteRect"]')).toHaveCount(2)
})

test('with the loop brace on, two passes record into one region', async ({ page }) => {
  await page.addInitScript((saved) => { if (!localStorage.getItem('sfxlab:project')) localStorage.setItem('sfxlab:project', saved) },
    serializeProject({ ...project(), tempo: 240, arrangementLoop: { from: 0, to: 4, enabled: true } }))
  await installMidiPorts(page)
  await page.goto('/')
  await enableMidi(page)
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByRole('button', { name: 'Arm Keys synth for recording', exact: true }).click()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Recording' })).toHaveText('Recording Keys synth')
  // The outline shows once the transport runs: a note before that has no beat yet.
  await expect(arrangement.getByTestId('arrangement-recording-outline')).toBeVisible()
  await sendMidi(page, [0x90, 60, 100]); await page.waitForTimeout(100); await sendMidi(page, [0x80, 60, 0])
  // A bar is a second at 240 BPM: the next note is in the second pass.
  await page.waitForTimeout(1100)
  await sendMidi(page, [0x90, 67, 100]); await page.waitForTimeout(100); await sendMidi(page, [0x80, 67, 0])
  const regions = arrangement.getByTestId('arrangement-region')
  await expect(regions).toHaveCount(1)
  await expect(regions.first().locator('[class*="noteRect"]')).toHaveCount(2)
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()
  await regions.first().dblclick()
  const clip = await openView(page, 'Clip')
  await expect(clip.locator('[data-note-id]')).toHaveCount(2)
  await expect(clip.getByLabel('Clip length in beats')).toHaveValue('4')
})
