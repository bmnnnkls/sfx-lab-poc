import { test, expect, expectSound, openView } from '../support/fixtures'
import { installAudioTap, listen } from '../support/audio-tap'

/*
 * A stereo file through an audio track on the real worklet (round 11a): a sine on the left and silence on the right.
 * A new audio track's `Track in` runs in stereo, so only the left is heard; switched off, the track plays the average
 * of the channels, half the level, in both.
 */

const SILENT = 0.0001

/** A 2 s stereo 16-bit WAV at 48 kHz: a 440 Hz sine at half scale on the left, silence on the right. */
const leftOnlyWav = (): Buffer => {
  const rate = 48000
  const frames = rate * 2
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 16384), i * 4)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

test('a stereo file plays in stereo through a new audio track, and as its average once Track in is switched off', async ({ page }) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Left tone.wav', mimeType: 'audio/wav', buffer: leftOnlyWav() })
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(1)
  await samples.getByRole('listitem').filter({ hasText: 'Left tone' }).getByRole('button', { name: 'New audio track', exact: true }).click()

  await openView(page, 'Mixer')
  for (const name of ['Bass', 'Lead', 'Pad']) await page.getByRole('button', { name: `${name} mute`, exact: true }).click()
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  await expectSound(page)
  const stereo = await listen(page)
  expect(stereo.peak[0]).toBeGreaterThan(0.1)
  expect(stereo.peak[1]).toBeLessThan(SILENT)

  // The new track is selected; its Track in is the node that runs in stereo.
  const effects = await openView(page, 'Effects')
  await effects.locator('[data-node]').filter({ hasText: 'Track in' }).first().click()
  const stereoSwitch = page.getByRole('checkbox', { name: 'Stereo', exact: true })
  await expect(stereoSwitch).toBeChecked()
  await stereoSwitch.uncheck()
  await page.waitForTimeout(300) // Drain audio buffered before the graph reached the worklet.
  const mono = await listen(page)
  expect(mono.diffPeak).toBeLessThan(SILENT)
  expect(mono.peak[1]! / stereo.peak[0]!).toBeGreaterThan(0.4)
  expect(mono.peak[1]! / stereo.peak[0]!).toBeLessThan(0.6)
})
