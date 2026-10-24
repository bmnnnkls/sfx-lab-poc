import { createDefaultFxGraph, createDefaultNoteGraph, noteGraphFrom, type EngineCommand, type Patch } from '../../src/core'
import { test, expect } from './fixtures'
import { installAudioTap, listen } from './audio-tap'

const patch: Patch = {
  nodes: [
    { id: 'note', type: 'note', x: 0, y: 0, params: {} },
    { id: 'osc', type: 'oscillator', x: 0, y: 0, params: { waveform: 0 } },
    { id: 'gain', type: 'gain', x: 0, y: 0, params: { gain: 0.2 } },
    { id: 'out', type: 'output', x: 0, y: 0, params: {} },
  ],
  connections: [
    { id: 'pitch', from: { node: 'note', port: 'frequency' }, to: { node: 'osc', port: 'frequency' } },
    { id: 'gate', from: { node: 'note', port: 'gate' }, to: { node: 'gain', port: 'cv' } },
    { id: 'sound', from: { node: 'osc', port: 'out' }, to: { node: 'gain', port: 'in' } },
    { id: 'out', from: { node: 'gain', port: 'out' }, to: { node: 'out', port: 'in' } },
  ],
}

// Portable simulated input at the real worklet's public, serializable command boundary. No browser MIDI API.
test('stopped worklet holds notes, sustains, runs note effects and cancels owned generated events', async ({ page }) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForFunction(() => !!window.__sendEngineCommand)
  const send = async (commands: EngineCommand[]) => page.evaluate((commands) => {
    for (const command of commands) window.__sendEngineCommand(command)
  }, commands)
  await send([{ type: 'track/add', kind: 'instrument', trackId: 'held', patch, noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(), clips: [], volume: 1, voices: 8 }])
  const a = { sourceId: 'keyboard', channel: 0, noteId: 'a' }
  const b = { sourceId: 'other', channel: 0, noteId: 'a' }
  await send([
    { type: 'track/noteOn', trackId: 'held', note: a, pitch: 60, velocity: 1 },
    { type: 'track/noteOn', trackId: 'held', note: b, pitch: 60, velocity: 1 },
  ])
  await page.waitForTimeout(1000) // Discard starter release tails; held input must outlast the 0.3-second audition.
  expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  await send([
    { type: 'notes/sustain', sourceId: 'keyboard', channel: 0, down: true },
    { type: 'track/noteOff', trackId: 'held', note: a },
    { type: 'track/noteOff', trackId: 'held', note: b },
  ])
  await page.waitForTimeout(300)
  expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  await send([{ type: 'notes/releaseSource', sourceId: 'keyboard' }])
  await page.waitForTimeout(300)
  expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)

  const graph = noteGraphFrom([
    { id: 'c', type: 'clipNotes' },
    { id: 't', type: 'transpose', params: { semitones: 12 } },
    { id: 'a', type: 'arpeggiator' },
    { id: 'e', type: 'echo' },
    { id: 'o', type: 'noteOut' },
  ], ['c.out>t.in', 't.out>a.in', 'a.out>e.in', 'e.out>o.in'])
  await send([
    { type: 'track/setNoteGraph', trackId: 'held', graph },
    { type: 'track/noteOn', trackId: 'held', note: { ...a, noteId: 'chord-c' }, pitch: 60, velocity: 1 },
    { type: 'track/noteOn', trackId: 'held', note: { ...a, noteId: 'chord-e' }, pitch: 64, velocity: 1 },
  ])
  expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  await send([{ type: 'notes/panic' }])
  await page.waitForTimeout(300)
  expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})
