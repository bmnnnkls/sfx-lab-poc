import { serializeProject } from '../../../src/core'
import { test, expect, viewRoot } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'
import { installAudioTap, listen } from '../support/audio-tap'
import { expressionProject } from '../support/expression-project'

/** The tap's buffer still holds a little of what came before a change, so let it pass before listening. */
const level = async (page: import('@playwright/test').Page) => {
  await page.waitForTimeout(250)
  return Math.max(...(await listen(page)).peak)
}

test('a bend recorded with ● plays back in the real worklet at the pitch it was played', async ({ page }) => {
  await page.addInitScript((saved) => localStorage.setItem('sfxlab:project', saved), serializeProject(expressionProject()))
  await installMidiPorts(page); await installAudioTap(page); await page.goto('/')
  await page.getByRole('button', { name: 'Bender', exact: true }).click()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await page.getByRole('button', { name: 'Close MIDI settings', exact: true }).click()
  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Arm Bender for recording', exact: true }).click()
  await session.getByRole('button', { name: 'Record a clip here', exact: true }).first().click()
  await expect(session.locator('[data-recording]')).toHaveAttribute('data-recording', 'recording')

  // Once the take has started (at the clip's launch), A4 held with the wheel all the way up: two semitones, heard live.
  await page.waitForTimeout(600)
  await sendMidi(page, [0x90, 69, 127])
  await sendMidi(page, [0xe0, 127, 127])
  const live = await level(page)
  expect(live).toBeGreaterThan(0.01)
  await sendMidi(page, [0xe0, 0, 64])
  await sendMidi(page, [0x80, 69, 0])
  await session.getByRole('button', { name: 'Stop recording Clip 2', exact: true }).click()
  await expect(session.locator('[data-recording]')).toHaveCount(0, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  // Disarmed, the track no longer hears the keyboard as an armed track would.
  await session.getByRole('button', { name: 'Arm Bender for recording', exact: true }).click()

  // Played back with no keyboard: the recorded bend lifts the note as the wheel did.
  expect(await level(page)).toBeLessThan(0.002)
  await session.getByRole('button', { name: 'Play Clip 2', exact: true }).click()
  const played = await level(page)
  expect(played / live).toBeGreaterThan(0.95)
  expect(played / live).toBeLessThan(1.05)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})
