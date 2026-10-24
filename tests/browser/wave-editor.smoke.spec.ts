import { test, expect, openView, viewRoot } from './fixtures'

/** A short mono 16-bit WAV of a sine at the given frequency, so each file decodes to a distinct sample. */
const wav = (frequency: number): Buffer => {
  const rate = 8000
  const frames = 800
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 12000), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

test('✎ on a sample opens it in the Wave editor beside the Samples list, and Close empties the editor', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)

  await samples.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave).toBeVisible()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  // The Samples view keeps showing its list.
  await expect(samples.getByRole('listitem')).toHaveCount(5)

  await wave.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(wave.getByText('No sample is open.', { exact: true })).toBeVisible()
  await expect(wave.getByTestId('sample-editor')).toHaveCount(0)

  // The empty state offers the project's samples.
  await wave.getByRole('button', { name: 'Demo Kick', exact: true }).click()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
})

test("the Wave editor's empty state imports samples, offers eight of them and then the full list", async ({ page }) => {
  await page.goto('/?starter')
  const wave = await openView(page, 'Wave editor')
  await expect(wave.getByText('No sample is open.', { exact: true })).toBeVisible()
  await expect(wave.getByRole('button', { name: 'Show samples', exact: true })).toHaveCount(0)

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    wave.getByRole('button', { name: 'Import samples…', exact: true }).click(),
  ])
  await chooser.setFiles(Array.from({ length: 9 }, (_, i) => ({ name: `Tone ${i + 1}.wav`, mimeType: 'audio/wav', buffer: wav(220 + i * 110) })))
  await expect(wave.getByRole('button', { name: /^Tone \d$/ })).toHaveCount(8)

  await wave.getByRole('button', { name: 'Show samples', exact: true }).click()
  const samples = viewRoot(page, 'Samples')
  await expect(samples).toBeVisible()
  await expect(samples.getByRole('listitem')).toHaveCount(9)
})
