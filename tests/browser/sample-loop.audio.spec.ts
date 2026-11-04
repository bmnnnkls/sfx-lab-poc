import { createDefaultFxGraph, createDefaultNoteGraph, createSamplerPatch, setNodeParam, type EngineCommand } from '../../src/core'
import { test, expect } from './fixtures'
import { installAudioTap, listen } from './audio-tap'

/*
 * A sampler in loop mode with the sample's loop, on the real worklet (round 11c). The sample is silent but for a tone
 * from frame 1000 to 2000, and the sampler starts at its middle, past the tone: without a loop it repeats the silent
 * second half; with a loop over the tone it plays on to the end once, then repeats the tone while the note is held.
 */

const SILENT = 0.0001
const ID = 'e'.repeat(64)

test('a looped sampler repeats the loop while the note is held, and the silent second half without it', async ({ page }) => {
  await installAudioTap(page)
  await page.goto('/?starter')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForFunction(() => !!window.__sendEngineCommand)
  const send = async (commands: EngineCommand[]) => page.evaluate((commands) => {
    for (const command of commands) window.__sendEngineCommand(command)
  }, commands)

  let patch = createSamplerPatch(ID)
  const sampler = patch.nodes.find((node) => node.type === 'sampler')!
  patch = setNodeParam(setNodeParam(patch, sampler.id, 'mode', 2), sampler.id, 'start', 0.5)
  // The loop before the audio, as a bounce sends them.
  await send([{ type: 'sample/setLoop', sampleId: ID, loop: { from: 1000, to: 2000 } }])
  await page.evaluate((id) => {
    const channel = Float32Array.from({ length: 4800 }, (_, i) => (i >= 1000 && i < 2000 ? 0.5 * Math.sin((2 * Math.PI * i) / 100) : 0))
    window.__sendEngineCommand({ type: 'sample/add', sample: { id, sampleRate: 48000, channels: [channel] } })
  }, ID)
  await send([
    { type: 'track/add', kind: 'instrument', trackId: 'looped', patch, noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(), clips: [], volume: 1, voices: 1 },
    { type: 'track/noteOn', trackId: 'looped', note: { sourceId: 'keyboard', channel: 0, noteId: 'held' }, pitch: 60, velocity: 1 },
  ])
  await page.waitForTimeout(1000) // Discard the starter's release tails.
  expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.1)

  // Without the loop, the held voice plays out the tone, then repeats the silent half from Start.
  await send([{ type: 'sample/setLoop', sampleId: ID, loop: null }])
  await page.waitForTimeout(300)
  expect(Math.max(...(await listen(page)).peak)).toBeLessThan(SILENT)
})
