import { test, expect, openView, viewRoot } from './fixtures'
import type { Page } from '@playwright/test'

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

  await wave.getByRole('button', { name: 'Close sample', exact: true }).click()
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

/** A 4 s stereo 16-bit WAV at 48 kHz: a decaying 220 Hz tone on the left, a 330 Hz one on the right. */
const stereoWav = (): Buffer => {
  const rate = 48000
  const frames = rate * 4
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    const decay = Math.exp(-((i % rate) / rate) * 3)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * decay * 16000), i * 4)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * decay * 8000), i * 4 + 2)
  }
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

/** Drags across the detail view from `from` to `to` (fractions of its width), at `y` (a fraction of its height). */
const dragAcross = async (page: Page, detail: ReturnType<Page['locator']>, from: number, to: number, y = 0.5) => {
  const box = (await detail.boundingBox())!
  await page.mouse.move(box.x + box.width * from, box.y + box.height * y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * ((from + to) / 2), box.y + box.height * y, { steps: 4 })
  await page.mouse.move(box.x + box.width * to, box.y + box.height * y, { steps: 4 })
  await page.mouse.up()
}

test('a stereo sample opens with a lane per channel, zooms to single samples, selects, plays and keeps its view', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Stereo 98 BPM.wav', mimeType: 'audio/wav', buffer: stereoWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Stereo 98 BPM' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()

  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByRole('img', { name: 'Left', exact: true })).toBeVisible()
  await expect(wave.getByRole('img', { name: 'Right', exact: true })).toBeVisible()
  const detail = wave.getByTestId('wave-detail')
  const status = wave.getByTestId('wave-status')
  await expect(detail).toHaveAttribute('data-draw', 'peaks')
  await expect(wave.getByRole('scrollbar', { name: 'Waveform position' })).toBeVisible()

  // A drag in the top quarter of the left lane selects the left channel only; in the middle, both.
  await dragAcross(page, detail, 0.3, 0.4, 0.05)
  await expect(status).toContainText('left only')
  await dragAcross(page, detail, 0.3, 0.5)
  await expect(status).toContainText('Selection 0:01.')
  await expect(status).not.toContainText('only')
  const selected = await status.textContent()

  // ⌘/Ctrl with the wheel zooms around the pointer, from the pyramid to the audio to single samples.
  const box = (await detail.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.keyboard.down('Control')
  for (const band of ['frames', 'points']) {
    await expect(async () => {
      await page.mouse.wheel(0, -400)
      await expect(detail).toHaveAttribute('data-draw', band, { timeout: 200 })
    }).toPass()
  }
  await page.keyboard.up('Control')
  const viewMenu = wave.getByRole('button', { name: 'View', exact: true })
  await viewMenu.click()
  await page.getByRole('menuitem', { name: 'Zoom to fit', exact: true }).click()
  await expect(detail).toHaveAttribute('data-draw', 'peaks')

  // The ruler counts beats, at the project's tempo or the one in the sample's name; View ▾ checks what is in effect.
  await viewMenu.click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Time', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemcheckbox', { name: 'Beats', exact: true }).click()
  await expect(wave.locator('[data-ruler]')).toHaveAttribute('data-ruler', 'beats')
  await viewMenu.click()
  await page.getByRole('menuitemcheckbox', { name: 'Tempo from the name (98 BPM)', exact: true }).click()
  await viewMenu.click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Tempo from the name (98 BPM)', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemcheckbox', { name: /^Project tempo/ })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('menuitemcheckbox', { name: 'Time', exact: true }).click()
  await expect(wave.locator('[data-ruler]')).toHaveAttribute('data-ruler', 'time')

  // ▶ plays the selection, looping, with a playhead that moves.
  await wave.getByRole('button', { name: 'Loop', exact: true }).click()
  await wave.getByRole('button', { name: 'Play selection', exact: true }).click()
  const playhead = wave.getByTestId('wave-playhead')
  await expect(playhead).toBeVisible()
  const first = await playhead.evaluate((element) => (element as HTMLElement).style.left)
  await expect.poll(() => playhead.evaluate((element) => (element as HTMLElement).style.left)).not.toBe(first)
  await wave.getByRole('button', { name: 'Stop preview', exact: true }).click()
  await expect(playhead).toHaveCount(0)

  // Another tab and back: the selection is still there.
  await openView(page, 'Session')
  await openView(page, 'Wave editor')
  await expect(status).toHaveText(selected!)
})

test('an edit in place survives a reload, and the clip that played the sample plays the edited one', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  const kick = samples.getByRole('listitem').filter({ hasText: 'Demo Kick' })
  await kick.getByRole('button', { name: 'New audio track', exact: true }).click()
  await kick.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  await wave.getByRole('button', { name: 'Process', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Reverse', exact: true }).click()

  type Saved = { samples: Array<{ id: string; name: string; origin?: string }>; tracks: Array<{ kind: string; clips: Array<{ sampleId?: string } | null> }> }
  const saved = () => page.evaluate(() => (JSON.parse(localStorage.getItem('sfxlab:project') ?? '{"project":{"samples":[],"tracks":[]}}') as { project: Saved }).project)
  const edited = async () => (await saved()).samples.find((sample) => sample.name === 'Demo Kick' && sample.origin)
  await expect.poll(edited).toBeTruthy()
  const { id } = (await edited())!

  await page.reload()
  const after = await openView(page, 'Samples')
  // The edited file was stored before the project named it, so every sample loads.
  await expect(after.locator('[data-status="ready"]')).toHaveCount(5)
  const project = await saved()
  expect(project.samples.filter((sample) => sample.name === 'Demo Kick').map((sample) => sample.id)).toEqual([id])
  const clips = project.tracks.filter((track) => track.kind === 'audio').flatMap((track) => track.clips).filter((clip) => clip !== null)
  expect(clips.map((clip) => clip.sampleId)).toEqual([id])
})

/** The selection's start and end in seconds, from the editor's status line. */
const selectionOf = async (wave: ReturnType<Page['locator']>) => {
  const text = (await wave.getByTestId('wave-status').textContent()) ?? ''
  const match = /^Selection (\d+):(\d+\.\d+) – (\d+):(\d+\.\d+)/.exec(text)
  if (!match) throw new Error(`No selection in "${text}"`)
  return { from: Number(match[1]) * 60 + Number(match[2]), to: Number(match[3]) * 60 + Number(match[4]) }
}

test('a session clip, its region and a sampler open their sample in the Wave editor, at the part they play', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByRole('button', { name: 'Add demo samples', exact: true }).click()
  await expect(samples.locator('[data-status="ready"]')).toHaveCount(5)
  await samples.getByRole('listitem').filter({ hasText: 'Demo Kick' }).getByRole('button', { name: 'New audio track', exact: true }).click()
  await samples.getByRole('listitem').filter({ hasText: 'Demo Snare' }).getByRole('button', { name: 'New sampler track', exact: true }).click()

  // The clip, trimmed to start about halfway, opens its sample with the trim selected.
  const session = await openView(page, 'Session')
  await session.getByRole('button', { name: 'Edit Demo Kick', exact: true }).click()
  const clip = viewRoot(page, 'Clip')
  const handle = clip.getByTestId('trim-start')
  const waveform = (await clip.getByTestId('audio-waveform').boundingBox())!
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(waveform.x + waveform.width / 2, grip.y + grip.height / 2, { steps: 4 })
  await page.mouse.up()
  const start = Number(await handle.getAttribute('aria-valuenow')) / 100
  expect(start).toBeGreaterThan(0.3)
  await clip.getByRole('button', { name: 'Edit sample', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  await expect(wave.getByTestId('wave-status')).toContainText('Selection')
  const fromClip = await selectionOf(wave)
  expect(fromClip.from / fromClip.to).toBeCloseTo(start, 1)
  await wave.getByRole('button', { name: 'Close sample', exact: true }).click()

  // A region is a copy of the clip, trim and all; its menu opens the same part.
  await (await openView(page, 'Session')).getByRole('button', { name: '▶ Demo Kick', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Place on arrangement' }).click()
  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByTestId('arrangement-region').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit sample' }).click()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Kick')
  await expect(wave.getByTestId('wave-status')).toContainText('Selection')
  expect(await selectionOf(wave)).toEqual(fromClip)

  // The sampler's Edit opens the sample it plays.
  await (await openView(page, 'Session')).getByRole('button', { name: 'Demo Snare', exact: true }).click()
  const instrument = await openView(page, 'Instrument')
  await instrument.locator('[data-node]', { hasText: 'Sampler' }).locator('[data-header]').dblclick()
  await instrument.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(wave.getByTestId('sample-editor')).toContainText('Demo Snare')
})

test('Gain on the left channel of a selection changes only the left lane, and undo takes it back', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Stereo.wav', mimeType: 'audio/wav', buffer: stereoWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Stereo' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  const [left, right] = [wave.getByRole('img', { name: 'Left', exact: true }), wave.getByRole('img', { name: 'Right', exact: true })]
  await expect(left).toBeVisible()
  await dragAcross(page, wave.getByTestId('wave-detail'), 0.2, 0.6, 0.05)
  await expect(wave.getByTestId('wave-status')).toContainText('left only')
  // Once the selection settles, the status bar shows its levels.
  await expect(wave.getByTestId('wave-levels')).toHaveText(/^Peak −\d+\.\d dBFS · RMS −\d+\.\d dBFS$/)
  const before = { left: await left.screenshot(), right: await right.screenshot() }

  await wave.getByRole('button', { name: 'Process', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Gain…', exact: true }).click()
  const dialog = wave.getByRole('dialog', { name: 'Gain' })
  await dialog.getByLabel('Gain', { exact: true }).fill('-6')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await left.screenshot()).equals(before.left)).toBe(false)
  expect((await right.screenshot()).equals(before.right)).toBe(true)
  // The selection stays, so the edit can be repeated or undone in place.
  await expect(wave.getByTestId('wave-status')).toContainText('left only')

  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(async () => (await left.screenshot()).equals(before.left)).toBe(true)
  expect((await right.screenshot()).equals(before.right)).toBe(true)
})

test('a cut part pastes at the cursor; the length and the status line agree, and two undos bring the sample back', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Stereo.wav', mimeType: 'audio/wav', buffer: stereoWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Stereo' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  const detail = wave.getByTestId('wave-detail')
  const status = wave.getByTestId('wave-status')
  await expect(wave.getByRole('img', { name: 'Left', exact: true })).toBeVisible()
  const duration = async () =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('sfxlab:project') ?? '{"project":{"samples":[]}}') as { project: { samples: Array<{ name: string; durationSeconds: number }> } }).project.samples.find((sample) => sample.name === 'Stereo')?.durationSeconds)
  await expect.poll(duration).toBe(4)
  const paste = wave.getByRole('button', { name: 'Paste', exact: true })
  await expect(paste).toBeDisabled()

  await dragAcross(page, detail, 0.2, 0.4)
  const cut = await selectionOf(wave)
  const length = cut.to - cut.from
  await wave.getByRole('button', { name: 'Cut', exact: true }).click()
  // The cursor sits at the join; the sample is shorter by the cut.
  await expect(status).toHaveText(new RegExp(`^Cursor 0:0${Math.floor(cut.from)}\\.`))
  await expect.poll(duration).toBeCloseTo(4 - length, 2)

  // A click puts the cursor near the end; Paste inserts the cut there and selects it.
  const box = (await detail.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await expect(status).toContainText('Cursor')
  await expect(paste).toBeEnabled()
  await paste.click()
  await expect(status).toContainText('Selection')
  const pasted = await selectionOf(wave)
  expect(pasted.to - pasted.from).toBeCloseTo(length, 2)
  await expect.poll(duration).toBeCloseTo(4, 3)

  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(duration).toBeCloseTo(4 - length, 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(duration).toBe(4)
})

/** Imports the stereo test file and opens it in the Wave editor; returns the editor's parts and the saved duration. */
const openStereo = async (page: Page) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.getByTestId('sample-input').setInputFiles({ name: 'Stereo.wav', mimeType: 'audio/wav', buffer: stereoWav() })
  const row = samples.getByRole('listitem').filter({ hasText: 'Stereo' })
  await expect(row.locator('[data-status="ready"]')).toHaveCount(1)
  await row.getByRole('button', { name: '✎', exact: true }).click()
  const wave = viewRoot(page, 'Wave editor')
  await expect(wave.getByRole('img', { name: 'Left', exact: true })).toBeVisible()
  const duration = async () =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('sfxlab:project') ?? '{"project":{"samples":[]}}') as { project: { samples: Array<{ name: string; durationSeconds: number }> } }).project.samples.find((sample) => sample.name === 'Stereo')?.durationSeconds)
  await expect.poll(duration).toBe(4)
  return { wave, detail: wave.getByTestId('wave-detail'), status: wave.getByTestId('wave-status'), duration }
}

test('the right-click menu cuts the selection, ⌘V pastes it at the cursor, and a right-click outside moves the cursor', async ({ page }) => {
  const { wave, detail, status, duration } = await openStereo(page)
  await dragAcross(page, detail, 0.2, 0.4)
  const cut = await selectionOf(wave)
  const box = (await detail.boundingBox())!

  // Inside the selection: the menu acts on it.
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Cut', exact: true }).click()
  await expect(status).toHaveText(new RegExp(`^Cursor 0:0${Math.floor(cut.from)}\\.`))
  await expect.poll(duration).toBeCloseTo(4 - (cut.to - cut.from), 2)

  // A click puts the cursor near the end; ⌘V with the lanes focused pastes there.
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await expect(detail).toBeFocused()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(status).toContainText('Selection')
  await expect.poll(duration).toBeCloseTo(4, 3)

  // Outside the selection, a right-click clears it and puts the cursor there.
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2, { button: 'right' })
  await expect(status).toHaveText(/^Cursor 0:00\./)
  await expect(page.getByRole('menuitem', { name: 'Paste', exact: true })).toBeEnabled()
  await page.keyboard.press('Escape')
})

test('Delete with the lanes focused deletes the selection, not while typing a name, and the palette lists the edits', async ({ page }) => {
  const { wave, detail, status, duration } = await openStereo(page)
  await dragAcross(page, detail, 0.5, 0.75)
  const selected = await selectionOf(wave)

  // In the project's name, Delete is the field's.
  await page.getByLabel('Project name', { exact: true }).click()
  await page.keyboard.press('Delete')
  await expect(status).toContainText('Selection')

  // With the lanes focused, the palette offers the selection's actions.
  await detail.focus()
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Commands', exact: true })
  await page.keyboard.type('gain')
  await expect(palette.getByRole('option').first()).toHaveText('Selection in Stereo: Gain…')
  await page.keyboard.press('Escape')
  await expect(detail).toBeFocused()

  await page.keyboard.press('Delete')
  await expect(status).toHaveText(new RegExp(`^Cursor 0:0${Math.floor(selected.from)}\\.`))
  await expect.poll(duration).toBeCloseTo(4 - (selected.to - selected.from), 2)
})

test('the view keys select with Shift+→, zoom to it with Z, clear it with Escape, and P plays and stops', async ({ page }) => {
  const { wave, detail, status } = await openStereo(page)
  const box = (await detail.boundingBox())!
  const overviewBox = wave.getByRole('scrollbar', { name: 'Waveform position' }).locator('div')
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
  await expect(detail).toBeFocused()

  // Ten columns: the fitted view has 4 s across the detail's width.
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight')
  const selected = await selectionOf(wave)
  expect(selected.to - selected.from).toBeCloseTo((10 * 4) / box.width, 2)

  const before = (await overviewBox.boundingBox())!.width
  await page.keyboard.press('z')
  await expect.poll(async () => (await overviewBox.boundingBox())!.width).toBeLessThan(before / 10)
  await page.keyboard.press('Shift+Z')
  await expect.poll(async () => (await overviewBox.boundingBox())!.width).toBeCloseTo(before, 0)

  await page.keyboard.press('Escape')
  await expect(status).toHaveText(`Cursor 0:${selected.from.toFixed(3).padStart(6, '0')}`)

  await page.keyboard.press('p')
  await expect(wave.getByTestId('wave-playhead')).toBeVisible()
  await page.keyboard.press('p')
  await expect(wave.getByTestId('wave-playhead')).toHaveCount(0)
})

test('the shortcuts dialog lists the Wave editor keys', async ({ page }) => {
  await page.goto('/?starter')
  await page.getByRole('banner').getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts', exact: true }).click()
  const views = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }).getByRole('region', { name: 'In the views' })
  await expect(views.getByText('Wave editor: Zoom to the selection, zoom to fit', { exact: true })).toBeVisible()
  await expect(views.getByText('Wave editor: Extend the selection from the cursor', { exact: true })).toBeVisible()
})
