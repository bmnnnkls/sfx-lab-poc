import { test, expect, expectSound, openView } from '../support/fixtures'
import { installAudioTap, listen } from '../support/audio-tap'

test('a duplicated track sounds the same as the original', async ({ page }) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  const mixer = await openView(page, 'Mixer')
  for (const name of ['Lead', 'Pad']) await mixer.getByRole('button', { name: `${name} mute`, exact: true }).click()
  // The original hard left, and (after duplicating) the copy hard right: the channels match when the copy is the same.
  await mixer.getByRole('slider', { name: 'Bass pan', exact: true }).fill('-1')
  await mixer.getByRole('region', { name: 'Bass channel', exact: true }).getByRole('button', { name: 'Bass', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await mixer.getByRole('slider', { name: 'Bass copy pan', exact: true }).fill('1')

  await page.getByRole('button', { name: 'Launch scene 1', exact: true }).click()
  await expectSound(page)
  await page.waitForTimeout(300) // Both launch at the next bar line; listen once both play.
  const heard = await listen(page)
  expect(heard.peak[0]).toBeGreaterThan(0.02)
  expect(heard.peak[1]).toBeGreaterThan(0.02)
  expect(heard.diffPeak).toBeLessThan(0.0001)
})
