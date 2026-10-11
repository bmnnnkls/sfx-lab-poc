import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(existsSync('/node-tools/node_modules/') ? '/node-tools/node_modules/' : '/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
const dir = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`)
const level = async (ms) => { let m = 0; const end = Date.now() + ms; while (Date.now() < end) { m = Math.max(m, Number(await page.locator('[data-peak]').first().getAttribute('data-peak'))); await page.waitForTimeout(30) } return m }
const surface = page.getByTestId('patch-surface')
const node = (title) => surface.locator('[data-testid^="node-"]').filter({ has: page.locator('[class*="nodeTitle"]', { hasText: new RegExp(`^${title}`) }) }).first()
const idOf = async (title) => (await node(title).getAttribute('data-testid')).replace('node-', '')
const wire = async (fromTitle, toTitle, fromPort = 'out', toPort = 'in') => {
  const a = await page.getByTestId(`out-${await idOf(fromTitle)}-${fromPort}`).boundingBox()
  const b = await page.getByTestId(`in-${await idOf(toTitle)}-${toPort}`).boundingBox()
  await page.mouse.move(a.x + a.width - 4, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 6, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}
const wireCount = () => surface.locator('[data-testid^="wire-"]').count()
const trackBtn = (name) => page.locator('[class*="_trackName_"]').filter({ hasText: new RegExp(`^${name}`) })
const add = (name) => page.getByRole('button', { name, exact: true }).click()
const effects = () => page.getByRole('button', { name: 'Effects', exact: true }).click()
const LOOP = 'Demo Drum Loop 120 BPM'

await page.goto('http://localhost:4173/')
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('sfxlab'); q.onsuccess = q.onerror = q.onblocked = () => r() }) })
await page.reload()

await page.getByRole('button', { name: 'Samples', exact: true }).click()
await page.getByRole('button', { name: 'Add demo samples' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 5, null, { timeout: 8000 })
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Audio track' }).click()
await page.getByRole('button', { name: 'Add audio clip' }).first().click()
await page.getByRole('menuitem', { name: LOOP }).click()
await page.getByLabel(/^Audio \d+ volume$/).fill('0') // the loop is not heard from its own track

// ---- Bass takes the loop's sound
await trackBtn('Bass').click()
await effects()
await add('Track audio')
const picker = surface.getByLabel('Take audio from track')
const options = await picker.locator('option').allTextContents()
check('the picker offers every other track, not the one being edited', options.includes('Lead') && options.includes('Pad') && options.some((o) => o.startsWith('Audio')) && !options.includes('Bass'), JSON.stringify(options))
await picker.selectOption({ label: options.find((o) => o.startsWith('Audio')) })
check('it has a Take choice, after the effects by default', (await node('Track audio').locator('select').nth(1).inputValue()) === '1')
await wire('Track audio', 'Track out')
check('Track audio -> Track out is wired', (await wireCount()) === 2, String(await wireCount()))
await page.screenshot({ path: `${dir}/trackaudio.png` })

await page.getByRole('button', { name: new RegExp(LOOP) }).first().click()
await page.waitForTimeout(2500)
const heard = await level(1500)
check('the loop is heard through Bass although its own track is turned all the way down', heard > 0.05, `peak=${heard.toFixed(3)}`)

// ---- take it before the effects too
await node('Track audio').locator('select').nth(1).selectOption('0')
await page.waitForTimeout(400)
check('switching the Take to before its effects keeps it sounding', (await level(1000)) > 0.05)

// ---- loops are refused: the loop track cannot take audio from Bass
await trackBtn('Audio').click()
await effects()
await add('Track audio')
const loopOptions = await surface.getByLabel('Take audio from track').locator('option').allTextContents()
check('the track that is taken from cannot take audio from its reader (a loop)', !loopOptions.includes('Bass') && loopOptions.includes('Lead'), JSON.stringify(loopOptions))

// ---- the send knob refuses the same loop through a return
await page.getByRole('button', { name: 'Add track' }).click()
await page.getByRole('menuitem', { name: 'Return track' }).click()
await page.getByRole('button', { name: 'Mixer', exact: true }).click() // the send knobs live in the mixer
check('a send knob for a return is there for the track that takes audio from nobody', (await page.getByLabel('Lead send to Return A').isEnabled()))
await trackBtn('Bass').click()
await effects()
const bassPicker = surface.getByLabel('Take audio from track')
await bassPicker.selectOption({ label: 'Return A' })
await page.getByRole('button', { name: 'Mixer', exact: true }).click()
check('once Bass takes audio from a return, its own send knob for it is disabled (it would be a loop)', await page.getByLabel('Bass send to Return A').isDisabled())
await effects()
await bassPicker.selectOption({ label: options.find((o) => o.startsWith('Audio')) })

// ---- the master graph cannot use it
await page.getByRole('button', { name: 'Master', exact: true }).click()
check('the master palette has no Track audio (the master runs on the whole mix)', (await page.getByRole('button', { name: 'Track audio', exact: true }).count()) === 0)

// ---- removing the source: nothing crashes, the sound is gone; undo brings it back
await page.getByRole('button', { name: 'Remove Audio 4' }).click()
await page.waitForTimeout(600)
check('after removing the source track there is silence and no error', (await level(800)) < 0.005)
await trackBtn('Bass').click()
await effects()
check('the picker is empty again', (await surface.getByLabel('Take audio from track').inputValue()) === '')
await page.getByRole('button', { name: 'Undo' }).click()
await page.waitForTimeout(500)
await trackBtn('Bass').click()
await effects()
check('undo brings the track back with the input pointing at it', (await surface.getByLabel('Take audio from track').inputValue()) !== '')

// ---- persistence
await page.reload()
await trackBtn('Bass').click()
await effects()
check('the input survives a reload', (await surface.getByLabel('Take audio from track').inputValue()) !== '' && (await wireCount()) === 2)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
