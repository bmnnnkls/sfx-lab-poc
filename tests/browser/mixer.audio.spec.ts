import { test, expect, expectSound } from './fixtures'
import { installAudioTap, listen } from './audio-tap'

test('real output follows pan, master mute and undo', async ({ page }) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'Samples', exact: true }).click()
  await page.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(page.locator('[data-status="ready"]')).toHaveCount(5)
  await page.getByRole('listitem').filter({ hasText: 'Demo Drum Loop' }).getByRole('button', { name: 'New audio track', exact: true }).click()
  await page.getByRole('button', { name: 'Mixer', exact: true }).click()
  for (const name of ['Bass', 'Lead', 'Pad']) {
    await page.getByRole('button', { name: `${name} mute`, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  await expectSound(page)
  const centred = await listen(page)
  expect(centred.peak[0]).toBeGreaterThan(0.02)
  expect(centred.diffPeak).toBeLessThan(0.0001)

  const pan = page.getByRole('slider', { name: /Demo Drum Loop.* pan$/ })
  await pan.fill('-1')
  await page.waitForTimeout(300) // Drain audio buffered before the pan command reached the worklet.
  const left = await listen(page)
  expect(left.peak[0]).toBeGreaterThan(0.02)
  expect(left.peak[1]).toBeLessThan(0.0001)
  await pan.fill('1')
  await page.waitForTimeout(300)
  const right = await listen(page)
  expect(right.peak[1]).toBeGreaterThan(0.02)
  expect(right.peak[0]).toBeLessThan(0.0001)

  await page.getByRole('slider', { name: 'Master fader', exact: true }).fill('0')
  // Discard the worklet message / tap buffer transition before judging silence.
  await page.waitForTimeout(300)
  const muted = await listen(page)
  expect(Math.max(...muted.peak)).toBeLessThan(0.0001)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(300)
  const restored = await listen(page)
  expect(restored.peak[1]).toBeGreaterThan(0.02)
  expect(restored.peak[0]).toBeLessThan(0.0001)
})
