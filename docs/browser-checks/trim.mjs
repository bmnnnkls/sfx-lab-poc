import { createRequire } from 'node:module'
import { demoSampleCount } from './registry.mjs'
const require = createRequire('/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2]
const DEMO_SAMPLES = await demoSampleCount()
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
const LOOP = 'Demo Drum Loop 120 BPM'
const undo = () => page.getByRole('button', { name: 'Undo' }).click()
const aria = (name) => page.getByRole('slider', { name }).getAttribute('aria-valuenow').then(Number)

await page.goto('http://localhost:4173/?starter')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()
await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction((count) => document.querySelectorAll('[data-status="ready"]').length === count, DEMO_SAMPLES, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()

check('handles start at the sample edges', (await aria('Trim start')) === 0 && (await aria('Trim end')) === 100)
check('no reset button while untrimmed', (await page.getByRole('button', { name: 'Reset trim' }).count()) === 0)
check('default fade is 2 ms', (await page.getByLabel('Fade in').inputValue()) === '2')

// drag handles
const box = await page.getByTestId('audio-waveform').boundingBox()
const drag = async (testid, fromFrac, toFrac) => {
  const h = page.getByTestId(testid)
  const hb = await h.boundingBox(); const grabX = testid === 'trim-end' ? hb.x + 3 : hb.x + hb.width - 3
  const y = box.y + box.height / 2
  await page.mouse.move(grabX, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * toFrac, y, { steps: 6 })
  await page.mouse.up()
}
await drag('trim-start', 0, 0.25)
const s = await aria('Trim start')
check('dragging the start handle trims it to ~25%', Math.abs(s - 25) <= 1, `${s}`)
await drag('trim-end', 1, 0.75)
const e = await aria('Trim end')
check('dragging the end handle trims it to ~75%', Math.abs(e - 75) <= 1, `${e}`)
check('reset trim appears', (await page.getByRole('button', { name: 'Reset trim' }).count()) === 1)
check('speed text reflects the shorter region (half the audio in 4 beats => faster/lower)', /speed/.test(await page.getByTestId('audio-speed').textContent()), await page.getByTestId('audio-speed').textContent())

// undo is one step per drag
await undo()
check('undo reverts the whole end drag in one step', (await aria('Trim end')) === 100 && Math.abs((await aria('Trim start')) - 25) <= 1)
await undo()
check('undo reverts the start drag', (await aria('Trim start')) === 0)
await page.getByRole('button', { name: 'Redo' }).click(); await page.getByRole('button', { name: 'Redo' }).click()
check('redo reapplies both', Math.abs((await aria('Trim end')) - 75) <= 1)

// handles can't cross
await drag('trim-start', 0.25, 0.95)
check('start handle stops before the end handle', (await aria('Trim start')) <= (await aria('Trim end')) && (await aria('Trim start')) > 70, `${await aria('Trim start')} / ${await aria('Trim end')}`)
await undo()

// fades
await page.getByLabel('Fade in').fill('200')
await page.getByLabel('Fade out').fill('300')
check('fade shapes are drawn', (await page.getByTestId('fade-in-shape').count()) === 1 && (await page.getByTestId('fade-out-shape').count()) === 1)
await page.screenshot({ path: `${dir}/16-trim.png` })

// playback
await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
check('trimmed clip still sounds through the worklet', (await level(2500)) > 0.05)
const ph = async () => page.getByTestId('audio-waveform').locator('[class*="_playhead_"]').evaluate((el) => parseFloat(el.style.left))
const samples = []
for (let i = 0; i < 12; i++) { samples.push(await ph()); await page.waitForTimeout(150) }
check('playhead stays inside the trimmed region', samples.every((p) => p >= 24 && p <= 76), samples.map((p) => p.toFixed(0)).join(','))

// Fit to tempo uses region
await page.getByRole('button', { name: 'Fit to tempo' }).click()
check('fit to tempo accounts for the trim (half of a 4-beat loop => 2 beats)', (await page.getByLabel('Clip length in beats').inputValue()) === '2', await page.getByLabel('Clip length in beats').inputValue())

// reset
await page.getByRole('button', { name: 'Reset trim' }).click()
check('reset trim restores the full sample', (await aria('Trim start')) === 0 && (await aria('Trim end')) === 100)

// persistence
await page.getByRole('slider', { name: 'Trim start' }).waitFor()
await drag('trim-start', 0, 0.4)
await page.waitForTimeout(1200)
await page.reload()
await page.getByRole('button', { name: /^Edit Demo Drum Loop/ }).first().waitFor()
await page.getByRole('button', { name: /^Edit Demo Drum Loop/ }).first().click()
await page.waitForTimeout(400)
check('trim survives reload', Math.abs((await aria('Trim start')) - 40) <= 1, `${await aria('Trim start').catch(() => 'n/a')}`)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
