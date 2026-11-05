import { createDemoProject, serializeProject } from '../../../src/core'
import { test, expect } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'
import { installAudioTap, listen } from '../support/audio-tap'

test('fake browser ports play and release real stopped worklet notes on sustain, disconnect and panic', async ({ page }) => {
  const demo = createDemoProject()
  const project = { ...demo, tracks: demo.tracks.filter((t) => t.kind === 'instrument').slice(0, 1).map((t) => ({ ...t, name: 'MIDI test synth', patch: {
    nodes: [{ id: 'n', type: 'note', x: 0, y: 0, params: {} }, { id: 'o', type: 'output', x: 0, y: 0, params: {} }],
    connections: [{ id: 'w', from: { node: 'n', port: 'gate' }, to: { node: 'o', port: 'in' } }],
  }, clips: t.clips.map(() => null) })) }
  await page.addInitScript((project) => localStorage.setItem('sfxlab:project', project), serializeProject(project))
  await installMidiPorts(page); await installAudioTap(page); await page.goto('/')
  await page.getByRole('button', { name: 'MIDI test synth', exact: true }).click()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await sendMidi(page, [0x90, 60, 127]); await sendMidi(page, [0xb0, 64, 127]); await sendMidi(page, [0x80, 60, 0])
  expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  await sendMidi(page, [0xb0, 64, 0]); await page.waitForTimeout(200)
  expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)
  await sendMidi(page, [0x90, 60, 127]); await sendMidi(page, [0x90, 64, 127], 'other')
  await page.evaluate(() => window.__midiTest.connected('keys', false))
  expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  await page.getByRole('button', { name: 'Panic', exact: true }).click(); await page.waitForTimeout(200)
  expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)
  await sendMidi(page, [0x90, 67, 127], 'other')
  await page.getByRole('button', { name: 'Disable MIDI', exact: true }).click(); await page.waitForTimeout(200)
  expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)
})
