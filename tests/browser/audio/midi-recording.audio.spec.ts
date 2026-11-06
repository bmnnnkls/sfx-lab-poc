import type { Page } from '@playwright/test'
import { createDemoProject, serializeProject } from '../../../src/core'
import { test, expect, expectSaved, openFileMenu, openView, viewRoot } from '../support/fixtures'
import { installMidiPorts, sendMidi } from '../support/midi-ports'

/*
 * Recording on the real worklet: a take placed by the timestamps of fake MIDI ports plays back on the beats it was
 * played, and the metronome is heard live but never exported. The synth's sound is its note's gate, so a note is a
 * step up and a click is the only other thing that sounds.
 */

declare global {
  interface Window {
    __recordSamples: number[]
  }
}

const RATE_BEATS = 2 // beats per second at 120 BPM

const synthProject = () => {
  const demo = createDemoProject()
  return { ...demo, tempo: 120, tracks: demo.tracks.filter((t) => t.kind === 'instrument').slice(0, 1).map((t) => ({ ...t, name: 'Rec synth', patch: {
    nodes: [{ id: 'n', type: 'note', x: 0, y: 0, params: {} }, { id: 'o', type: 'output', x: 0, y: 0, params: {} }],
    connections: [{ id: 'w', from: { node: 'n', port: 'gate' }, to: { node: 'o', port: 'in' } }],
  }, clips: t.clips.map(() => null) })) }
}

/** Copies the engine's left channel on the render thread, so the samples are contiguous and frame-exact. */
const installCapture = (page: Page) => page.addInitScript(() => {
  const Original = window.AudioWorkletNode
  window.AudioWorkletNode = class extends Original {
    constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
      super(context, name, options)
      window.__recordSamples = []
      const url = URL.createObjectURL(new Blob([`
        class RecordCapture extends AudioWorkletProcessor {
          process(inputs) {
            const left = inputs[0]?.[0];
            if (left) this.port.postMessage(left.slice());
            return true;
          }
        }
        registerProcessor('record-capture', RecordCapture);
      `], { type: 'text/javascript' }))
      void context.audioWorklet.addModule(url).then(() => {
        const tap = new Original(context, 'record-capture'), mute = context.createGain()
        mute.gain.value = 0; this.connect(tap); tap.connect(mute); mute.connect(context.destination)
        tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          if (window.__recordSamples.length < 600000) window.__recordSamples.push(...data)
        }
      }).catch((error) => console.error(error)).finally(() => URL.revokeObjectURL(url))
    }
  }
})

/** The frames where a sound starts: the first sample at or above `on` after at least `quiet` frames with none. */
const risingEdges = (samples: ArrayLike<number>, on = 0.3, quiet = 200) => {
  const edges: number[] = []
  let last = -Infinity
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]!) < on) continue
    if (i - last > quiet) edges.push(i)
    last = i
  }
  return edges
}

/** The left channel of a 32-bit float stereo WAV. */
const leftOfWav = (bytes: Buffer): Float32Array => {
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4)
    if (id === 'data') {
      const frames = size / 8, left = new Float32Array(frames)
      for (let i = 0; i < frames; i++) left[i] = bytes.readFloatLE(at + 8 + i * 8)
      return left
    }
    at += 8 + size + (size % 2)
  }
  throw new Error('No data chunk in the exported WAV')
}

interface SavedNote { start: number; duration: number; pitch: number }
const savedClip = (page: Page) => page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('sfxlab:project') ?? '{}') as { project?: { tracks: Array<{ clips: Array<{ lengthBeats: number; notes: SavedNote[] } | null> }> } }
  return saved.project?.tracks[0]?.clips[0] ?? null
})

test('a recorded take plays back on the beats it was played; the click is live and never exported', async ({ page }) => {
  await page.addInitScript((project) => localStorage.setItem('sfxlab:project', project), serializeProject(synthProject()))
  await installMidiPorts(page); await installCapture(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()
  const rate = await page.evaluate(() => new AudioContext().sampleRate)

  // The metronome alone: clicks a beat apart in the live output.
  await page.getByRole('button', { name: 'Metronome', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__recordSamples?.length ?? 0)).toBeGreaterThan(4096)
  await page.evaluate(() => { window.__recordSamples = [] })
  await expect.poll(() => page.evaluate(() => window.__recordSamples.length), { timeout: 10_000 }).toBeGreaterThan(rate * 2.2)
  const clicks = risingEdges(await page.evaluate(() => window.__recordSamples), 0.05, 2000)
  expect(clicks.length).toBeGreaterThanOrEqual(3)
  // The bar's higher click crosses the threshold a few samples sooner; the engine's tests pin the exact frames.
  for (let i = 1; i < clicks.length; i++) expect(Math.abs(clicks[i]! - clicks[i - 1]! - rate / RATE_BEATS)).toBeLessThanOrEqual(32)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  // Record three notes, stamped a beat and then a beat and a half apart.
  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Arm Rec synth for recording', exact: true }).click()
  await session.getByRole('button', { name: 'Record a clip here', exact: true }).first().click()
  await expect(session.locator('[data-recording]')).toHaveAttribute('data-recording', 'recording')
  const base = await page.evaluate(() => performance.now() + 150)
  await page.waitForTimeout(1700)
  const stamps = [0, 500, 1250]
  for (const at of stamps) {
    await sendMidi(page, [0x90, 60, 127], 'keys', base + at)
    await sendMidi(page, [0x80, 60, 0], 'keys', base + at + 100)
  }
  await session.getByRole('button', { name: 'Stop recording Clip 1', exact: true }).click()
  await expect(session.locator('[data-recording]')).toHaveCount(0, { timeout: 15_000 })
  await expectSaved(page)
  const clip = (await savedClip(page))!
  expect(clip.notes).toHaveLength(3)
  // Within a render quantum and the timestamps' precision of what was played.
  const quantum = (128 / rate) * RATE_BEATS
  const starts = clip.notes.map((n) => n.start)
  stamps.forEach((at, i) => expect(Math.abs(starts[i]! - starts[0]! - (at / 1000) * RATE_BEATS)).toBeLessThanOrEqual(quantum + 0.002))
  for (const note of clip.notes) expect(Math.abs(note.duration - 0.2)).toBeLessThanOrEqual(quantum + 0.002)

  // The clip loops on: its notes sound a beat and a beat and a half apart, pass after pass. The click is off.
  await page.getByRole('button', { name: 'Metronome', exact: true }).click()
  await page.evaluate(() => { window.__recordSamples = [] })
  await expect.poll(() => page.evaluate(() => window.__recordSamples.length), { timeout: 20_000 }).toBeGreaterThan(rate * ((clip.lengthBeats + 1) / RATE_BEATS))
  const onsets = risingEdges(await page.evaluate(() => window.__recordSamples)).map((frame) => (frame / rate) * RATE_BEATS)
  expect(onsets.length).toBeGreaterThanOrEqual(4)
  const gaps = [1, 2, 3].map((i) => onsets[i]! - onsets[i - 1]!)
  const expected = [starts[1]! - starts[0]!, starts[2]! - starts[1]!, clip.lengthBeats - (starts[2]! - starts[0]!)]
  const rotation = [0, 1, 2].find((r) => Math.abs(gaps[0]! - expected[r]!) <= quantum)
  expect(rotation).toBeDefined()
  gaps.forEach((gap, i) => expect(Math.abs(gap - expected[(rotation! + i) % 3]!)).toBeLessThanOrEqual(quantum))
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  // With the metronome on, the export has the notes and nothing on the beats between them.
  await page.getByRole('button', { name: 'Metronome', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Metronome', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await openFileMenu(page)
  await page.getByRole('menuitem', { name: 'Export audio (WAV)…', exact: true }).click()
  await page.getByLabel('Tail (seconds)').fill('0')
  await page.getByLabel('Sample rate').selectOption(String(rate))
  await page.getByLabel('Bit depth').selectOption('32')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  const { readFile } = await import('node:fs/promises')
  const wav = leftOfWav(await readFile((await download.path())!))
  expect(risingEdges(wav)).toHaveLength(3)
  const beatFrames = rate / RATE_BEATS
  const quietBeats = Array.from({ length: clip.lengthBeats }, (_, beat) => beat).filter((beat) => clip.notes.every((n) => beat + 0.06 < n.start || beat > n.start + n.duration + 0.01))
  expect(quietBeats.length).toBeGreaterThan(0)
  for (const beat of quietBeats) {
    const from = Math.round(beat * beatFrames), to = Math.min(wav.length, from + Math.round(0.03 * rate))
    expect(Math.max(...Array.from(wav.subarray(from, to), Math.abs))).toBeLessThan(1e-6)
  }
})

test('a count-in clicks four beats a beat apart with the metronome off, then the take starts and the clicks stop', async ({ page }) => {
  await page.addInitScript((project) => localStorage.setItem('sfxlab:project', project), serializeProject(synthProject()))
  await page.addInitScript(() => localStorage.setItem('sfxlab:record', JSON.stringify({ countInBars: 1 })))
  await installMidiPorts(page); await installCapture(page)
  await page.goto('/')
  const rate = await page.evaluate(() => new AudioContext().sampleRate)
  await expect(page.getByRole('button', { name: 'Metronome', exact: true })).toHaveAttribute('aria-pressed', 'false')
  // Wake the audio first (an empty transport start and stop), so the capture runs before the count-in begins.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__recordSamples?.length ?? 0)).toBeGreaterThan(4096)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

  const session = viewRoot(page, 'Session')
  await session.getByRole('button', { name: 'Arm Rec synth for recording', exact: true }).click()
  await page.evaluate(() => { window.__recordSamples = [] })
  await session.getByRole('button', { name: 'Record a clip here', exact: true }).first().click()
  await expect(page.getByRole('status', { name: 'Count-in' })).toHaveText('Count-in 1')
  await expect(session.locator('[data-recording]')).toHaveAttribute('data-recording', 'recording', { timeout: 5000 })
  // Two more beats of the take itself, where nothing clicks.
  await expect.poll(() => page.evaluate(() => window.__recordSamples.length), { timeout: 10_000 }).toBeGreaterThan(rate * 3.2)
  const clicks = risingEdges(await page.evaluate(() => window.__recordSamples), 0.05, 2000)
  expect(clicks).toHaveLength(4)
  for (let i = 1; i < clicks.length; i++) expect(Math.abs(clicks[i]! - clicks[i - 1]! - rate / RATE_BEATS)).toBeLessThanOrEqual(32)
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
})

test('two passes of a one-bar loop brace record into one region that plays back where each note was played', async ({ page }) => {
  await page.addInitScript((project) => localStorage.setItem('sfxlab:project', project), serializeProject({ ...synthProject(), arrangementLoop: { from: 0, to: 4, enabled: true } }))
  await installMidiPorts(page); await installCapture(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'MIDI', exact: true }).click()
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click()
  await expect(page.getByRole('region', { name: 'MIDI settings', exact: true })).toContainText('MIDI: enabled')
  await page.getByRole('button', { name: 'Close MIDI settings' }).click()
  const rate = await page.evaluate(() => new AudioContext().sampleRate)
  const quantum = (128 / rate) * RATE_BEATS

  const arrangement = await openView(page, 'Arrangement')
  await arrangement.getByRole('button', { name: 'Arm Rec synth for recording', exact: true }).click()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect(arrangement.getByTestId('arrangement-recording-outline')).toBeVisible()
  // Two notes 2.5 s apart: five beats at 120 BPM, so one beat apart in the bar, a pass later.
  const base = await page.evaluate(() => performance.now() + 100)
  await page.waitForTimeout(2800)
  for (const at of [0, 2500]) {
    await sendMidi(page, [0x90, 60, 127], 'keys', base + at)
    await sendMidi(page, [0x80, 60, 0], 'keys', base + at + 100)
  }
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()
  await expectSaved(page)
  const region = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('sfxlab:project') ?? '{}') as { project?: { arrangement?: Array<{ startBeat: number; content: { lengthBeats: number; notes: SavedNote[] } }> } }
    return saved.project?.arrangement ?? []
  })
  expect(region).toHaveLength(1)
  expect(region[0]).toMatchObject({ startBeat: 0, content: { lengthBeats: 4 } })
  const notes = [...region[0]!.content.notes]
  expect(notes).toHaveLength(2)
  const apart = (((notes[1]!.start - notes[0]!.start) % 4) + 4) % 4
  // The second pass's note is a beat after the first's (or, sorted the other way, three beats).
  expect(Math.min(Math.abs(apart - 1), Math.abs(apart - 3))).toBeLessThanOrEqual(quantum + 0.002)

  // Played back with ● Rec off: the two notes, pass after pass, one and three beats apart.
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.evaluate(() => { window.__recordSamples = [] })
  await arrangement.getByRole('button', { name: 'Play arrangement', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__recordSamples.length), { timeout: 20_000 }).toBeGreaterThan(rate * 4.5)
  const onsets = risingEdges(await page.evaluate(() => window.__recordSamples)).map((frame) => (frame / rate) * RATE_BEATS)
  expect(onsets.length).toBeGreaterThanOrEqual(3)
  const sorted = notes.map((n) => n.start).sort((a, b) => a - b)
  const gaps = [sorted[1]! - sorted[0]!, 4 - (sorted[1]! - sorted[0]!)]
  for (let i = 1; i < onsets.length; i++) {
    const gap = onsets[i]! - onsets[i - 1]!
    expect(Math.min(...gaps.map((expected) => Math.abs(gap - expected)))).toBeLessThanOrEqual(quantum)
  }
  await arrangement.getByRole('button', { name: 'Stop', exact: true }).click()
})
