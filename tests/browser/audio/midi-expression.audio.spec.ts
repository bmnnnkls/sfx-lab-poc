import { createDefaultFxGraph, createDemoProject, serializeProject, type Patch } from '../../../src/core'
import { test, expect } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'
import { installAudioTap, listen } from '../support/audio-tap'

/**
 * One instrument track whose sound is a level, not a tone, so the tap's peak reads it: in `pitch`, how far the held
 * note's (bent) frequency is from A4, 0.01 per semitone; in `mod`, the mod wheel (CC 1) at a tenth.
 */
const oneSynth = (patch: Patch) => {
  const demo = createDemoProject()
  return { ...demo, tracks: demo.tracks.filter((t) => t.kind === 'instrument').slice(0, 1).map((t) => ({ ...t, name: 'Expression synth', patch, fx: createDefaultFxGraph(), clips: t.clips.map(() => null) })) }
}
const pitch: Patch = {
  nodes: [
    { id: 'n', type: 'note', x: 0, y: 0, params: {} },
    { id: 'midi', type: 'hzToMidi', x: 0, y: 0, params: {} },
    { id: 'less', type: 'subtract', x: 0, y: 0, params: { b: 69 } },
    { id: 'scale', type: 'multiply', x: 0, y: 0, params: { b: 0.01 } },
    { id: 'o', type: 'output', x: 0, y: 0, params: {} },
  ],
  connections: [
    { id: 'w1', from: { node: 'n', port: 'frequency' }, to: { node: 'midi', port: 'hz' } },
    { id: 'w2', from: { node: 'midi', port: 'out' }, to: { node: 'less', port: 'a' } },
    { id: 'w3', from: { node: 'less', port: 'out' }, to: { node: 'scale', port: 'a' } },
    { id: 'w4', from: { node: 'scale', port: 'out' }, to: { node: 'o', port: 'in' } },
  ],
}
/** The mod wheel through a MIDI CC node at a tenth; the output belongs to the voices, so a note must be held. */
const mod: Patch = {
  nodes: [
    { id: 'cc', type: 'midiCC', x: 0, y: 0, params: { cc: 1 } },
    { id: 'scale', type: 'multiply', x: 0, y: 0, params: { b: 0.1 } },
    { id: 'o', type: 'output', x: 0, y: 0, params: {} },
  ],
  connections: [
    { id: 'w1', from: { node: 'cc', port: 'value' }, to: { node: 'scale', port: 'a' } },
    { id: 'w2', from: { node: 'scale', port: 'out' }, to: { node: 'o', port: 'in' } },
  ],
}

const start = async (page: import('@playwright/test').Page, patch: Patch) => {
  await page.addInitScript((project) => localStorage.setItem('sfxlab:project', project), serializeProject(oneSynth(patch)))
  await installMidiPorts(page); await installAudioTap(page); await page.goto('/')
  await page.getByRole('button', { name: 'Expression synth', exact: true }).click()
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
}
/** The tap's buffer still holds a little of what came before a change, so let it pass before listening. */
const level = async (page: import('@playwright/test').Page) => {
  await page.waitForTimeout(250)
  return Math.max(...(await listen(page)).peak)
}

test('the pitch wheel bends a held note in the real worklet by the bend range, and ■ puts it back', async ({ page }) => {
  await start(page, pitch)
  await sendMidi(page, [0x90, 69, 127])
  expect(await level(page)).toBeLessThan(0.002)
  await sendMidi(page, [0xe0, 127, 127])
  const atTwo = await level(page)
  expect(atTwo).toBeGreaterThan(0.01)
  await page.getByLabel('Bend range of Expression synth').fill('12')
  const atTwelve = await level(page)
  // Six times as far, give or take the output's soft clip and the pan law.
  expect(atTwelve / atTwo).toBeGreaterThan(5)
  expect(atTwelve / atTwo).toBeLessThan(6.5)
  await sendMidi(page, [0xe0, 0, 64])
  expect(await level(page)).toBeLessThan(0.002)
  await sendMidi(page, [0xe0, 0, 0])
  expect(await level(page)).toBeGreaterThan(0.05)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await sendMidi(page, [0x90, 69, 127])
  expect(await level(page)).toBeLessThan(0.002)
})

test('an unmapped mod wheel reaches the MIDI CC node in the real worklet; Panic puts it back', async ({ page }) => {
  await start(page, mod)
  // The output runs per voice, so it sounds while a note is held.
  await sendMidi(page, [0x90, 60, 127])
  expect(await level(page)).toBeLessThan(0.002)
  await sendMidi(page, [0xb0, 1, 127])
  expect(await level(page)).toBeGreaterThan(0.03)
  await page.getByRole('button', { name: 'Panic', exact: true }).click()
  await sendMidi(page, [0x90, 60, 127])
  expect(await level(page)).toBeLessThan(0.002)
})
