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
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
const info = () => page.getByTestId('audio-speed').textContent()
const LOOP = 'Demo Drum Loop 120 BPM'
const undo = () => page.getByRole('button', { name: 'Undo' }).click()
const resetState = async () => page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })

await page.goto('http://localhost:4173/?starter')
await resetState()
await page.reload()

// ---- samples + an audio track
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
check('five demo samples ready, including the drum loop', (await page.getByText(LOOP, { exact: true }).count()) === 1)

await page.getByRole('button', { name: 'Add track' }).click()
const labels = await page.getByRole('menuitem').allTextContents()
check('the + button offers instrument and audio tracks', labels.includes('Instrument track') && labels.includes('Audio track'), JSON.stringify(labels))
await page.getByRole('menuitem', { name: 'Audio track' }).click()
check('an audio track appears, tagged', (await page.getByText('audio', { exact: true }).count()) >= 1 && (await page.getByRole('button', { name: 'Add audio clip' }).count()) === 4)

// ---- add a clip from the sample library
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
const choices = await page.getByRole('menuitem').allTextContents()
check('empty audio slot lists the library samples', choices.includes(LOOP) && choices.includes('Demo Kick'), JSON.stringify(choices))
await page.getByRole('menuitem', { name: LOOP }).click()
check('the new clip opens in the audio clip editor', (await page.getByTestId('audio-waveform').count()) === 1)
const speedText = await info()
check('tempo-locked clip explains how it is being played (120 BPM loop at 110 BPM)', /×0\.92 speed \(−1\.5 semitones\) at 110 BPM/.test(speedText), speedText)
const pixels = await page.getByTestId('audio-waveform').locator('canvas').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n })
check('the waveform is drawn', pixels > 500, `${pixels} px`)
check('the length was worked out from the "120 BPM" in the name (4 beats)', (await page.getByLabel('Clip length in beats').inputValue()) === '4')
await page.screenshot({ path: `${dir}/15-audio-clip.png` })

// ---- play it
check('silent before launching', (await level(300)) < 0.01)
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
const heard = await level(2500)
check('launching the clip makes sound through the real worklet', heard > 0.1, `peak=${heard.toFixed(3)}`)
check('the slot shows it playing', (await page.locator('[class*="_playing_"]').count()) >= 1)
const ph1 = await page.getByTestId('audio-waveform').locator('[class*="_playhead_"]').evaluate((e) => parseFloat(e.style.left))
await page.waitForTimeout(500)
const ph2 = await page.getByTestId('audio-waveform').locator('[class*="_playhead_"]').evaluate((e) => parseFloat(e.style.left))
check('a playhead moves along the waveform', ph1 !== ph2, `${ph1.toFixed(1)}% -> ${ph2.toFixed(1)}%`)

// ---- tempo lock: change the project tempo while playing
await page.locator('input[type=number]').first().fill('120')
await page.waitForTimeout(400)
check('the explanation follows the tempo (now exactly 1x)', /×1\.00 speed \(\+0\.0 semitones\) at 120 BPM/.test(await info()), await info())
check('still sounding after a tempo change', (await level(1500)) > 0.1)
await page.locator('input[type=number]').first().fill('90')
await page.waitForTimeout(300)
check('and at 90 BPM it slows down', /×0\.75 speed/.test(await info()), await info())
check('...still sounding', (await level(1200)) > 0.1)

// ---- gain
await page.getByLabel('Gain').fill('0')
await page.waitForTimeout(400)
check('gain 0 silences it', (await level(800)) < 0.005)
await undo()
await page.waitForTimeout(300)
check('undo restores the gain in one step', (await page.getByLabel('Gain').inputValue()) === '100')
check('...and the sound', (await level(1000)) > 0.1)

// ---- warp off + loop off => plays once at native speed and finishes
await page.getByLabel('Warp mode').selectOption('off')
check('warp off hides the beat length and says so', (await page.getByLabel('Clip length in beats').count()) === 0 && /original speed/.test(await info()))
await page.getByRole('checkbox', { name: 'Loop' }).uncheck()
await page.getByRole('button', { name: /■ Demo Drum Loop|▶ Demo Drum Loop/ }).first().click() // relaunch so it starts fresh
await page.waitForTimeout(500)
await level(300)
await page.waitForTimeout(7500) // next bar + the 2 s sample at 90 bpm... well past the end
check('a one-shot finishes by itself (silence, and no longer shown as playing)', (await level(800)) < 0.005 && (await page.locator('[class*="_playing_"]').count()) === 0)
await page.getByRole('checkbox', { name: 'Loop' }).check()
await page.getByLabel('Warp mode').selectOption('repitch')

// ---- length + fit to tempo
const len = page.getByLabel('Clip length in beats')
await len.fill('8'); await len.press('Enter')
await page.waitForTimeout(200)
check('doubling the length halves the speed', /×0\.38 speed/.test(await info()), await info())
await page.getByRole('button', { name: 'Fit to tempo' }).click()
await page.waitForTimeout(200)
check('Fit to tempo restores the natural length', (await len.inputValue()) === '4')

// ---- context menu on the slot
await page.locator('button', { hasText: LOOP }).first().locator('xpath=..').click({ button: 'right' })
const slotMenu = await page.getByRole('menuitem').allTextContents()
check('audio slots have a context menu too', ['Launch clip', 'Edit clip', 'Delete clip'].every((l) => slotMenu.some((t) => t.includes(l) || t === 'Restart clip')), JSON.stringify(slotMenu))
await page.keyboard.press('Escape')

// ---- instrument tab guard
await page.getByRole('button', { name: /^Audio 4/ }).click()
await page.getByRole('button', { name: 'Instrument' }).click()
check('an audio track has no instrument to edit (and says so)', (await page.getByText(/is an audio track/).count()) === 1)

// ---- persistence across reload
await page.waitForTimeout(900)
await page.reload()
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length >= 5, null, { timeout: 8000 })
check('audio track and clip survive a reload', (await page.locator('button', { hasText: LOOP }).count()) >= 1 && (await page.getByText('audio', { exact: true }).count()) >= 1)
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
check('and play again', (await level(3000)) > 0.1)
await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

// ---- all tracks together: launch a scene with instruments and audio
await page.getByRole('button', { name: 'Launch scene 1' }).click()
const together = await level(2500)
check('a scene launches instrument and audio tracks together', together > 0.15, `peak=${together.toFixed(3)}`)
await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

// ---- package export + import into a clean browser
await page.getByText('File', { exact: true }).click()
const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Export to file…').click()])
const exportPath = `${dir}/audio-project.sfxlab`
await download.saveAs(exportPath)
check('a project with audio clips exports as a package with the audio inside', download.suggestedFilename().endsWith('.sfxlab') && statSync(exportPath).size > 100000 && readFileSync(exportPath).subarray(0, 4).toString('hex') === '504b0304', `${statSync(exportPath).size} bytes`)
await resetState()
await page.reload()
await page.getByText('File', { exact: true }).click()
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Import from file…').click()])
await chooser.setFiles(exportPath)
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length >= 5, null, { timeout: 8000 })
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
check('imported audio clips play in a fresh browser', (await level(3000)) > 0.1)
await page.getByRole('button', { name: 'Stop', exact: true }).first().click()

// ---- removing the sample removes the clips that use it; undo brings them back
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.locator('li', { hasText: LOOP }).getByRole('button', { name: `Remove ${LOOP}` }).click()
check('removing the sample removes the audio clips using it', (await page.locator('button', { hasText: LOOP }).count()) === 0)
await undo()
check('undo brings sample and clips back', (await page.locator('button', { hasText: LOOP }).count()) >= 1)

// ---- New audio track from the Samples tab
await page.locator('li', { hasText: 'Demo Kick' }).getByRole('button', { name: 'New audio track' }).click()
check('"New audio track" opens the new clip in the editor', (await page.getByTestId('audio-waveform').count()) === 1 && (await page.getByText('Demo Kick', { exact: false }).count()) >= 1)
const kickLen = await page.getByLabel('Clip length in beats').inputValue()
check('a one-shot-length sample gets a sensible short loop length', Number(kickLen) >= 1 && Number(kickLen) <= 2, `length=${kickLen}`)

console.log('page errors:', JSON.stringify(errors.filter((e) => !e.includes('Failed to load resource'))))
await browser.close()
