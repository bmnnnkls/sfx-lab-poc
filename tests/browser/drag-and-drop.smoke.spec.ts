import { test, expect, dragView, openView, viewRoot } from './fixtures'

test('a view tab dragged across the session grid docks as before and changes no slot', async ({ page }) => {
  await page.goto('/?starter')
  const session = await openView(page, 'Session')
  const slots = async () => session.locator('button[aria-label^="Edit "]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  const before = await slots()
  await openView(page, 'Mixer')
  await dragView(page, 'Mixer', 'Session', 'right')
  await expect(viewRoot(page, 'Mixer')).toBeVisible()
  await expect(session).toBeVisible()
  expect(await slots()).toEqual(before)
  await expect(session.locator('[data-drop]')).toHaveCount(0)
})

test("the panel's controls still reorder by dragging their handle in edit mode", async ({ page }) => {
  await page.goto('/?starter')
  const instrument = await openView(page, 'Instrument')
  await instrument.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Panel', exact: true }).click()
  await instrument.getByRole('button', { name: 'Edit panel', exact: true }).click()
  const form = instrument.getByRole('form', { name: 'Add a control' })
  await form.getByLabel('Control type', { exact: true }).selectOption('knob')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await form.getByLabel('Control type', { exact: true }).selectOption('switch')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  const handles = instrument.getByRole('group', { name: 'Front panel' }).locator('[aria-label^="Drag "]')
  const order = () => handles.evaluateAll((spans) => spans.map((span) => span.getAttribute('aria-label')))
  await expect(handles).toHaveCount(2)
  const [first, second] = await order()
  const cells = instrument.locator('[data-testid^="control-"]')
  await handles.nth(1).dragTo(cells.first())
  await expect.poll(order).toEqual([second, first])
})

test('audio files dropped on Samples are still imported', async ({ page }) => {
  await page.goto('/?starter')
  const samples = await openView(page, 'Samples')
  await samples.evaluate((root) => {
    // A short silent WAV, built in the page: 8 kHz, 16-bit mono, 800 frames.
    const frames = 800, bytes = new DataView(new ArrayBuffer(44 + frames * 2))
    const text = (at: number, value: string) => [...value].forEach((char, i) => bytes.setUint8(at + i, char.charCodeAt(0)))
    text(0, 'RIFF'); bytes.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true); bytes.setUint32(24, 8000, true)
    bytes.setUint32(28, 16000, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); text(36, 'data'); bytes.setUint32(40, frames * 2, true)
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes.buffer], 'Dropped.wav', { type: 'audio/wav' }))
    const target = root.querySelector('ul, p') ?? root
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect(samples.getByText('Dropped', { exact: true })).toBeVisible()
})
