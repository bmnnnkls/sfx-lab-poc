import { createRequire } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
const require = createRequire('/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)
const toasts = () => page.locator('[role=status]').allTextContents()

/** Highest output level seen over `ms` of polling the meter. */
const maxLevel = async (ms) => {
  let max = 0
  const end = Date.now() + ms
  while (Date.now() < end) {
    max = Math.max(max, Number(await page.locator('[data-peak]').first().getAttribute('data-peak')))
    await page.waitForTimeout(40)
  }
  return max
}

// A real 16-bit WAV (0.5 s, 440 Hz) to import through the real file input + real decodeAudioData.
const wav = (() => {
  const rate = 44100, n = rate / 2, buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5 * 32767), 44 + i * 2)
  return buf
})()

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

// --- Samples tab, empty state
await page.getByRole('button', { name: 'Samples', exact: true }).click()
check('empty state explained', (await page.getByText('No samples yet').count()) === 1)

// --- import a real wav file through the file input
await page.getByTestId('sample-input').setInputFiles({ name: 'my tone.wav', mimeType: 'audio/wav', buffer: wav })
await page.waitForSelector('text=my tone')
check('wav imported and listed', (await page.getByText('my tone', { exact: true }).count()) === 1)
check('metadata shown', (await page.getByText(/0\.50 s · mono · \.wav/).count()) === 1)
await page.waitForFunction(() => document.querySelector('[data-status="ready"]'), null, { timeout: 5000 })
check('decoded and ready', (await page.locator('[data-status="ready"]').count()) === 1)
check('import toast', (await toasts()).some((t) => t.includes('Added sample "my tone"')))

// importing the same file again dedupes by hash
await page.getByTestId('sample-input').setInputFiles({ name: 'copy of tone.wav', mimeType: 'audio/wav', buffer: wav })
await page.waitForTimeout(600)
check('same bytes are not added twice', (await page.locator('li').count()) === 1)

// non-audio rejected
await page.getByTestId('sample-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
await page.waitForTimeout(600)
check('non-audio file rejected with a message', (await toasts()).some((t) => t.includes('Could not add "notes.txt"')))

// --- demo samples
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 6, null, { timeout: 8000 })
check('5 demo samples added (6 total, all ready)', (await page.locator('li').count()) === 6)

// --- preview is audible
const idle = await maxLevel(300)
await page.getByRole('button', { name: 'Preview Demo Kick' }).click()
const previewLevel = await maxLevel(900)
check('preview makes sound on the output meter', previewLevel > 0.1 && idle < 0.01, `idle=${idle} preview=${previewLevel.toFixed(2)}`)

// --- make a sampler track from the kick, then play it
await page.locator('li', { hasText: 'Demo Kick' }).getByText('New sampler track').click()
check('switches to the instrument editor', (await page.getByLabel('Voices').count()) === 1)
check('sampler node shows the chosen sample', (await page.getByLabel('Sample', { exact: true }).inputValue()) !== '')
check('sampler root note displayed as a note name', (await page.getByText('C4', { exact: true }).count()) >= 1)
await page.getByRole('button', { name: 'Launch scene 1' }).click()
const trackLevel = await maxLevel(2500)
check('sampler track plays through the real worklet', trackLevel > 0.05, `peak=${trackLevel.toFixed(2)}`)
await page.screenshot({ path: `${dir}/08-sampler.png` })
await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

// --- reload: samples + track persist; audio comes back from IndexedDB
await page.waitForTimeout(900)
await page.reload()
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 6, null, { timeout: 8000 })
check('samples reload from IndexedDB', (await page.locator('li').count()) === 6)
await page.getByRole('button', { name: 'Launch scene 1' }).click()
check('sampler track still plays after reload', (await maxLevel(2500)) > 0.05)
await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

// --- export a package, wipe the browser, import it elsewhere
await page.getByText('File', { exact: true }).click()
const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Export to file…').click()])
const exportPath = `${dir}/exported.sfxlab`
await download.saveAs(exportPath)
check('package file name', download.suggestedFilename() === 'demo-project.sfxlab', download.suggestedFilename())
check('package is a zip with audio inside', readFileSync(exportPath).subarray(0, 4).toString('hex') === '504b0304' && statSync(exportPath).size > 100000, `${statSync(exportPath).size} bytes`)

await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
check('fresh browser has no samples', (await page.evaluate(() => document.querySelectorAll('li').length)) === 0)
await page.getByText('File', { exact: true }).click()
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Import from file…').click()])
await chooser.setFiles(exportPath)
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 6, null, { timeout: 8000 })
check('package import restores all samples', (await page.locator('li').count()) === 6)
check('package import toast has no warnings', (await toasts()).some((t) => t.startsWith('Imported "Demo project"') && !t.includes('notes')))
await page.getByRole('button', { name: 'Launch scene 1' }).click()
check('imported sampler track plays', (await maxLevel(2500)) > 0.05)
await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

// --- audio missing: remove the stored bytes and reload
await page.waitForTimeout(900)
await page.evaluate(async () => { await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.waitForSelector('[data-status="missing"]')
check('missing audio is flagged, not fatal', (await page.locator('[data-status="missing"]').count()) === 6)
// re-adding the demo samples restores them (same hash)
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length >= 5, null, { timeout: 8000 })
check('re-importing the original restores a missing sample', (await page.locator('[data-status="ready"]').count()) >= 5)

// --- removing a sample clears sampler nodes that used it, and undo brings it back
await page.getByRole('button', { name: 'Demo Kick', exact: true }).click() // select the sampler track
await page.getByRole('button', { name: 'Instrument' }).click()
const picker = page.getByLabel('Sample', { exact: true })
check('sampler points at the kick before removal', (await picker.inputValue()) !== '')
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.locator('li', { hasText: 'Demo Kick' }).getByRole('button', { name: 'Remove Demo Kick' }).click()
await page.getByRole('button', { name: 'Instrument' }).click()
check('removing the sample clears the node reference', (await picker.inputValue()) === '')
await page.getByRole('button', { name: 'Undo' }).click()
check('undo restores the reference', (await picker.inputValue()) !== '')
await page.getByRole('button', { name: 'Samples', exact: true }).click()
check('undo restores the sample in the library', (await page.locator('li', { hasText: 'Demo Kick' }).count()) === 1)
await page.waitForFunction(() => document.querySelector('li [data-status="ready"]') && [...document.querySelectorAll('li')].find((li) => li.textContent.includes('Demo Kick')).querySelector('[data-status="ready"]'), null, { timeout: 8000 })
check('and its audio reloads into the engine (status ready)', true)

console.log('page errors:', JSON.stringify(errors.filter((e) => !e.includes('Failed to load resource'))))
await browser.close()
