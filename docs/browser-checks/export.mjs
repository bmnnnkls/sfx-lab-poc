// File > Export audio (WAV)...: the dialog, the download and what is in the file. The check reads the bytes of the downloaded
import { demoSampleCount } from './registry.mjs'
// file, so it listens to nothing live and needs no audio tap; nothing in it waits for a time to pass, only for the download event.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
const require = createRequire(existsSync('/node-tools/node_modules/') ? '/node-tools/node_modules/' : '/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const dir = process.argv[2] ?? '.'
const DEMO_SAMPLES = await demoSampleCount()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)

const dialog = () => page.getByRole('dialog', { name: 'Export audio' })
const field = (label) => dialog().getByLabel(label, { exact: true })
const openDialog = async () => {
  await page.locator('summary', { hasText: 'File' }).click()
  await page.getByRole('button', { name: 'Export audio (WAV)…' }).click()
  await dialog().waitFor()
}

/** Reads a WAV the way a player does: the header fields, then every frame of both channels. */
const parseWav = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4))
  const chunks = {}
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true)
    chunks[tag(at)] = { at: at + 8, size }
    at += 8 + size + (size % 2)
  }
  const fmt = chunks['fmt '].at
  const header = {
    riff: tag(0), wave: tag(8), riffSize: view.getUint32(4, true), format: view.getUint16(fmt, true), channels: view.getUint16(fmt + 2, true),
    sampleRate: view.getUint32(fmt + 4, true), blockAlign: view.getUint16(fmt + 12, true), bits: view.getUint16(fmt + 14, true), dataSize: chunks.data.size,
  }
  const frames = header.dataSize / header.blockAlign
  let peak = 0
  let right = 0
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < header.channels; c++) {
      const at = chunks.data.at + i * header.blockAlign + (c * header.bits) / 8
      const value = Math.abs(header.bits === 32 ? view.getFloat32(at, true) : view.getInt16(at, true) / 32767)
      peak = Math.max(peak, value)
      if (c === 1) right = Math.max(right, value)
    }
  }
  return { header, frames, peak, right }
}

/** Presses Export and takes the download it causes. */
const exportFile = async () => {
  const [download] = await Promise.all([page.waitForEvent('download'), dialog().getByRole('button', { name: 'Export', exact: true }).click()])
  const path = await download.path()
  await dialog().waitFor({ state: 'detached' })
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) }
}

await page.goto('http://localhost:4173/?starter')
await page.evaluate(() => localStorage.clear())
await page.reload()
const tempo = Number(await page.getByLabel('BPM').inputValue())
const projectName = await page.getByLabel('Project name').inputValue()

// ---- the dialog
await openDialog()
check('the File menu offers Export audio and it opens a dialog', (await dialog().count()) === 1)
check('with no clip open it starts on Scene 1', await dialog().getByRole('radio', { name: 'Scene' }).isChecked())
check('the open-clip choice is off while no clip is open', await dialog().getByRole('radio', { name: /Selected clip/ }).isDisabled())
check('it asks for bars, tail, sample rate, bit depth and normalize', (await Promise.all([field('Bars').count(), field('Tail (seconds)').count(), field('Sample rate').count(), field('Bit depth').count(), field('Normalize to -1 dBFS').count()])).every((n) => n === 1))
check('the bars default to the scene played once through (the demo pad is 8 beats: 2 bars)', (await field('Bars').inputValue()) === '2')
check('an empty scene has nothing to export and Export is off', await (async () => {
  await field('Scene').selectOption({ label: '4 (empty)' })
  const off = await dialog().getByRole('button', { name: 'Export', exact: true }).isDisabled()
  await field('Scene').selectOption({ label: '1' })
  return off
})())
await page.screenshot({ path: `${dir}/export-dialog.png` })

// ---- Cancel downloads nothing and closes
let downloaded = false
const watch = () => { downloaded = true }
page.on('download', watch)
await dialog().getByRole('button', { name: 'Cancel' }).click()
check('Cancel closes the dialog', (await dialog().count()) === 0)
page.off('download', watch)
check('...and nothing was downloaded', !downloaded)

// ---- a 16-bit file at 44.1 kHz, twice
await openDialog()
await field('Sample rate').selectOption({ label: '44100 Hz' })
await field('Tail (seconds)').fill('2')
const first = await exportFile()
const wav = parseWav(first.bytes)
const stem = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
check('the file is named after the project', first.name === `${stem}.wav`, first.name)
check('it is a WAV: RIFF, WAVE, PCM', wav.header.riff === 'RIFF' && wav.header.wave === 'WAVE' && wav.header.format === 1)
check('two channels at the chosen rate, 16 bits', wav.header.channels === 2 && wav.header.sampleRate === 44100 && wav.header.bits === 16, JSON.stringify(wav.header))
check('the sizes in the header match the bytes', wav.header.riffSize === first.bytes.length - 8 && wav.header.dataSize === wav.frames * 4)
const body = Math.round(((2 * 4 * 60) / tempo) * 44100)
check('it holds the two bars and some of the tail, no more than the 2 s asked', wav.frames >= body && wav.frames <= body + 2 * 44100, `${wav.frames} frames, body ${body}`)
check('there is sound in it', wav.peak > 0.05, `peak ${wav.peak.toFixed(3)}`)
check('and a toast says so', (await page.getByRole('status').filter({ hasText: 'Exported' }).count()) >= 1)

await openDialog()
await field('Sample rate').selectOption({ label: '44100 Hz' })
await field('Tail (seconds)').fill('2')
const second = await exportFile()
check('exporting the same thing again gives identical bytes', second.bytes.length === first.bytes.length && first.bytes.every((value, i) => value === second.bytes[i]))

// ---- 32-bit float, normalized, no tail
await openDialog()
await field('Bit depth').selectOption({ label: '32-bit float' })
await field('Normalize to -1 dBFS').check()
await field('Tail (seconds)').fill('0')
const floaty = parseWav((await exportFile()).bytes)
check('32-bit float is format 3 with 32 bits at 48 kHz', floaty.header.format === 3 && floaty.header.bits === 32 && floaty.header.sampleRate === 48000, JSON.stringify(floaty.header))
check('normalized: the peak is -1 dBFS', Math.abs(floaty.peak - 10 ** (-1 / 20)) < 1e-3, `peak ${floaty.peak.toFixed(4)}`)
check('with no tail the file is exactly the bars', floaty.frames === Math.round(((2 * 4 * 60) / tempo) * 48000), `${floaty.frames} frames`)

// ---- the open clip, half a bar
await page.getByRole('button', { name: 'Edit Root' }).click()
await openDialog()
check('with a clip open, the dialog starts on it and names it', await dialog().getByRole('radio', { name: /Selected clip/ }).isChecked())
check('...with its track and clip in the label', /Bass: Root/.test((await dialog().getByRole('radio', { name: /Selected clip/ }).locator('xpath=..').textContent()) ?? ''))
check('...and its own length as the default bars (4 beats: 1 bar)', (await field('Bars').inputValue()) === '1')
await field('Bars').fill('0.5')
await field('Tail (seconds)').fill('0')
const clipWav = parseWav((await exportFile()).bytes)
check('half a bar at this tempo is exactly 2 beats of frames', clipWav.frames === Math.round(((0.5 * 4 * 60) / tempo) * 48000), `${clipWav.frames} frames`)
check('the clip alone is sound, not silence', clipWav.peak > 0.02, `peak ${clipWav.peak.toFixed(3)}`)

// ---- a clip that plays a library sample: the app has to fetch and decode the audio itself
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction((count) => document.querySelectorAll('[data-status="ready"]').length === count, DEMO_SAMPLES, { timeout: 8000 })
await page.locator('li', { hasText: 'Demo Kick' }).getByRole('button', { name: 'New audio track' }).click()
await openDialog()
check('the new audio clip is the open clip', /Demo Kick/.test((await dialog().getByRole('radio', { name: /Selected clip/ }).locator('xpath=..').textContent()) ?? ''))
await field('Tail (seconds)').fill('0')
const kick = parseWav((await exportFile()).bytes)
check('the sample is decoded and played into the file', kick.peak > 0.05 && kick.frames > 0, `peak ${kick.peak.toFixed(3)}, ${kick.frames} frames`)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
