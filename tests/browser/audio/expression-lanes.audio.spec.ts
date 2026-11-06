import { serializeProject } from '../../../src/core'
import { test, expect } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'
import { installAudioTap, listen } from '../support/audio-tap'
import { bendLane, expressionProject } from '../support/expression-project'

/** The tap's buffer still holds a little of what came before a change, so let it pass before listening. */
const level = async (page: import('@playwright/test').Page) => {
  await page.waitForTimeout(250)
  return Math.max(...(await listen(page)).peak)
}

test('a clip\u2019s bend lane bends its held note in the real worklet, and the wheel takes it over until Re-enable', async ({ page }) => {
  // The lane holds the wheel all the way up: A4 two semitones higher.
  await page.addInitScript((saved) => localStorage.setItem('sfxlab:project', saved), serializeProject(expressionProject([bendLane(1)])))
  await installMidiPorts(page); await installAudioTap(page); await page.goto('/')
  await page.getByRole('button', { name: 'Bender', exact: true }).click()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await page.getByRole('button', { name: 'Close MIDI settings', exact: true }).click()
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  const bent = await level(page)
  expect(bent).toBeGreaterThan(0.01)

  // The wheel moved while the lane plays: the live value wins, the same bend from the wheel sounds the same, and the
  // lane's header says it is overridden.
  await sendMidi(page, [0xe0, 127, 127])
  const wheel = await level(page)
  expect(wheel / bent).toBeGreaterThan(0.95)
  expect(wheel / bent).toBeLessThan(1.05)
  await sendMidi(page, [0xe0, 0, 64])
  expect(await level(page)).toBeLessThan(0.002)
  await page.getByRole('button', { name: 'Edit Held', exact: true }).click()
  await page.getByRole('button', { name: 'Automation', exact: true }).click()
  await expect(page.getByText('Override', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Re-enable automation', exact: true }).click()
  expect(await level(page)).toBeGreaterThan(bent * 0.95)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
  expect(await level(page)).toBeLessThan(0.002)
})
